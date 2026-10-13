export type SerialConnection = {
  kind: 'serial';
  port: SerialPortLike;
};

type SerialPortLike = {
  writable?: WritableStream<Uint8Array> | null;
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
};

type SerialApi = {
  requestPort: () => Promise<SerialPortLike>;
};

export function hasSerialSupport() {
  return 'serial' in navigator;
}

export async function requestSerialConnection() {
  const serial = (navigator as Navigator & { serial?: SerialApi }).serial;
  if (!serial) {
    throw new Error('このブラウザはWeb Serialに対応していません。デスクトップ版Chromeを使用してください。');
  }

  const port = await serial.requestPort();
  await port.open({ baudRate: 9600 });
  return { kind: 'serial', port } satisfies SerialConnection;
}

export async function writeEscPos(
  connection: SerialConnection,
  bytes: Uint8Array,
  chunkSize: number,
  signal: AbortSignal
) {
  const safeChunkSize = Math.floor(chunkSize);
  if (!Number.isFinite(chunkSize) || safeChunkSize < 1) {
    throw new Error('シリアル分割サイズは1以上の有限な数値で指定してください。');
  }
  if (!connection.port.writable) {
    throw new Error('シリアルポートへの書き込みを開始できません。');
  }

  const writer = connection.port.writable.getWriter();
  try {
    for (let offset = 0; offset < bytes.length; offset += safeChunkSize) {
      throwIfAborted(signal);
      const chunk = bytes.slice(offset, Math.min(offset + safeChunkSize, bytes.length));
      await writer.write(chunk);
      await wait(30, signal);
    }
    await wait(300, signal);
  } finally {
    writer.releaseLock();
  }
}

export async function disconnectSerial(connection: SerialConnection | null) {
  await connection?.port.close().catch(() => {});
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new DOMException('印刷をキャンセルしました。', 'AbortError');
  }
}

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    throwIfAborted(signal);
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new DOMException('印刷をキャンセルしました。', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}
