import { contentBox, layoutForPrinter } from 'escpos-web-print';

export const RECEIPT_WIDTH = 1819;
export const RECEIPT_HEIGHT = 685;
export const MIN_PRINT_WIDTH = 128;
export const MAX_PRINT_WIDTH = 2048;
export const MAX_FEED_BEFORE_CUT = 255;
export const MAX_HEATING = 255;
export const MAX_PADDING = 1000;
export const MAX_LOGO_OFFSET_X = 280;
export const MAX_LOGO_OFFSET_Y = 300;
const LOGO_BOX = { width: 520, height: RECEIPT_HEIGHT - 40 };
const LOGO_AREA = { left: 10, top: 10, right: 575, bottom: RECEIPT_HEIGHT - 10 };

export type LogoMode = 'reference' | 'upload';
export type PrintRotation = 'clockwise' | 'counterclockwise';

export type ReceiptState = {
  heading: string;
  subtitle: string;
  dateVenue: string;
  seat: string;
  serial: string;
  notices: string[];
  logoMode: LogoMode;
  logoOffsetX: number;
  logoOffsetY: number;
  logoScale: number;
  fontFamily: string;
};

export type LogoAsset = {
  source: CanvasImageSource;
  width: number;
  height: number;
  dataUrl?: string;
  crop?: { x: number; y: number; width: number; height: number };
};

export const defaultReceipt: ReceiptState = {
  heading: '/r/LoveLive Offkai',
  subtitle: 'いきづらい部！ 2nd LIVE Dou-Da? DOING! ～Reply to L～',
  dateVenue: '2026年9月20日（日） 開場 20:00/開演 20:30 新宿火消し餃子 歌舞伎町店',
  seat: '一般指定席 ｱﾘｰﾅ 酒ﾌﾞﾛｯｸ ○列 ○番',
  serial: 'S2305',
  notices: [
    '※本券の交換・譲渡・転売を禁じます。',
    '　上記の違反行為が発覚した場合、即時退場となります。',
    '※再入場はできません。',
    '※紛失にて発生したトラブルには一切対応できません。',
    '※本券は再発行できません。本券は公演終了まで大切にお持ちください。'
  ],
  logoMode: 'reference',
  logoOffsetX: -13,
  logoOffsetY: 28,
  logoScale: 1,
  fontFamily: 'MS Gothic'
};

const fallbackFont = '"ＭＳ ゴシック", "IBM Plex Sans Local", "IBM Plex Sans JP Local", "Osaka-Mono", "Noto Sans Mono CJK JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export function drawReceipt(
  canvas: HTMLCanvasElement,
  state: ReceiptState,
  logo: LogoAsset | null
) {
  canvas.width = RECEIPT_WIDTH;
  canvas.height = RECEIPT_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, RECEIPT_WIDTH, RECEIPT_HEIGHT);
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#050505';
  context.imageSmoothingEnabled = true;

  drawLogo(context, state, logo);

  const rightX = 590;
  const rightWidth = RECEIPT_WIDTH - rightX - 14;
  const font = state.fontFamily ? `"${state.fontFamily}", ${fallbackFont}` : fallbackFont;

  drawTextRun(context, state.heading, rightX, 113, rightWidth, {
    font,
    size: 64,
    weight: 500,
    align: 'center'
  });
  drawTextRun(context, state.subtitle, rightX, 160, rightWidth, {
    font,
    size: 40,
    weight: 500,
    align: 'center'
  });
  drawTextRun(context, state.dateVenue, rightX, 244, rightWidth, {
    font,
    size: 36,
    weight: 500,
    align: 'left'
  });
  drawTextRun(context, state.seat, rightX, 307, rightWidth, {
    font,
    size: 60,
    weight: 700,
    align: 'left'
  });
  drawTextRun(context, state.serial, rightX, 350, rightWidth, {
    font,
    size: 40,
    weight: 700,
    align: 'left'
  });

  state.notices.forEach((notice, index) => {
    drawTextRun(context, notice, rightX, 398 + index * 40, rightWidth, {
      font,
      size: 36,
      weight: 500,
      align: 'left'
    });
  });

  return canvas;
}

