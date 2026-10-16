import { sendParts, type PrinterConnection } from './printer';

type SerialPortLike = {
  writable?: WritableStream<Uint8Array> | null;
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  getInfo?: () => { bluetoothServiceClassId?: string; usbVendorId?: number; usbProductId?: number };
  addEventListener: (type: 'disconnect', listener: () => void) => void;
  removeEventListener: (type: 'disconnect', listener: () => void) => void;
};

type SerialApi = {
  requestPort: () => Promise<SerialPortLike>;
};

export function hasSerialSupport() {
  return 'serial' in navigator;
}

export async function requestSerialConnection(onDisconnect: () => void): Promise<PrinterConnection> {
  const serial = (navigator as Navigator & { serial?: SerialApi }).serial;
  if (!serial) {
    throw new Error('このブラウザはWeb Serialに対応していません。デスクトップ版Chromeを使用してください。');
  }

  const port = await serial.requestPort();
  if (!port.writable) {
    try {
      await port.open({ baudRate: 9600 });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`シリアルポートを開けませんでした（${detail}）。プリンターの電源を入れ、他の端末やアプリとのBluetooth接続を切ってから再試行してください。`);
    }
  }

  const handleDisconnect = () => {
    port.removeEventListener('disconnect', handleDisconnect);
    onDisconnect();
  };
  port.addEventListener('disconnect', handleDisconnect);

  return {
    label: `Serial ${describePort(port)}`,
    deviceName: null,
    write: async (parts, chunkSize, signal) => {
      if (!port.writable) {
        throw new Error('シリアルポートへの書き込みを開始できません。');
      }
      const writer = port.writable.getWriter();
      try {
        await sendParts((chunk) => writer.write(chunk), parts, chunkSize, signal);
      } finally {
        writer.releaseLock();
      }
    },
    disconnect: async () => {
      port.removeEventListener('disconnect', handleDisconnect);
      await port.close().catch(() => {});
    }
  };
}

function describePort(port: SerialPortLike) {
  const info = port.getInfo?.() ?? {};
  if (info.bluetoothServiceClassId) {
    return 'Bluetooth';
  }
  if (info.usbVendorId !== undefined) {
    return `USB ${info.usbVendorId.toString(16).padStart(4, '0')}:${(info.usbProductId ?? 0).toString(16).padStart(4, '0')}`;
  }
  return 'ポート';
}
