import { contentBox } from 'escpos-web-print';
import JsBarcode from 'jsbarcode';
import qrcode from 'qrcode-generator';
import { dither, paint, toGray } from './dither';
import { docSize, type BarcodeElement, type DitherAlgo, type Doc, type Element, type Fill, type ImageElement, type QrElement, type ShapeElement, type TextElement } from './doc';
import { fontStack } from './fonts';
import { expandTokens, type TokenContext } from './tokens';

type Ctx = CanvasRenderingContext2D;

qrcode.stringToBytes = (value: string) => Array.from(new TextEncoder().encode(value));

const images = new Map<string, HTMLImageElement>();
const pendingImages = new Map<string, Promise<void>>();
type Layer = { canvas: HTMLCanvasElement; pad: number };

const layers = new Map<string, Layer>();
const MAX_LAYERS = 160;

export function invalidateLayers() {
  for (const key of [...layers.keys()]) {
    if (key.startsWith('text|')) {
      layers.delete(key);
    }
  }
}

export function loadImage(src: string) {
  if (!src || images.has(src)) {
    return Promise.resolve();
  }
  const pending = pendingImages.get(src);
  if (pending) {
    return pending;
  }
  const promise = new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => {
      images.set(src, image);
      resolve();
    };
    image.onerror = () => resolve();
    image.src = src;
  });
  pendingImages.set(src, promise);
  return promise;
}

const trims = new Map<string, { x: number; y: number; width: number; height: number }>();

function sourceBox(element: ImageElement, image: HTMLImageElement) {
  if (!element.trim) {
    return { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  }
  let box = trims.get(element.src);
  if (!box) {
    box = contentBox(image);
    trims.set(element.src, box);
  }
  return box;
}

export function imageSize(src: string) {
  const image = images.get(src);
  return image ? { width: image.naturalWidth, height: image.naturalHeight } : null;
}

export function wholePixelSize(element: ImageElement) {
  const image = images.get(element.src);
  if (!image) {
    return null;
  }
  const box = sourceBox(element, image);
  const raw = element.w / box.width;
  const scale = raw >= 1 ? Math.max(1, Math.round(raw)) : 1 / Math.max(1, Math.round(1 / raw));
  return { w: Math.round(box.width * scale), h: Math.round(box.height * scale), scale };
}

export function imageAspect(src: string, trim = false) {
  const image = images.get(src);
  if (!image) {
    return null;
  }
  const box = trim ? sourceBox({ src, trim } as ImageElement, image) : { width: image.naturalWidth, height: image.naturalHeight };
  return box.width / box.height;
}

function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = Math.max(1, Math.round(width));
  element.height = Math.max(1, Math.round(height));
  return element;
}

const measureCanvas = canvas(1, 1);
const measureCtx = measureCanvas.getContext('2d')!;

function fontString(element: TextElement) {
  return `${element.italic ? 'italic ' : ''}${element.weight} ${element.size}px ${fontStack(element.font)}`;
}

const CJK = /[　-鿿＀-￯぀-ヿ]/;

function tokenize(line: string) {
  const parts: string[] = [];
  let word = '';
  for (const char of line) {
    if (CJK.test(char)) {
      if (word) {
        parts.push(word);
        word = '';
      }
      parts.push(char);
    } else if (char === ' ') {
      parts.push(`${word} `);
      word = '';
    } else {
      word += char;
    }
  }
  if (word) {
    parts.push(word);
  }
  return parts;
}

export function layoutText(element: TextElement, text: string) {
  measureCtx.font = fontString(element);
  measureCtx.letterSpacing = `${element.letterSpacing}px`;
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const part of tokenize(paragraph)) {
      const candidate = line + part;
      if (line && measureCtx.measureText(candidate.trimEnd()).width > element.w) {
        lines.push(line.trimEnd());
        line = part.trimStart();
      } else {
        line = candidate;
      }
    }
    lines.push(line.trimEnd());
  }
  const lineHeight = element.size * element.lineHeight;
  return { lines, lineHeight, height: Math.ceil(lines.length * lineHeight) };
}

export function textInkSpan(element: TextElement, tokens: TokenContext) {
  const { lines } = layoutText(element, expandTokens(element.text, tokens));
  measureCtx.font = fontString(element);
  measureCtx.letterSpacing = `${element.letterSpacing}px`;
  const width = Math.min(element.w, Math.max(element.size, ...lines.map((line) => measureCtx.measureText(line).width)));
  const start = element.align === 'left' ? 0 : element.align === 'center' ? (element.w - width) / 2 : element.w - width;
  return { start, width };
}

export function fitTextHeight(element: TextElement, tokens?: TokenContext) {
  return Math.max(element.size, layoutText(element, tokens ? expandTokens(element.text, tokens) : element.text).height);
}

