export type PrinterConnection = {
  label: string;
  deviceName: string | null;
  write: (parts: Uint8Array[], chunkSize: number, signal: AbortSignal) => Promise<void>;
  disconnect: () => Promise<void>;
};

const CHUNK_DELAY_MS = 40;
const PART_DELAY_MS = 50;
const FLUSH_DELAY_MS = 300;

export async function sendParts(
  writeChunk: (chunk: Uint8Array) => Promise<void>,
  parts: Uint8Array[],
  chunkSize: number,
  signal: AbortSignal
) {
  const safeChunkSize = Math.floor(chunkSize);
  if (!Number.isFinite(chunkSize) || safeChunkSize < 1) {
    throw new Error('分割サイズは1以上の有限な数値で指定してください。');
  }

  for (const part of parts) {
    for (let offset = 0; offset < part.length; offset += safeChunkSize) {
      throwIfAborted(signal);
      await writeChunk(part.slice(offset, Math.min(offset + safeChunkSize, part.length)));
      await wait(CHUNK_DELAY_MS, signal);
    }
    await wait(PART_DELAY_MS, signal);
  }
  await wait(FLUSH_DELAY_MS, signal);
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
