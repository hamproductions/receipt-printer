import type { AppValues, Field } from './types';

const BINDING = /\{\{\s*([a-z]+:)?([A-Za-z0-9_]+)(?:\.([A-Za-z0-9_]+))?\s*\}\}/g;
const COLUMN = /\{([A-Za-z0-9_]+)(?::([<>^])?(\d+)?(?:\.(\d))?)?\}/g;
const WIDE = /[　-鿿＀-｠￠-￦぀-ヿ]/;

export function columns(value: string) {
  let width = 0;
  for (const char of value) {
    width += WIDE.test(char) ? 2 : 1;
  }
  return width;
}

function pad(value: string, align: string | undefined, width: number) {
  const gap = Math.max(0, width - columns(value));
  if (align === '>') {
    return ' '.repeat(gap) + value;
  }
  if (align === '^') {
    return ' '.repeat(Math.floor(gap / 2)) + value + ' '.repeat(Math.ceil(gap / 2));
  }
  return value + ' '.repeat(gap);
}

function formatNumber(value: number, decimals?: number) {
  if (decimals !== undefined) {
    return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(2);
}

function rows(value: unknown) {
  return Array.isArray(value) ? (value as Record<string, string | number>[]) : [];
}

export function formatRow(format: string, row: Record<string, string | number>) {
  return format.replace(COLUMN, (_, key: string, align: string | undefined, width: string | undefined, decimals: string | undefined) => {
    const raw = row[key];
    const text = typeof raw === 'number' ? formatNumber(raw, decimals === undefined ? undefined : Number(decimals)) : String(raw ?? '');
    return width ? pad(text, align, Number(width)) : text;
  });
}

export function expandBindings(text: string, values: AppValues, fields: Field[], blanks: string[] = []) {
  if (!text.includes('{{')) {
    return text;
  }
  return text.replace(BINDING, (match, op: string | undefined, key: string, column: string | undefined) => {
    const value = values[key];
    const field = fields.find((item) => item.key === key);
    if (op === 'sum:') {
      const numbers = rows(value).map((row) => Number(row[column ?? '']) || 0);
      const total = numbers.reduce((sum, number) => sum + number, 0);
      return formatNumber(total, numbers.some((number) => !Number.isInteger(number)) ? 2 : undefined);
    }
    if (op === 'count:') {
      return String(rows(value).length);
    }
    if (op === 'wifi:') {
      return blanks.includes(key) ? '' : String(value ?? '').replace(/([\\;,:"])/g, '\\$1');
    }
    if (!field) {
      return match;
    }
    if (blanks.includes(key)) {
      return '_'.repeat(field.blankLength ?? (field.type === 'longtext' ? 24 : field.type === 'date' ? 10 : 16));
    }
    if (value === undefined) {
      return '';
    }
    if (field.type === 'list') {
      return rows(value)
        .map((row) => formatRow(field.format, row))
        .join('\n');
    }
    if (field.type === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      return new Intl.DateTimeFormat(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(year, month - 1, day));
    }
    if (typeof value === 'number') {
      return formatNumber(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'yes' : '';
    }
    return String(value);
  });
}

export function isShown(when: string | undefined, values: AppValues) {
  if (!when) {
    return true;
  }
  const negate = when.startsWith('!');
  const value = values[negate ? when.slice(1) : when];
  const truthy = Array.isArray(value) ? value.length > 0 : !!value;
  return negate ? !truthy : truthy;
}

export function isMissing(field: Field, values: AppValues, blanks: string[] = []) {
  if (blanks.includes(field.key) || field.type === 'toggle') {
    return false;
  }
  const value = values[field.key];
  return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

export function placeholderKeys(texts: string[]) {
  const keys = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(/\{\{\s*(?:[a-z]+:)?([A-Za-z0-9_]+)(?:\.[A-Za-z0-9_]+)?\s*\}\}/g)) {
      keys.add(match[1]);
    }
  }
  return [...keys];
}

export function guessField(key: string): Field {
  const label = key.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase());
  if (/date|arrival|departure|check_?in|check_?out/i.test(key)) {
    return { key, label, type: 'date', default: '' };
  }
  if (/pin|password|passcode|code/i.test(key)) {
    return { key, label, type: 'password', default: '' };
  }
  if (/url|link|website/i.test(key)) {
    return { key, label, type: 'url', default: '' };
  }
  if (/rules|notes|message|instructions|list/i.test(key)) {
    return { key, label, type: 'longtext', default: '' };
  }
  return { key, label, type: 'text', default: '' };
}

export function defaults(fields: Field[]): AppValues {
  return Object.fromEntries(fields.map((field) => [field.key, structuredClone(field.default)]));
}