function drawText(ctx: Ctx, element: TextElement, tokens: TokenContext) {
  const { lines, lineHeight } = layoutText(element, expandTokens(element.text, tokens));
  ctx.font = fontString(element);
  ctx.letterSpacing = `${element.letterSpacing}px`;
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  ctx.textAlign = element.align;
  const x = element.align === 'left' ? 0 : element.align === 'center' ? element.w / 2 : element.w;
  lines.forEach((line, index) => ctx.fillText(line, x, index * lineHeight + lineHeight / 2));
}

function drawImage(ctx: Ctx, element: ImageElement) {
  const image = images.get(element.src);
  if (!image) {
    return;
  }
  const w = Math.round(element.w);
  const h = Math.round(element.h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  const inner = frameInset(element, w, h);
  const box = sourceBox(element, image);
  const place = placeImage(element, inner, box.width / box.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(inner.x, inner.y, inner.w, inner.h);
  ctx.clip();
  ctx.imageSmoothingEnabled = !element.pixelated;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, box.x, box.y, box.width, box.height, place.x, place.y, place.w, place.h);
  ctx.restore();
  const data = ctx.getImageData(0, 0, w, h);
  const gray = toGray(data.data, { brightness: element.brightness, contrast: element.contrast, gamma: element.gamma });
  ctx.putImageData(paint(dither(gray, w, h, element.dither, element.threshold), data), 0, 0);
  if (element.frame && element.frame !== 'none') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, inner.y);
    ctx.fillRect(0, inner.y + inner.h, w, h - inner.y - inner.h);
    ctx.fillRect(0, 0, inner.x, h);
    ctx.fillRect(inner.x + inner.w, 0, w - inner.x - inner.w, h);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    if (element.frame === 'polaroid') {
      ctx.lineWidth = 1;
      ctx.strokeRect(inner.x - 0.5, inner.y - 0.5, inner.w + 1, inner.h + 1);
    }
  }
}

const samples = new Map<string, Record<string, string>>();

export function ditherSamples(element: ImageElement, algos: DitherAlgo[]) {
  const image = images.get(element.src);
  if (!image) {
    return null;
  }
  const key = `${element.src.length}|${element.src.slice(-64)}|${element.w}|${element.h}|${element.fit}|${element.trim}|${element.pixelated}|${element.frame}|${element.framePad}|${element.frameBottom}|${element.cropZoom}|${element.cropX}|${element.cropY}|${element.brightness}|${element.contrast}|${element.gamma}|${element.threshold}`;
  const cached = samples.get(key);
  if (cached) {
    return cached;
  }
  const inner = frameInset(element, Math.round(element.w), Math.round(element.h));
  const size = Math.max(8, Math.min(96, inner.w, inner.h));
  const left = Math.round(inner.x + (inner.w - size) / 2);
  const top = Math.round(inner.y + (inner.h - size) / 2);
  const source = canvas(element.w, element.h);
  const sourceCtx = source.getContext('2d', { willReadFrequently: true })!;
  sourceCtx.fillStyle = '#fff';
  sourceCtx.fillRect(0, 0, source.width, source.height);
  const box = sourceBox(element, image);
  const place = placeImage(element, inner, box.width / box.height);
  sourceCtx.drawImage(image, box.x, box.y, box.width, box.height, place.x, place.y, place.w, place.h);
  const crop = sourceCtx.getImageData(left, top, size, size);
  const gray = toGray(crop.data, { brightness: element.brightness, contrast: element.contrast, gamma: element.gamma });
  const result: Record<string, string> = {};
  const out = canvas(size, size);
  const outCtx = out.getContext('2d')!;
  for (const algo of algos) {
    const data = outCtx.createImageData(size, size);
    outCtx.putImageData(paint(dither(gray, size, size, algo, element.threshold), data), 0, 0);
    result[algo] = out.toDataURL();
  }
  samples.set(key, result);
  if (samples.size > 12) {
    samples.delete(samples.keys().next().value!);
  }
  return result;
}

type Rect = { x: number; y: number; w: number; h: number };

export function placeImage(element: ImageElement, inner: Rect, ratio: number) {
  let w = inner.w;
  let h = inner.h;
  if (element.fit !== 'stretch') {
    if (inner.w / inner.h > ratio === (element.fit === 'cover')) {
      h = inner.w / ratio;
    } else {
      w = inner.h * ratio;
    }
  }
  const zoom = Math.max(1, element.cropZoom ?? 1);
  w *= zoom;
  h *= zoom;
  const overflowX = w - inner.w;
  const overflowY = h - inner.h;
  const panX = Math.max(-1, Math.min(1, element.cropX ?? 0));
  const panY = Math.max(-1, Math.min(1, element.cropY ?? 0));
  return {
    x: inner.x + (inner.w - w) / 2 - (overflowX > 0 ? (panX * overflowX) / 2 : 0),
    y: inner.y + (inner.h - h) / 2 - (overflowY > 0 ? (panY * overflowY) / 2 : 0),
    w,
    h,
    overflowX,
    overflowY
  };
}

