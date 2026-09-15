export type CutMode = 'full' | 'partial' | 'none';
export const MIN_PRINT_WIDTH = 128;
export const MAX_PRINT_WIDTH = 2048;
export const MAX_FEED_BEFORE_CUT = 255;

export type EscPosOptions = {
  cutMode?: CutMode;
  feedBeforeCut?: number;
};

export function encodeEscPosRaster(canvas: HTMLCanvasElement, options: EscPosOptions = {}) {
  const cutMode = options.cutMode ?? 'full';
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
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const header = new Uint8Array([
    0x1b,
    0x40,
    0x1d,
    0x76,
    0x30,
    0x00,
    widthBytes & 0xff,
    (widthBytes >> 8) & 0xff,
    canvas.height & 0xff,
    (canvas.height >> 8) & 0xff
  ]);
  const raster = new Uint8Array(widthBytes * canvas.height);

  for (let y = 0; y < canvas.height; y += 1) {
    for (let xByte = 0; xByte < widthBytes; xByte += 1) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const x = xByte * 8 + bit;
        if (x >= canvas.width) {
          continue;
        }
        const offset = (y * canvas.width + x) * 4;
        const alpha = pixels[offset + 3];
        const luminance = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
        if (alpha > 128 && luminance < 200) {
          byte |= 0x80 >> bit;
        }
      }
      raster[y * widthBytes + xByte] = byte;
    }
  }

  const footer = new Uint8Array([0x0a, ...cutCommand(cutMode, feedBeforeCut)]);
  const output = new Uint8Array(header.length + raster.length + footer.length);
  output.set(header, 0);
  output.set(raster, header.length);
  output.set(footer, header.length + raster.length);
  return output;
}

function cutCommand(cutMode: CutMode, feedBeforeCut: number) {
  if (cutMode === 'none') {
    return feedBeforeCut > 0 ? [0x1b, 0x4a, feedBeforeCut] : [];
  }
  return [0x1d, 0x56, cutMode === 'full' ? 0x41 : 0x42, feedBeforeCut];
}
