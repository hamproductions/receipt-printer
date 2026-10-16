import { defaultReceipt, MAX_LOGO_OFFSET_X, MAX_LOGO_OFFSET_Y, MAX_PADDING, type LogoAsset, type PrintRotation, type ReceiptState } from './receipt';
import { MAX_FEED_BEFORE_CUT, MAX_HEATING, MAX_PRINT_WIDTH, MIN_PRINT_WIDTH, type CutMode } from './escpos';

const STORAGE_KEY = 'receipt-printer:editor:v1';
export const MAX_LOGO_DATA_URL_LENGTH = 1_500_000;
export const DEFAULT_PADDING = 48;

export type PersistedEditor = {
  version: 1;
  receipt: ReceiptState;
  settings: {
    printWidth: number;
    rasterMargin: number;
    paddingBefore: number;
    paddingAfter: number;
    paperCut: CutMode;
    feedBeforeCut: number;
    heating: number;
    dither: boolean;
    printRotation: PrintRotation;
    chunkSize: number;
    bluetoothName: string;
    includeAttendeeSerial: boolean;
  };
  logo?: {
    dataUrl: string;
    width: number;
    height: number;
  };
};

export function readPersistedEditor() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    const value = validatePersistedEditor(parsed);
    if (!value) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    return value;
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      return null;
    }
    return null;
  }
}

export function writePersistedEditor(value: PersistedEditor) {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function createPersistedEditor(
  receipt: ReceiptState,
  settings: PersistedEditor['settings'],
  logo: LogoAsset | null
) {
  const persistedLogo =
    receipt.logoMode === 'upload' &&
    logo?.dataUrl &&
    logo.dataUrl.length <= MAX_LOGO_DATA_URL_LENGTH
      ? {
          dataUrl: logo.dataUrl,
          width: logo.width,
          height: logo.height
        }
      : undefined;

  return {
    version: 1 as const,
    receipt: {
      ...receipt,
      logoMode: persistedLogo ? 'upload' : 'reference',
      fontFamily: defaultReceipt.fontFamily
    },
    settings,
    ...(persistedLogo ? { logo: persistedLogo } : {})
  } satisfies PersistedEditor;
}

function validatePersistedEditor(value: unknown): PersistedEditor | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.receipt) || !isRecord(value.settings)) {
    return null;
  }

  const receipt = validateReceipt(value.receipt);
  const settings = validateSettings(value.settings);
  const logo = validateLogo(value.logo);
  if (!receipt || !settings) {
    return null;
  }

  return {
    version: 1,
    receipt: { ...receipt, logoMode: logo ? receipt.logoMode : 'reference' },
    settings,
    ...(logo ? { logo } : {})
  };
}

function validateReceipt(value: Record<string, unknown>): ReceiptState | null {
  const heading = boundedString(value.heading, 300);
  const subtitle = boundedString(value.subtitle, 500);
  const dateVenue = boundedString(value.dateVenue, 500);
  const seat = boundedString(value.seat, 300);
  const serial = boundedString(value.serial, 120);
  const notices = value.notices;
  if (
    heading === null ||
    subtitle === null ||
    dateVenue === null ||
    seat === null ||
    serial === null ||
    !Array.isArray(notices) ||
    notices.length !== defaultReceipt.notices.length ||
    notices.some((notice) => typeof notice !== 'string' || notice.length > 500)
  ) {
    return null;
  }

  const logoMode = value.logoMode === 'upload' ? 'upload' : 'reference';
  const logoOffsetY = value.logoOffsetY === undefined ? (logoMode === 'upload' ? 0 : defaultReceipt.logoOffsetY) : boundedNumber(value.logoOffsetY, -MAX_LOGO_OFFSET_Y, MAX_LOGO_OFFSET_Y);
  const logoOffsetX = value.logoOffsetX === undefined ? (logoMode === 'upload' ? 0 : defaultReceipt.logoOffsetX) : boundedNumber(value.logoOffsetX, -MAX_LOGO_OFFSET_X, MAX_LOGO_OFFSET_X);
  const logoScale = boundedNumber(value.logoScale, 0.5, 1.4);
  if (logoOffsetX === null || logoOffsetY === null || logoScale === null) {
    return null;
  }

  return {
    heading,
    subtitle,
    dateVenue,
    seat,
    serial,
    notices: [...notices],
    logoMode,
    logoOffsetX,
    logoOffsetY,
    logoScale,
    fontFamily: defaultReceipt.fontFamily
  };
}

function validateSettings(value: Record<string, unknown>): PersistedEditor['settings'] | null {
  const rawPrintWidth = value.printWidth === undefined ? 384 : boundedNumber(value.printWidth, MIN_PRINT_WIDTH, MAX_PRINT_WIDTH);
  if (rawPrintWidth === null) {
    return null;
  }
  const printWidth = Math.max(MIN_PRINT_WIDTH, Math.min(MAX_PRINT_WIDTH, Math.round(rawPrintWidth / 8) * 8));
  const rawMargin = value.rasterMargin === undefined ? 0 : boundedNumber(value.rasterMargin, 0, MAX_PRINT_WIDTH);
  const rasterMargin = Math.min(Math.floor(rawMargin ?? 0), Math.floor((printWidth - 8) / 2));
  const paddingBefore = readPadding(value.paddingBefore);
  const paddingAfter = readPadding(value.paddingAfter);
  const rawFeed = value.feedBeforeCut === undefined ? 0 : boundedNumber(value.feedBeforeCut, 0, MAX_FEED_BEFORE_CUT);
  const feedBeforeCut = Math.floor(rawFeed ?? 0);
  const rawHeating = value.heating === undefined ? 0 : boundedNumber(value.heating, 0, MAX_HEATING);
  const heating = Math.floor(rawHeating ?? 0);
  const printRotation = readPrintRotation(value);
  const paperCut = value.paperCut === 'full' || value.paperCut === 'partial' ? value.paperCut : 'none';
  const chunkSize = boundedNumber(value.chunkSize, 20, 512);
  const bluetoothName = value.bluetoothName === undefined ? '' : boundedString(value.bluetoothName, 64);
  if (
    chunkSize === null ||
    bluetoothName === null ||
    typeof value.includeAttendeeSerial !== 'boolean'
  ) {
    return null;
  }
  return {
    printWidth,
    rasterMargin,
    paddingBefore,
    paddingAfter,
    paperCut,
    feedBeforeCut,
    heating,
    dither: value.dither !== false,
    printRotation,
    chunkSize,
    bluetoothName,
    includeAttendeeSerial: value.includeAttendeeSerial
  };
}

function readPadding(value: unknown) {
  return value === undefined ? DEFAULT_PADDING : Math.floor(boundedNumber(value, 0, MAX_PADDING) ?? DEFAULT_PADDING);
}

function readPrintRotation(value: Record<string, unknown>): PrintRotation {
  return value.printRotation === 'counterclockwise' ? 'counterclockwise' : 'clockwise';
}

function validateLogo(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  const dataUrl = value.dataUrl;
  const width = boundedNumber(value.width, 1, 4_000);
  const height = boundedNumber(value.height, 1, 4_000);
  if (
    typeof dataUrl !== 'string' ||
    dataUrl.length > MAX_LOGO_DATA_URL_LENGTH ||
    !/^data:image\/(?:png|jpeg|webp);base64,/u.test(dataUrl) ||
    width === null ||
    height === null
  ) {
    return null;
  }
  return { dataUrl, width, height };
}

function boundedString(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.length <= maxLength ? value : null;
}

function boundedNumber(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
