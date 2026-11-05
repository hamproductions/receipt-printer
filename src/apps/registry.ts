import { DEFAULT_END_SPACE, DEFAULT_PRINT, newId, type Doc, type Element } from '../doc';
import { defaults } from './bindings';
import type { AppManifest, AppValues } from './types';

const ORDER = ['blank', 'lovelive-setlist', 'ham-guest-house', 'guest-welcome', 'offkai-ticket', 'offkai-bee', 'day-receipt', 'live-ticket', 'omikuji', 'todo', 'banner', 'photo', 'name-tag', 'boarding-pass', 'coupon', 'wifi', 'bingo', 'meme', 'planner', 'ryoshusho', 'gift-tag', 'quote', 'calibration'];

const modules = import.meta.glob<AppManifest>('./manifests/*.json', { eager: true, import: 'default' });

const rank = (id: string) => {
  const index = ORDER.indexOf(id);
  return index < 0 ? ORDER.length : index;
};

export const APPS: AppManifest[] = Object.values(modules).sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));

const TEMPLATES_KEY = 'inkless:templates';

export function userTemplates(): AppManifest[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? '[]');
    return Array.isArray(value) ? (value as AppManifest[]).filter((item) => item && typeof item.id === 'string' && Array.isArray(item.fields) && item.doc) : [];
  } catch {
    return [];
  }
}

export function saveTemplates(templates: AppManifest[]) {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
    return true;
  } catch {
    return false;
  }
}

export function findApp(id: string | undefined) {
  if (!id) {
    return null;
  }
  return APPS.find((app) => app.id === id) ?? userTemplates().find((app) => app.id === id) ?? null;
}

export function templateFrom(doc: Doc, name: string, allFields: AppManifest['fields'], id?: string): AppManifest {
  const fields = allFields.map((field) => (field.perGuest ? { ...field, default: field.type === 'toggle' ? false : field.type === 'number' ? 0 : field.type === 'list' ? [] : '' } : { ...field, default: doc.app?.values[field.key] ?? field.default })) as AppManifest['fields'];
  const { app: _app, fields: _fields, ...rest } = doc;
  return { id: id ?? `user-${Date.now().toString(36)}`, version: 1, name, hint: 'Your template', fields, user: true, doc: { ...rest, name, elements: rest.elements.map(({ id: _id, ...element }) => element as Element) } };
}

export function buildApp(manifest: AppManifest, values?: AppValues): Doc {
  const template = structuredClone(manifest.doc);
  return {
    ...template,
    version: 1,
    endSpace: template.endSpace ?? DEFAULT_END_SPACE,
    print: { ...DEFAULT_PRINT, ...template.print },
    elements: template.elements.map((element) => ({ ...element, id: newId() }) as Element),
    fields: manifest.user ? structuredClone(manifest.fields) : undefined,
    app: manifest.fields.length ? { id: manifest.id, values: values ?? defaults(manifest.fields) } : undefined
  };
}
