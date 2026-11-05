import { expandBindings } from './apps/bindings';
import type { AppValues, Field } from './apps/types';

const TOKEN = /\{(date|time|copy|dice|coin|pick:[^{}]*|num:\d+-\d+)\}/g;

function random(seed: number) {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

export type TokenContext = { seed: number; copy: number; now: Date; values?: AppValues; fields?: Field[]; blanks?: string[] };

export function hasTokens(text: string) {
  return text.search(TOKEN) >= 0;
}

export function expandTokens(raw: string, context: TokenContext) {
  let index = 0;
  const text = context.values && context.fields ? expandBindings(raw, context.values, context.fields, context.blanks) : raw;
  return text.replace(TOKEN, (_, token: string) => {
    index += 1;
    const roll = random(context.seed * 7919 + context.copy * 104729 + index * 31);
    const { now } = context;
    if (token === 'date') {
      return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }
    if (token === 'time') {
      return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }
    if (token === 'copy') {
      return String(context.copy);
    }
    if (token === 'dice') {
      return String(1 + Math.floor(roll * 6));
    }
    if (token === 'coin') {
      return roll < 0.5 ? 'HEADS' : 'TAILS';
    }
    if (token.startsWith('pick:')) {
      const options = token.slice(5).split('|').filter((option) => option.trim());
      return options[Math.floor(roll * options.length)] ?? '';
    }
    const [min, max] = token.slice(4).split('-').map(Number);
    const low = Math.min(min, max);
    return String(low + Math.floor(roll * (Math.abs(max - min) + 1)));
  });
}

export const TOKEN_HELP = [
  { token: '{date}', meaning: "Today's date" },
  { token: '{time}', meaning: 'Current time' },
  { token: '{copy}', meaning: 'Copy number when printing several' },
  { token: '{dice}', meaning: 'Rolls 1 to 6' },
  { token: '{coin}', meaning: 'HEADS or TAILS' },
  { token: '{num:1-100}', meaning: 'Random number in a range' },
  { token: '{pick:a|b|c}', meaning: 'Picks one option' }
];