export function trimLogo(source: HTMLImageElement): LogoAsset {
  return { source, width: source.naturalWidth, height: source.naturalHeight, crop: contentBox(source) };
}

export function hasLocalFont(family: string) {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) {
    return false;
  }
  const sample = 'あいう漢字ｱｲｳABCabc123';
  return ['monospace', 'serif', 'sans-serif'].some((generic) => {
    context.font = `60px ${generic}`;
    const base = context.measureText(sample).width;
    context.font = `60px "${family}", ${generic}`;
    return context.measureText(sample).width !== base;
  });
}

export function fitLogoPosition() {
  return { logoOffsetX: 0, logoOffsetY: 0, logoScale: 1 };
}

function drawLogo(context: CanvasRenderingContext2D, state: ReceiptState, logo: LogoAsset | null) {
  if (!logo) {
    return;
  }

  const crop = logo.crop ?? { x: 0, y: 0, width: logo.width, height: logo.height };
  const areaWidth = LOGO_AREA.right - LOGO_AREA.left;
  const areaHeight = LOGO_AREA.bottom - LOGO_AREA.top;
  const scale = Math.min(
    Math.min(LOGO_BOX.width / crop.width, LOGO_BOX.height / crop.height) * state.logoScale,
    areaWidth / crop.width,
    areaHeight / crop.height
  );
  const targetWidth = crop.width * scale;
  const targetHeight = crop.height * scale;
  const x = clamp((LOGO_AREA.left + LOGO_AREA.right - targetWidth) / 2 + state.logoOffsetX, LOGO_AREA.left, LOGO_AREA.right - targetWidth);
  const y = clamp((RECEIPT_HEIGHT - targetHeight) / 2 + state.logoOffsetY, LOGO_AREA.top, LOGO_AREA.bottom - targetHeight);
  context.save();
  context.filter = 'grayscale(1)';
  context.drawImage(logo.source, crop.x, crop.y, crop.width, crop.height, x, y, targetWidth, targetHeight);
  context.restore();
}

function drawTextRun(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  options: { font: string; size: number; weight: number; align: CanvasTextAlign }
) {
  const text = value || ' ';
  context.font = `${options.weight} ${options.size}px ${options.font}`;
  context.textAlign = options.align;
  context.fillText(text, options.align === 'center' ? x + maxWidth / 2 : x, y);
}

export function createPrinterCanvas(
  state: ReceiptState,
  logo: LogoAsset | null,
  width: number,
  rotation: PrintRotation,
  marginDots = 0,
  paddingBefore = 0,
  paddingAfter = 0
) {
  const selectedWidth = Math.round(width);
  const margin = Math.floor(marginDots);
  if (!Number.isInteger(selectedWidth) || selectedWidth < MIN_PRINT_WIDTH || selectedWidth > MAX_PRINT_WIDTH || selectedWidth % 8 !== 0) {
    throw new Error('印字幅は128〜2048ドットの8ドット単位で指定してください。');
  }
  if (!Number.isInteger(margin) || margin < 0 || selectedWidth - margin * 2 < 8) {
    throw new Error('左右余白が印字幅を超えています。');
  }

  for (const padding of [paddingBefore, paddingAfter]) {
    if (!Number.isInteger(padding) || padding < 0 || padding > MAX_PADDING) {
      throw new Error(`前後余白は0〜${MAX_PADDING}ドットの整数で指定してください。`);
    }
  }

  const base = document.createElement('canvas');
  drawReceipt(base, state, logo);
  return layoutForPrinter(base, {
    printWidth: selectedWidth,
    rotate: rotation === 'clockwise' ? 90 : 270,
    margin,
    paddingBefore,
    paddingAfter
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