export function cropOverflow(element: ImageElement) {
  const image = images.get(element.src);
  if (!image) {
    return null;
  }
  const inner = frameInset(element, Math.round(element.w), Math.round(element.h));
  const box = sourceBox(element, image);
  const place = placeImage(element, inner, box.width / box.height);
  return { x: place.overflowX, y: place.overflowY };
}

export function frameDefaults(frame: NonNullable<ImageElement['frame']>, w: number) {
  return frame === 'polaroid' ? { pad: Math.round(w * 0.06), bottom: Math.round(w * 0.24) } : { pad: 8, bottom: 8 };
}

export function frameInset(element: Pick<ImageElement, 'frame' | 'framePad' | 'frameBottom'>, w: number, h: number) {
  const frame = element.frame ?? 'none';
  if (frame === 'none') {
    return { x: 0, y: 0, w, h };
  }
  const defaults = frameDefaults(frame, w);
  const pad = Math.max(0, Math.min(w / 2 - 4, element.framePad ?? defaults.pad));
  const bottom = frame === 'polaroid' ? Math.max(0, element.frameBottom ?? defaults.bottom) : pad;
  return { x: pad, y: pad, w: Math.max(8, w - pad * 2), h: Math.max(8, h - pad - bottom) };
}

function drawQr(ctx: Ctx, element: QrElement, data: string) {
  if (!data) {
    return;
  }
  const code = qrcode(0, element.ecc);
  code.addData(data);
  code.make();
  const count = code.getModuleCount();
  const size = Math.min(element.w, element.h);
  const cell = Math.max(1, Math.floor(size / count));
  const offsetX = Math.floor((element.w - cell * count) / 2);
  const offsetY = Math.floor((element.h - cell * count) / 2);
  ctx.fillStyle = '#000';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (code.isDark(row, col)) {
        ctx.fillRect(offsetX + col * cell, offsetY + row * cell, cell, cell);
      }
    }
  }
}

