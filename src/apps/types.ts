import type { Doc } from '../doc';

type FieldBase = { key: string; label: string; hint?: string };

export type ListColumn = { key: string; label: string; type: 'text' | 'number' };

export type Field =
  | (FieldBase & { type: 'text' | 'longtext' | 'url'; default: string; placeholder?: string })
  | (FieldBase & { type: 'date' | 'time'; default: string })
  | (FieldBase & { type: 'number'; default: number; min?: number; max?: number; step?: number })
  | (FieldBase & { type: 'select'; default: string; options: string[] })
  | (FieldBase & { type: 'toggle'; default: boolean })
  | (FieldBase & { type: 'list'; default: Record<string, string | number>[]; columns: ListColumn[]; format: string; max?: number });

export type FieldValue = string | number | boolean | Record<string, string | number>[];
export type AppValues = Record<string, FieldValue>;

export type AppManifest = {
  id: string;
  version: 1;
  name: string;
  hint: string;
  fields: Field[];
  importer?: 'offkai';
  doc: Omit<Doc, 'app'>;
};

export type DocApp = { id: string; values: AppValues };
