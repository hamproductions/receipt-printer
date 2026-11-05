import { DEFAULT_END_SPACE, DEFAULT_PRINT, newId, type Doc, type Element } from '../doc';
import { defaults } from './bindings';
import type { AppManifest, AppValues } from './types';

const ORDER = ['blank', 'offkai-ticket', 'offkai-bee', 'day-receipt', 'live-ticket', 'omikuji', 'todo', 'banner', 'photo', 'name-tag', 'boarding-pass', 'coupon', 'wifi', 'bingo', 'meme', 'planner', 'ryoshusho', 'gift-tag', 'quote', 'calibration'];

const modules = import.meta.glob<AppManifest>('./manifests/*.json', { eager: true, import: 'default' });

const rank = (id: string) => {
  const index = ORDER.indexOf(id);
  return index < 0 ? ORDER.length : index;
};

export const APPS: AppManifest[] = Object.values(modules).sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));

export function findApp(id: string) {
  return APPS.find((app) => app.id === id) ?? null;
}

export function buildApp(manifest: AppManifest, values?: AppValues): Doc {
  const template = structuredClone(manifest.doc);
  return {
    ...template,
    version: 1,
    endSpace: template.endSpace ?? DEFAULT_END_SPACE,
    print: { ...DEFAULT_PRINT, ...template.print },
    elements: template.elements.map((element) => ({ ...element, id: newId() }) as Element),
    app: manifest.fields.length ? { id: manifest.id, values: values ?? defaults(manifest.fields) } : undefined
  };
}
