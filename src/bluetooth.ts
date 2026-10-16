import { sendParts, type PrinterConnection } from './printer';

const PRINTER_SERVICES = [
  { service: '000018f0-0000-1000-8000-00805f9b34fb', characteristic: '00002af1-0000-1000-8000-00805f9b34fb' },
  { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', characteristic: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
  { service: '0000ff00-0000-1000-8000-00805f9b34fb', characteristic: '0000ff02-0000-1000-8000-00805f9b34fb' },
  { service: '0000ffe0-0000-1000-8000-00805f9b34fb', characteristic: '0000ffe1-0000-1000-8000-00805f9b34fb' }
];
const SCAN_SERVICES = [
  '0000ae30-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
];
const MAX_BLE_CHUNK = 182;

type BluetoothDeviceLike = {
  name?: string;
  gatt?: BluetoothGattServerLike;
  addEventListener: (type: 'gattserverdisconnected', listener: () => void) => void;
  removeEventListener: (type: 'gattserverdisconnected', listener: () => void) => void;
};

type BluetoothGattServerLike = {
  connected: boolean;
  connect: () => Promise<BluetoothGattServerLike>;
  disconnect: () => void;
  getPrimaryService: (uuid: string) => Promise<BluetoothGattServiceLike>;
  getPrimaryServices: () => Promise<BluetoothGattServiceLike[]>;
};

type BluetoothGattServiceLike = {
  uuid: string;
  getCharacteristic: (uuid: string) => Promise<BluetoothCharacteristicLike>;
  getCharacteristics: () => Promise<BluetoothCharacteristicLike[]>;
};

type BluetoothCharacteristicLike = {
  uuid: string;
  service: { uuid: string };
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse: (value: Uint8Array) => Promise<void>;
  writeValueWithoutResponse: (value: Uint8Array) => Promise<void>;
};

type BluetoothRequestOptions =
  | { acceptAllDevices: true; optionalServices: string[] }
  | { filters: ({ services: string[] } | { namePrefix: string })[]; optionalServices: string[] };

type BluetoothApi = {
  requestDevice: (options: BluetoothRequestOptions) => Promise<BluetoothDeviceLike>;
};

export function hasBluetoothSupport() {
  return 'bluetooth' in navigator;
}

export async function requestBluetoothConnection(
  onDisconnect: () => void,
  rememberedName: string,
  showAll: boolean
): Promise<PrinterConnection> {
  const bluetooth = (navigator as Navigator & { bluetooth?: BluetoothApi }).bluetooth;
  if (!bluetooth) {
    throw new Error('このブラウザはWeb Bluetoothに対応していません。デスクトップ版Chromeを使用してください。');
  }

  const services = [...PRINTER_SERVICES.map((entry) => entry.service), ...SCAN_SERVICES];
  const device = await bluetooth.requestDevice(
    showAll
      ? { acceptAllDevices: true, optionalServices: services }
      : {
          filters: [...services.map((service) => ({ services: [service] })), ...(rememberedName ? [{ namePrefix: rememberedName }] : [])],
          optionalServices: services
        }
  );
  if (!device.gatt) {
    throw new Error('選択したデバイスはBLE(GATT)接続に対応していません。');
  }

  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  let characteristic: BluetoothCharacteristicLike;
  try {
    characteristic = await findWritableCharacteristic(server);
  } catch (error) {
    server.disconnect();
    throw error;
  }

  const handleDisconnect = () => {
    device.removeEventListener('gattserverdisconnected', handleDisconnect);
    onDisconnect();
  };
  device.addEventListener('gattserverdisconnected', handleDisconnect);

  const withoutResponse = characteristic.properties.writeWithoutResponse && !characteristic.properties.write;
  return {
    deviceName: device.name || null,
    label: device.name || 'Bluetoothプリンター',
    write: (parts, chunkSize, signal) =>
      sendParts(
        (chunk) => (withoutResponse ? characteristic.writeValueWithoutResponse(chunk) : characteristic.writeValueWithResponse(chunk)),
        parts,
        Math.min(chunkSize, MAX_BLE_CHUNK),
        signal
      ),
    disconnect: async () => {
      device.removeEventListener('gattserverdisconnected', handleDisconnect);
      server.disconnect();
    }
  };
}

async function findWritableCharacteristic(server: BluetoothGattServerLike) {
  for (const entry of PRINTER_SERVICES) {
    try {
      const service = await server.getPrimaryService(entry.service);
      return await service.getCharacteristic(entry.characteristic);
    } catch {
      continue;
    }
  }

  for (const service of await server.getPrimaryServices().catch(() => [])) {
    const characteristics = await service.getCharacteristics().catch(() => []);
    const writable = characteristics.find((item) => item.properties.writeWithoutResponse || item.properties.write);
    if (writable) {
      return writable;
    }
  }

  throw new Error('印刷用のBLEサービスが見つかりませんでした。プリンターがBLE接続に対応しているか確認してください。');
}
