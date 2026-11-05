import { buildApp, findApp } from './apps/registry';
import type { AppValues, Field } from './apps/types';
import { isDoc, normalizeDoc, type Doc } from './doc';

const MAX_LINK = 60_000;

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const response = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

function withoutPhotos(doc: Doc): Doc {
  return { ...doc, elements: doc.elements.map((element) => (element.kind === 'image' && element.src.startsWith('data:') ? { ...element, src: '' } : element)) };
}

export async function shareLink(doc: Doc) {
  const base = `${location.origin}${location.pathname}`;
  const pack = async (value: Doc) => toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(value)), new CompressionStream('gzip')));
  const full = `${base}#d=${await pack(doc)}`;
  if (full.length <= MAX_LINK) {
    return { url: full, droppedPhotos: false };
  }
  return { url: `${base}#d=${await pack(withoutPhotos(doc))}`, droppedPhotos: true };
}

function parseValue(field: Field, raw: string): AppValues[string] | undefined {
  switch (field.type) {
    case 'number': {
      const value = Number(raw);
      return Number.isFinite(value) ? value : undefined;
    }
    case 'toggle':
      return raw === 'true' || raw === '1' || raw === 'yes';
    case 'select':
      return field.options.includes(raw) ? raw : undefined;
    case 'list':
      try {
        const rows: unknown = JSON.parse(raw);
        return Array.isArray(rows) ? (rows as Record<string, string | number>[]) : undefined;
      } catch {
        return undefined;
      }
    default:
      return raw;
  }
}

export type DeepLink = { doc: Doc; source: 'design' | 'app'; ignored: string[] };

export async function readDeepLink(hash: string): Promise<DeepLink | null> {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const packed = params.get('d');
  if (packed) {
    const value: unknown = JSON.parse(new TextDecoder().decode(await pipe(fromBase64Url(packed), new DecompressionStream('gzip'))));
    if (!isDoc(value)) {
      throw new Error('This link does not contain an inkless design.');
    }
    return { doc: normalizeDoc(value), source: 'design', ignored: [] };
  }
  const appId = params.get('app');
  if (!appId) {
    return null;
  }
  const app = findApp(appId);
  if (!app) {
    throw new Error(`This link opens a preset called "${appId}" that does not exist.`);
  }
  const doc = buildApp(app);
  const values: AppValues = { ...(doc.app?.values ?? {}) };
  const ignored: string[] = [];
  for (const [key, raw] of params) {
    if (key === 'app') {
      continue;
    }
    const field = app.fields.find((item) => item.key === key);
    const value = field ? parseValue(field, raw) : undefined;
    if (value === undefined) {
      ignored.push(key);
    } else {
      values[key] = value;
    }
  }
  return { doc: doc.app ? { ...doc, app: { ...doc.app, values } } : doc, source: 'app', ignored };
}

export function appLink(appId: string, values: AppValues) {
  const params = new URLSearchParams({ app: appId });
  for (const [key, value] of Object.entries(values)) {
    params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  return `${location.origin}${location.pathname}#${params.toString()}`;
}
