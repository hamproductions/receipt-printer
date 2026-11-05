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

export function expandBindings(text: string, values: AppValues, fields: Field[]) {
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
    if (value === undefined || !field) {
      return match;
    }
    if (field.type === 'list') {
      return rows(value)
        .map((row) => formatRow(field.format, row))
        .join('\n');
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

export function defaults(fields: Field[]): AppValues {
  return Object.fromEntries(fields.map((field) => [field.key, structuredClone(field.default)]));
}
