export type BluetoothConnection = {
  device: BluetoothDeviceLike;
  characteristic: BluetoothCharacteristicLike;
  serviceUuid: string;
  characteristicUuid: string;
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
  getPrimaryService: (uuid: string) => Promise<BluetoothGattServiceLike>;
};

type BluetoothGattServiceLike = {
  getCharacteristic: (uuid: string) => Promise<BluetoothCharacteristicLike>;
};

export type BluetoothCharacteristicLike = {
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

export function hasBluetoothSupport() {
  return 'bluetooth' in navigator;
}

export async function requestBluetoothConnection(serviceUuid: string, characteristicUuid: string) {
  const bluetooth = (navigator as Navigator & { bluetooth?: BluetoothApi }).bluetooth;
  if (!bluetooth) {
    throw new Error('このブラウザはWeb Bluetoothに対応していません。');
  }
  if (!serviceUuid || !characteristicUuid) {
    throw new Error('サービスUUIDとCharacteristic UUIDを入力してください。');
  }

  const device = await bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [serviceUuid]
  });
  if (!device.gatt) {
    throw new Error('選択したデバイスはGATT接続に対応していません。');
  }
  const connectedBeforeDiscovery = device.gatt.connected;
  const server = connectedBeforeDiscovery ? device.gatt : await device.gatt.connect();
  try {
    const service = await server.getPrimaryService(serviceUuid);
    const characteristic = await service.getCharacteristic(characteristicUuid);
    return { device, characteristic, serviceUuid, characteristicUuid } satisfies BluetoothConnection;
  } catch (error) {
    if (!connectedBeforeDiscovery) {
      server.disconnect?.();
    }
    throw error;
  }
}

export async function writeEscPos(
  connection: BluetoothConnection,
  bytes: Uint8Array,
  chunkSize: number,
  signal: AbortSignal
) {
  const safeChunkSize = Math.floor(chunkSize);
  if (!Number.isFinite(chunkSize) || safeChunkSize < 1) {
    throw new Error('BLE分割サイズは1以上の有限な数値で指定してください。');
  }
  if (!connection.characteristic.writeValue && !connection.characteristic.writeValueWithoutResponse) {
    throw new Error('このCharacteristicは書き込みに対応していません。');
  }

  const useWithoutResponse = connection.characteristic.properties?.writeWithoutResponse === true;
  const writer = useWithoutResponse
    ? connection.characteristic.writeValueWithoutResponse ?? connection.characteristic.writeValue
    : connection.characteristic.writeValue ?? connection.characteristic.writeValueWithoutResponse;

  if (!writer) {
    throw new Error('このCharacteristicは書き込みに対応していません。');
  }

  for (let offset = 0; offset < bytes.length; offset += safeChunkSize) {
    if (signal.aborted) {
      throw new DOMException('印刷をキャンセルしました。', 'AbortError');
    }
    const chunk = bytes.slice(offset, Math.min(offset + safeChunkSize, bytes.length));
    await writer.call(connection.characteristic, chunk);
  }
}

export function disconnectBluetooth(connection: BluetoothConnection | null) {
  connection?.device.gatt?.disconnect?.();
}
