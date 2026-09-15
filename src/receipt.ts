import { MAX_PRINT_WIDTH, MIN_PRINT_WIDTH } from './escpos';

export const RECEIPT_WIDTH = 1819;
export const RECEIPT_HEIGHT = 685;

export type LogoMode = 'reference' | 'upload';

export type ReceiptState = {
  heading: string;
  subtitle: string;
  dateVenue: string;
  seat: string;
  serial: string;
  notices: string[];
  logoMode: LogoMode;
  logoX: number;
  logoY: number;
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
  logoX: 20,
  logoY: 220,
  logoScale: 1,
  fontFamily: 'IBM Plex Sans Local'
};

const fallbackFont = '"IBM Plex Sans Local", "IBM Plex Sans JP Local", "MS Gothic", "Osaka-Mono", "Noto Sans Mono CJK JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

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

function drawLogo(context: CanvasRenderingContext2D, state: ReceiptState, logo: LogoAsset | null) {
  if (!logo) {
    return;
  }

  const crop = logo.crop ?? { x: 0, y: 0, width: logo.width, height: logo.height };
  const targetWidth = crop.width * state.logoScale;
  const targetHeight = crop.height * state.logoScale;
  context.drawImage(
    logo.source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    state.logoX,
    state.logoY,
    targetWidth,
    targetHeight
  );
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
  rotate: boolean,
  marginDots = 0
) {
  const selectedWidth = Math.round(width);
  const margin = Math.floor(marginDots);
  if (!Number.isInteger(selectedWidth) || selectedWidth < MIN_PRINT_WIDTH || selectedWidth > MAX_PRINT_WIDTH || selectedWidth % 8 !== 0) {
    throw new Error('印字幅は128〜2048ドットの8ドット単位で指定してください。');
  }
  if (!Number.isInteger(margin) || margin < 0 || selectedWidth - margin * 2 < 8) {
    throw new Error('左右余白が印字幅を超えています。');
  }

  const base = document.createElement('canvas');
  drawReceipt(base, state, logo);
  const contentWidth = selectedWidth - margin * 2;
  const scale = contentWidth / (rotate ? RECEIPT_HEIGHT : RECEIPT_WIDTH);
  const canvas = document.createElement('canvas');

  if (rotate) {
    canvas.width = selectedWidth;
    canvas.height = Math.round(RECEIPT_WIDTH * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context is unavailable');
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width - margin, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(base, 0, 0, Math.round(RECEIPT_WIDTH * scale), Math.round(RECEIPT_HEIGHT * scale));
    return canvas;
  }

  canvas.width = selectedWidth;
  canvas.height = Math.round(RECEIPT_HEIGHT * scale);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable');
  }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(base, margin, 0, contentWidth, canvas.height);
  return canvas;
}