export function barcodeError(element: BarcodeElement, tokens: TokenContext) {
  try {
    JsBarcode(canvas(1, 1), expandTokens(element.data, tokens), { format: element.format });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function drawBarcode(ctx: Ctx, element: BarcodeElement, data: string) {
  const source = canvas(1, 1);
  try {
    JsBarcode(source, data, {
      format: element.format,
      displayValue: element.showText,
      margin: 0,
      width: 2,
      height: 100,
      fontSize: 22,
      textMargin: 4,
      font: 'IBM Plex Sans JP',
      background: 'rgba(0,0,0,0)',
      lineColor: '#000'
    });
  } catch {
    return;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, element.w, element.h);
}

const patterns = new Map<Fill, HTMLCanvasElement>();

function patternTile(fill: Fill) {
  const cached = patterns.get(fill);
  if (cached) {
    return cached;
  }
  const tile = canvas(8, 8);
  const ctx = tile.getContext('2d')!;
  ctx.fillStyle = '#000';
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const on =
        fill === 'gray25' ? (x + y * 2) % 4 === 0 && y % 2 === 0
        : fill === 'gray50' ? (x + y) % 2 === 0
        : fill === 'gray75' ? !((x + y * 2) % 4 === 0 && y % 2 === 0)
        : fill === 'stripes' ? (x + y) % 8 < 3
        : fill === 'dots' ? (x % 4 === 1 || x % 4 === 2) && (y % 4 === 1 || y % 4 === 2)
        : fill === 'checker' ? (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0
        : true;
      if (on) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  patterns.set(fill, tile);
  return tile;
}

function fillStyle(ctx: Ctx, fill: Fill) {
  if (fill === 'solid') {
    return '#000';
  }
  return ctx.createPattern(patternTile(fill), 'repeat') ?? '#000';
}

function drawShape(ctx: Ctx, element: ShapeElement) {
  const { w, h, stroke } = element;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = stroke;
  if (element.shape === 'rect' || element.shape === 'ellipse') {
    ctx.beginPath();
    if (element.shape === 'rect') {
      ctx.roundRect(stroke / 2, stroke / 2, w - stroke, h - stroke, element.radius);
    } else {
      ctx.ellipse(w / 2, h / 2, Math.max(0, w / 2 - stroke / 2), Math.max(0, h / 2 - stroke / 2), 0, 0, Math.PI * 2);
    }
    if (element.fill !== 'none') {
      ctx.fillStyle = fillStyle(ctx, element.fill);
      ctx.fill();
    }
    if (stroke > 0) {
      ctx.stroke();
    }
    return;
  }
  ctx.fillStyle = fillStyle(ctx, element.fill === 'none' ? 'solid' : element.fill);
  if (element.shape === 'line') {
    ctx.fillRect(0, (h - stroke) / 2, w, stroke);
    return;
  }
  if (element.shape === 'dashes') {
    const dash = Math.max(2, stroke * 3);
    for (let x = 0; x < w; x += dash * 2) {
      ctx.fillRect(x, (h - stroke) / 2, Math.min(dash, w - x), stroke);
    }
    return;
  }
  const tooth = Math.max(4, h);
  ctx.beginPath();
  if (element.shape === 'zigzag') {
    ctx.moveTo(0, h);
    for (let x = 0; x < w; x += tooth) {
      ctx.lineTo(Math.min(w, x + tooth / 2), 0);
      ctx.lineTo(Math.min(w, x + tooth), h);
    }
  } else {
    ctx.moveTo(0, 0);
    for (let x = 0; x < w; x += tooth) {
      ctx.arc(x + tooth / 2, 0, tooth / 2, Math.PI, 0, true);
    }
    ctx.lineTo(w, 0);
  }
  ctx.closePath();
  ctx.fill();
}

function layerKey(element: Element, tokens: TokenContext) {
  const { x: _x, y: _y, id: _id, ...rest } = element;
  return `${element.kind}|${JSON.stringify(rest)}${contentOf(element, tokens)}`;
}

function contentOf(element: Element, tokens: TokenContext) {
  if (element.kind === 'text') {
    return expandTokens(element.text, tokens);
  }
  return element.kind === 'qr' || element.kind === 'barcode' ? expandTokens(element.data, tokens) : '';
}

function renderLayer(element: Element, tokens: TokenContext) {
  const key = layerKey(element, tokens);
  const cached = layers.get(key);
  if (cached) {
    return cached;
  }
  const pad = element.kind === 'text' && !element.invert ? Math.ceil(element.size * 0.35) : 0;
  const layer = canvas(element.w + pad * 2, element.h);
  const ctx = layer.getContext('2d', { willReadFrequently: element.kind === 'image' })!;
  if (element.kind === 'text') {
    ctx.translate(pad, 0);
    drawText(ctx, element, tokens);
  } else if (element.kind === 'image') {
    drawImage(ctx, element);
  } else if (element.kind === 'qr') {
    drawQr(ctx, element, contentOf(element, tokens));
  } else if (element.kind === 'barcode') {
    drawBarcode(ctx, element, contentOf(element, tokens));
  } else {
    drawShape(ctx, element);
  }
  if (element.invert) {
    const inverted = canvas(layer.width, layer.height);
    const inverse = inverted.getContext('2d')!;
    inverse.fillStyle = '#000';
    inverse.fillRect(0, 0, inverted.width, inverted.height);
    inverse.globalCompositeOperation = 'destination-out';
    inverse.drawImage(layer, 0, 0);
    inverse.globalCompositeOperation = 'destination-over';
    inverse.fillStyle = '#fff';
    inverse.fillRect(0, 0, inverted.width, inverted.height);
    const result = { canvas: inverted, pad: 0 };
    layers.set(key, result);
    return result;
  }
  const result = { canvas: layer, pad };
  if (element.kind !== 'image' || images.has(element.src)) {
    layers.set(key, result);
  }
  if (layers.size > MAX_LAYERS) {
    layers.delete(layers.keys().next().value!);
  }
  return result;
}

export function renderDoc(doc: Doc, tokens: TokenContext) {
  const { width, height } = docSize(doc);
  const output = canvas(width, height);
  const ctx = output.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  for (const element of doc.elements) {
    if (element.kind === 'image' && !element.src) {
      continue;
    }
    const layer = renderLayer(element, tokens);
    ctx.save();
    ctx.translate(element.x + element.w / 2, element.y + element.h / 2);
    ctx.rotate((element.rotation * Math.PI) / 180);
    ctx.drawImage(layer.canvas, -element.w / 2 - layer.pad, -element.h / 2, element.w + layer.pad * 2, element.h);
    ctx.restore();
  }
  const pixels = ctx.getImageData(0, 0, width, height);
  const { data } = pixels;
  const threshold = doc.print.darkness;
  for (let i = 0; i < data.length; i += 4) {
    const value = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < threshold ? 0 : 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return output;
}

export function inkCoverage(output: HTMLCanvasElement) {
  const data = output.getContext('2d')!.getImageData(0, 0, output.width, output.height).data;
  let black = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === 0) {
      black += 1;
    }
  }
  return black / (data.length / 4);
}
