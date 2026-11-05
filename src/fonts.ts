export type FontCategory = 'pixel' | 'receipt' | 'display' | 'hand' | 'japanese';

export type FontInfo = {
  family: string;
  category: FontCategory;
  weights: number[];
  japanese: boolean;
  custom?: boolean;
  local?: string[];
  fallback?: string[];
};

export const FONTS: FontInfo[] = [
  { family: 'DotGothic16', category: 'pixel', weights: [400], japanese: true },
  { family: 'Press Start 2P', category: 'pixel', weights: [400], japanese: false },
  { family: 'Silkscreen', category: 'pixel', weights: [400, 700], japanese: false },
  { family: 'Pixelify Sans', category: 'pixel', weights: [400, 700], japanese: false },
  { family: 'VT323', category: 'receipt', weights: [400], japanese: false },
  { family: 'Courier Prime', category: 'receipt', weights: [400, 700], japanese: false },
  { family: 'Space Mono', category: 'receipt', weights: [400, 700], japanese: false },
  { family: 'M PLUS 1 Code', category: 'receipt', weights: [400, 700], japanese: true },
  { family: 'Bebas Neue', category: 'display', weights: [400], japanese: false },
  { family: 'Archivo Black', category: 'display', weights: [400], japanese: false },
  { family: 'Rubik Mono One', category: 'display', weights: [400], japanese: false },
  { family: 'Bungee', category: 'display', weights: [400], japanese: false },
  { family: 'Monoton', category: 'display', weights: [400], japanese: false },
  { family: 'Caveat', category: 'hand', weights: [400, 700], japanese: false },
  { family: 'Permanent Marker', category: 'hand', weights: [400], japanese: false },
  { family: 'MS Gothic', category: 'japanese', weights: [400, 700], japanese: true, local: ['MS Gothic', 'ＭＳ ゴシック'], fallback: ['IBM Plex Sans Local', 'IBM Plex Sans JP Local'] },
  { family: 'IBM Plex Sans JP', category: 'japanese', weights: [400, 700], japanese: true },
  { family: 'Noto Sans JP', category: 'japanese', weights: [400, 700, 900], japanese: true },
  { family: 'Zen Kaku Gothic New', category: 'japanese', weights: [400, 700, 900], japanese: true },
  { family: 'Dela Gothic One', category: 'japanese', weights: [400], japanese: true },
  { family: 'Kosugi Maru', category: 'japanese', weights: [400], japanese: true },
  { family: 'Yusei Magic', category: 'japanese', weights: [400], japanese: true },
  { family: 'Reggae One', category: 'japanese', weights: [400], japanese: true },
  { family: 'Rampart One', category: 'japanese', weights: [400], japanese: true },
  { family: 'Train One', category: 'japanese', weights: [400], japanese: true }
];

export const CATEGORY_LABEL: Record<FontCategory, string> = {
  pixel: 'Pixel',
  receipt: 'Receipt',
  display: 'Display',
  hand: 'Handwritten',
  japanese: '日本語'
};

const requested = new Map<string, Promise<void>>();
const customFonts: FontInfo[] = [];

export function allFonts() {
  return [...FONTS, ...customFonts];
}

export function fontInfo(family: string) {
  return allFonts().find((font) => font.family === family);
}

export function hasLocalFont(names: string[]) {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) {
    return false;
  }
  const sample = 'あいう漢字ｱｲｳABCabc123';
  return names.some((name) =>
    ['monospace', 'serif', 'sans-serif'].some((generic) => {
      context.font = `60px ${generic}`;
      const base = context.measureText(sample).width;
      context.font = `60px "${name}", ${generic}`;
      return context.measureText(sample).width !== base;
    })
  );
}

export function fontStack(family: string) {
  const info = fontInfo(family);
  const names = info?.local ? [...info.local] : [family];
  if (info?.fallback) {
    names.push(...info.fallback);
  }
  return [...names.map((name) => `"${name}"`), '"Noto Sans JP"', 'sans-serif'].join(', ');
}

export function requestFont(family: string): Promise<void> {
  const info = fontInfo(family);
  if (!info || info.custom || info.local) {
    return Promise.resolve();
  }
  const existing = requested.get(family);
  if (existing) {
    return existing;
  }
  const weights = info.weights.length > 1 ? `:wght@${info.weights.join(';')}` : '';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}${weights}&display=block`;
  const loaded = new Promise<void>((resolve) => {
    link.onload = () => resolve();
    link.onerror = () => resolve();
  });
  requested.set(family, loaded);
  document.head.append(link);
  return loaded;
}

export async function ensureFonts(specs: { family: string; weight: number; italic: boolean; size: number; text: string }[]) {
  const loads = specs.map(async (spec) => {
    await requestFont(spec.family);
    const style = spec.italic ? 'italic ' : '';
    const fallback = fontInfo(spec.family)?.fallback;
    const families = fallback ?? [spec.family];
    await Promise.all(families.map((family) => document.fonts.load(`${style}${spec.weight} ${spec.size}px "${family}"`, spec.text || 'a').catch(() => [])));
  });
  await Promise.all(loads);
}

export async function addCustomFont(file: File) {
  const family = file.name.replace(/\.[^.]+$/, '').slice(0, 48) || 'Custom font';
  const face = new FontFace(family, await file.arrayBuffer());
  await face.load();
  document.fonts.add(face);
  if (!customFonts.some((font) => font.family === family)) {
    customFonts.push({ family, category: 'display', weights: [400], japanese: false, custom: true });
  }
  return family;
}
