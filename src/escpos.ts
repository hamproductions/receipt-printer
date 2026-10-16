export type CutMode = 'full' | 'partial' | 'none';
export const MIN_PRINT_WIDTH = 128;
export const MAX_PRINT_WIDTH = 2048;
export const MAX_FEED_BEFORE_CUT = 255;
export const MAX_HEATING = 255;

export type EscPosOptions = {
  cutMode?: CutMode;
  feedBeforeCut?: number;
  heating?: number;
  dither?: boolean;
};

export const RASTER_STRIP_HEIGHT = 24;

export function encodeEscPosRaster(canvas: HTMLCanvasElement, options: EscPosOptions = {}) {
  const parts = encodeEscPosRasterParts(canvas, options);
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function encodeEscPosRasterParts(canvas: HTMLCanvasElement, options: EscPosOptions = {}) {
  const cutMode = options.cutMode ?? 'none';
  const feedBeforeCut = options.feedBeforeCut ?? 0;
  if (cutMode !== 'full' && cutMode !== 'partial' && cutMode !== 'none') {
    throw new Error('カット方式が不正です。');
  }
  if (!Number.isInteger(feedBeforeCut) || feedBeforeCut < 0 || feedBeforeCut > MAX_FEED_BEFORE_CUT) {
    throw new Error('カット前追加送りは0〜255の整数で指定してください。');
  }

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable');
  }

  const widthBytes = Math.ceil(canvas.width / 8);
  const black = toMonochrome(context.getImageData(0, 0, canvas.width, canvas.height), options.dither ?? true);
  const parts = [initCommand(options.heating ?? 0)];

  for (let top = 0; top < canvas.height; top += RASTER_STRIP_HEIGHT) {
    const rows = Math.min(RASTER_STRIP_HEIGHT, canvas.height - top);
    const strip = new Uint8Array(8 + widthBytes * rows);
    strip.set([0x1d, 0x76, 0x30, 0x00, widthBytes & 0xff, (widthBytes >> 8) & 0xff, rows & 0xff, (rows >> 8) & 0xff]);
    for (let row = 0; row < rows; row += 1) {
      const y = top + row;
      for (let xByte = 0; xByte < widthBytes; xByte += 1) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit += 1) {
          const x = xByte * 8 + bit;
          if (x >= canvas.width) {
            continue;
          }
          if (black[y * canvas.width + x]) {
            byte |= 0x80 >> bit;
          }
        }
        strip[8 + row * widthBytes + xByte] = byte;
      }
    }
    parts.push(strip);
  }

  parts.push(new Uint8Array(cutCommand(cutMode, feedBeforeCut)));
  return parts;
}

function cutCommand(cutMode: CutMode, feedBeforeCut: number) {
  if (cutMode === 'none') {
    return feedBeforeCut > 0 ? [0x1b, 0x4a, feedBeforeCut] : [];
  }
  return [0x1d, 0x56, cutMode === 'full' ? 0x41 : 0x42, feedBeforeCut];
}

export function encodeEscPosTextTest(heating = 0) {
  const text = new TextEncoder().encode('PRINTER TEST\nABCDEFGHIJKLMNOPQRSTUVWXYZ\n0123456789\n');
  return [initCommand(heating), text, new Uint8Array([0x1b, 0x64, 0x04])];
}

function toMonochrome(image: ImageData, dither: boolean) {
  const { width, height, data } = image;
  const gray = new Float32Array(width * height);
  for (let index = 0; index < gray.length; index += 1) {
    const alpha = data[index * 4 + 3] / 255;
    const luminance = 0.299 * data[index * 4] + 0.587 * data[index * 4 + 1] + 0.114 * data[index * 4 + 2];
    gray[index] = luminance * alpha + 255 * (1 - alpha);
  }

  const black = new Uint8Array(width * height);
  if (!dither) {
    for (let index = 0; index < gray.length; index += 1) {
      black[index] = gray[index] < 200 ? 1 : 0;
    }
    return black;
  }

  const spread = [
    [1, 0],
    [2, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
    [0, 2]
  ];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const value = gray[index];
      const isBlack = value < 128;
      black[index] = isBlack ? 1 : 0;
      const error = (value - (isBlack ? 0 : 255)) / 8;
      for (const [dx, dy] of spread) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny < height) {
          gray[ny * width + nx] += error;
        }
      }
    }
  }
  return black;
}

function initCommand(heating: number) {
  if (!Number.isInteger(heating) || heating < 0 || heating > MAX_HEATING) {
    throw new Error('加熱時間は0〜255の整数で指定してください。');
  }
  return new Uint8Array(heating > 0 ? [0x1b, 0x40, 0x1b, 0x37, 0x07, heating, 0x02] : [0x1b, 0x40]);
}
