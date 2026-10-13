export type BluetoothConnection = {
  kind: 'bluetooth';
  device: BluetoothDeviceLike;
  characteristic: BluetoothCharacteristicLike;
  label: string;
};

export type BluetoothDeviceLike = {
  name?: string;
  gatt?: BluetoothGattServerLike;
  addEventListener: (type: string, listener: () => void) => void;
};

type BluetoothGattServerLike = {
  connected: boolean;
  connect: () => Promise<BluetoothGattServerLike>;
  disconnect?: () => void;
  getPrimaryServices: () => Promise<BluetoothGattServiceLike[]>;
};

type BluetoothGattServiceLike = {
  uuid: string;
  getCharacteristics: () => Promise<BluetoothCharacteristicLike[]>;
};

export type BluetoothCharacteristicLike = {
  uuid?: string;
  properties?: {
    write?: boolean;
    writeWithoutResponse?: boolean;
  };
  writeValue?: (value: Uint8Array) => Promise<void>;
  writeValueWithoutResponse?: (value: Uint8Array) => Promise<void>;
};

type BluetoothApi = {
  requestDevice: (options: {
    acceptAllDevices: boolean;
    optionalServices: string[];
  }) => Promise<BluetoothDeviceLike>;
};

// Web Bluetooth only exposes services listed up front, so list the ones used by common
// Chinese 58mm ESC/POS printers (FUNFANG, Goojprt, MHT, Xprinter, ...).
const KNOWN_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ffe5-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '00001101-0000-1000-8000-00805f9b34fb',
  '0000a002-0000-1000-8000-00805f9b34fb',
  'bea5760f-0b4e-4e0c-94f2-4d3b3c2b6f6a'
];

export function hasBluetoothSupport() {
  return 'bluetooth' in navigator;
}

export async function requestBluetoothConnection() {
  const bluetooth = (navigator as Navigator & { bluetooth?: BluetoothApi }).bluetooth;
  if (!bluetooth) {
    throw new Error('このブラウザはWeb Bluetoothに対応していません。Android/デスクトップのChromeを使用してください。');
  }

  const device = await bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: KNOWN_PRINTER_SERVICES
  });
  if (!device.gatt) {
    throw new Error('選択したデバイスはGATT接続に対応していません。');
  }
  const connectedBefore = device.gatt.connected;
  const server = connectedBefore ? device.gatt : await device.gatt.connect();
  try {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      // Prefer write-without-response (what these printers' apps use), then plain write.
      const characteristic =
        characteristics.find((item) => item.properties?.writeWithoutResponse) ??
        characteristics.find((item) => item.properties?.write);
      if (characteristic) {
        return {
          kind: 'bluetooth',
          device,
          characteristic,
          label: `${device.name || '名前なしデバイス'} (${service.uuid.slice(0, 8)})`
        } satisfies BluetoothConnection;
      }
    }
    throw new Error(
      '書き込み可能なCharacteristicが見つかりません。このプリンターのBLEサービスが未対応か、別のアプリが接続中の可能性があります。'
    );
  } catch (error) {
    if (!connectedBefore) {
      server.disconnect?.();
    }
    throw error;
  }
}

export async function writeBluetooth(
  connection: BluetoothConnection,
  bytes: Uint8Array,
  chunkSize: number,
  signal: AbortSignal
) {
  const safeChunkSize = Math.floor(chunkSize);
  if (!Number.isFinite(chunkSize) || safeChunkSize < 1) {
    throw new Error('分割サイズは1以上の有限な数値で指定してください。');
  }
  const { characteristic } = connection;
  const useWithoutResponse = characteristic.properties?.writeWithoutResponse === true;
  const writer = useWithoutResponse
    ? characteristic.writeValueWithoutResponse ?? characteristic.writeValue
    : characteristic.writeValue ?? characteristic.writeValueWithoutResponse;
  if (!writer) {
    throw new Error('このCharacteristicは書き込みに対応していません。');
  }

  for (let offset = 0; offset < bytes.length; offset += safeChunkSize) {
    if (signal.aborted) {
      throw new DOMException('印刷をキャンセルしました。', 'AbortError');
    }
    await writer.call(characteristic, bytes.slice(offset, Math.min(offset + safeChunkSize, bytes.length)));
    // Cheap printers have tiny buffers; pace writes so they don't drop data.
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export function disconnectBluetooth(connection: BluetoothConnection | null) {
  connection?.device.gatt?.disconnect?.();
}
