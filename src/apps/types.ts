import type { Doc } from '../doc';

type FieldBase = { key: string; label: string; hint?: string; required?: boolean; perGuest?: boolean; allowBlank?: boolean; blankLength?: number; hidden?: boolean };

export type ListColumn = { key: string; label: string; type: 'text' | 'number' };

export type Field =
  | (FieldBase & { type: 'text' | 'longtext' | 'url' | 'password'; default: string; placeholder?: string })
  | (FieldBase & { type: 'date' | 'time'; default: string })
  | (FieldBase & { type: 'number'; default: number; min?: number; max?: number; step?: number })
  | (FieldBase & { type: 'select'; default: string; options: string[] })
  | (FieldBase & { type: 'toggle'; default: boolean })
  | (FieldBase & { type: 'list'; default: Record<string, string | number>[]; columns: ListColumn[]; format: string; max?: number; layout?: 'stacked' });

export type FieldValue = string | number | boolean | Record<string, string | number>[];
export type AppValues = Record<string, FieldValue>;

export type SetlistImporter = {
  type: 'performance-setlist';
  name: string;
  sources: { performances: string; extras: string; setlists: string; songs: string };
  output: { fields: Record<string, { from: string[]; separator: string }>; setlist: string; status: string; source: string; structured?: boolean; artwork?: string };
  artwork?: { source: string; keys: string[]; image: string; url?: string };
  format: { section: string; song: string; actual: string; provisional: string };
};

export type AppManifest = {
  id: string;
  version: 1;
  name: string;
  hint: string;
  fields: Field[];
  importer?: 'offkai' | SetlistImporter;
  user?: boolean;
  doc: Omit<Doc, 'app'>;
};

export type DocApp = { id?: string; values: AppValues; blanks?: string[] };
