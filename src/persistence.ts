import { defaults } from './apps/bindings';
import { buildApp, findApp } from './apps/registry';
import { isDoc, normalizeDoc, type Doc } from './doc';

const CURRENT_KEY = 'inkless:current';
const SHELF_KEY = 'inkless:shelf';
const PRINTED_KEY = 'inkless:printed';
const PRINTED_LIMIT = 40;

export type ShelfItem = { id: string; savedAt: number; doc: Doc };

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadCurrent() {
  const value = read(CURRENT_KEY);
  return isDoc(value) ? normalizeDoc(value) : null;
}

export function saveCurrent(doc: Doc) {
  return write(CURRENT_KEY, doc);
}

export function loadShelf(): ShelfItem[] {
  const value = read(SHELF_KEY);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is ShelfItem => !!item && typeof item === 'object' && isDoc((item as ShelfItem).doc)).map((item) => ({ ...item, doc: normalizeDoc(item.doc) }));
}

export function saveShelf(items: ShelfItem[]) {
  return write(SHELF_KEY, items);
}

export type PrintedItem = { id: string; printedAt: number; copies: number; thumb: string; doc: Doc };

export function loadPrinted(): PrintedItem[] {
  const value = read(PRINTED_KEY);
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is PrintedItem => !!item && typeof item === 'object' && typeof (item as PrintedItem).thumb === 'string' && isDoc((item as PrintedItem).doc))
    .map((item) => ({ ...item, doc: normalizeDoc(item.doc) }));
}

function withoutPhotos(doc: Doc): Doc {
  return { ...doc, elements: doc.elements.map((element) => (element.kind === 'image' ? { ...element, src: '' } : element)) };
}

export function recordPrinted(items: PrintedItem[], entry: PrintedItem) {
  let next = [entry, ...items].slice(0, PRINTED_LIMIT);
  while (next.length > 1 && !write(PRINTED_KEY, next)) {
    next = next.slice(0, -1);
  }
  if (next.length === 1 && !write(PRINTED_KEY, next)) {
    next = [{ ...entry, doc: withoutPhotos(entry.doc) }];
    if (!write(PRINTED_KEY, next)) {
      return items;
    }
  }
  return next;
}

export function savePrinted(items: PrintedItem[]) {
  return write(PRINTED_KEY, items);
}

type LegacyPreset = {
  name: string;
  receipt: { heading: string; subtitle: string; dateVenue: string; seat: string; serial: string; notices: string[] };
  logo?: { dataUrl: string };
};

function isLegacyPreset(value: unknown): value is LegacyPreset {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const receipt = (value as LegacyPreset).receipt;
  return !!receipt && typeof receipt === 'object' && ['heading', 'subtitle', 'dateVenue', 'seat', 'serial'].every((key) => typeof receipt[key as keyof typeof receipt] === 'string') && Array.isArray(receipt.notices);
}

function fromLegacy(preset: LegacyPreset): Doc {
  const app = findApp('offkai-ticket');
  if (!app) {
    throw new Error('The Offkai ticket app is missing.');
  }
  const { heading, subtitle, dateVenue, seat, serial, notices } = preset.receipt;
  const doc = buildApp(app, { ...defaults(app.fields), heading, subtitle, dateVenue, seat, serial, notices: notices.join('\n') });
  const logo = preset.logo?.dataUrl;
  return {
    ...doc,
    name: preset.name || doc.name,
    elements: logo && logo.startsWith('data:image/') ? doc.elements.map((element) => (element.kind === 'image' ? { ...element, src: logo, trim: true } : element)) : doc.elements
  };
}

export function parseDocFile(text: string) {
  const value: unknown = JSON.parse(text);
  if (isLegacyPreset(value)) {
    return fromLegacy(value);
  }
  if (!isDoc(value)) {
    throw new Error('This file is not an inkless design or a Receipt Printer preset.');
  }
  return normalizeDoc(value);
}
