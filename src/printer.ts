import {
  concat,
  isBluetoothSupported,
  isSerialSupported,
  isUsbSupported,
  renderForPrinter,
  requestBluetoothPrinter,
  requestSerialPrinter,
  requestUsbPrinter,
  sendParts,
  textTestPage,
  USB_PRINTER_CLASS,
  type Transport
} from 'escpos-web-print';
import { PAPER_DOTS, type PrintSettings } from './doc';

export type Connection = 'bluetooth' | 'serial' | 'usb';

const NAME_KEY = 'inkless:printer-name';
const SPEED_KEY = 'inkless:print-speed';

export type Speed = 'fast' | 'balanced' | 'safe' | 'slowest';

export const SPEEDS: Record<Speed, { label: string; detail: string; chunkSize: number; chunkDelay: number; partDelay: number }> = {
  fast: { label: 'Fast', detail: '182-byte chunks, short pauses', chunkSize: 182, chunkDelay: 20, partDelay: 30 },
  balanced: { label: 'Balanced', detail: '182-byte chunks, about 4 KB/s', chunkSize: 182, chunkDelay: 40, partDelay: 50 },
  safe: { label: 'Safe', detail: 'About 1.6 KB/s, for printers that stop halfway', chunkSize: 100, chunkDelay: 60, partDelay: 80 },
  slowest: { label: 'Slowest', detail: '20-byte chunks, for old Bluetooth adapters', chunkSize: 20, chunkDelay: 20, partDelay: 80 }
};

export function loadSpeed(): Speed {
  try {
    const value = localStorage.getItem(SPEED_KEY);
    return value && value in SPEEDS ? (value as Speed) : 'balanced';
  } catch {
    return 'balanced';
  }
}

export function saveSpeed(speed: Speed) {
  try {
    localStorage.setItem(SPEED_KEY, speed);
  } catch {
    return;
  }
}

export function supported(connection: Connection) {
  if (connection === 'bluetooth') {
    return isBluetoothSupported();
  }
  return connection === 'serial' ? isSerialSupported() : isUsbSupported();
}

function storedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function connect(connection: Connection, onDisconnect: () => void, acceptAllDevices = false): Promise<Transport> {
  if (connection === 'bluetooth') {
    const printer = await requestBluetoothPrinter({ namePrefix: storedName(), acceptAllDevices, onDisconnect });
    if (printer.deviceName) {
      try {
        localStorage.setItem(NAME_KEY, printer.deviceName);
      } catch {
        return printer;
      }
    }
    return printer;
  }
  if (connection === 'serial') {
    return requestSerialPrinter({ baudRate: 9600, onDisconnect });
  }
  return requestUsbPrinter({ filters: [{ classCode: USB_PRINTER_CLASS }], onDisconnect });
}

export function encode(output: HTMLCanvasElement, landscape: boolean, settings: PrintSettings) {
  return renderForPrinter(output, {
    printWidth: settings.printWidth ?? PAPER_DOTS,
    rotate: landscape ? (settings.rotate ?? 90) : 0,
    trim: false,
    dither: 'threshold',
    threshold: 128,
    heatingTime: settings.heat || undefined,
    cut: settings.cut ?? 'none',
    feedAfter: settings.cut && settings.cut !== 'none' ? (settings.cutFeed ?? 0) : 0
  });
}

export async function send(printer: Transport, parts: Uint8Array[], signal: AbortSignal, onProgress: (ratio: number) => void, speed: Speed = 'balanced') {
  let sent = 0;
  const pace = SPEEDS[speed];
  try {
    await sendParts(printer, parts, {
      chunkSize: pace.chunkSize,
      chunkDelay: pace.chunkDelay,
      partDelay: pace.partDelay,
      signal,
      onProgress: (bytesSent, total) => {
        sent = bytesSent;
        onProgress(total ? bytesSent / total : 1);
      }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      await sendParts(printer, [new Uint8Array(remainderOfPart(parts, sent)), new Uint8Array([0x1b, 0x40])]).catch(() => undefined);
    }
    throw error;
  }
}

function remainderOfPart(parts: Uint8Array[], sent: number) {
  let end = 0;
  for (const part of parts) {
    end += part.length;
    if (sent < end) {
      return sent === end - part.length ? 0 : end - sent;
    }
  }
  return 0;
}

export function estimateSeconds(rows: number) {
  return Math.ceil(((rows * 48) / 182) * 0.04 + (rows / 24) * 0.05);
}

export const LONG_PRINT_ROWS = 2400;
export const MAX_PRINT_ROWS = 8000;

export async function testPage(printer: Transport, speed: Speed = 'balanced') {
  const pace = SPEEDS[speed];
  await sendParts(printer, textTestPage(['INKLESS TEST', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789', '']), { chunkSize: pace.chunkSize, chunkDelay: pace.chunkDelay, partDelay: pace.partDelay });
}

export function bytes(parts: Uint8Array[]) {
  return concat(parts);
}
