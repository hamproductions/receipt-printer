import type { DocApp, Field } from './apps/types';

export const PAPER_DOTS = 384;
export const DOTS_PER_MM = 8;

export type Align = 'left' | 'center' | 'right';
export type DitherAlgo = 'floyd' | 'atkinson' | 'stucki' | 'jarvis' | 'sierra' | 'bayer' | 'grain' | 'halftone' | 'engrave' | 'crosshatch' | 'stipple' | 'threshold';
export type ImageFit = 'cover' | 'contain' | 'stretch';
export type ImageFrame = 'none' | 'polaroid' | 'border';
export type BarcodeFormat = 'CODE128' | 'CODE39' | 'EAN13' | 'UPC' | 'ITF14';
export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'dashes' | 'zigzag' | 'scallop' | 'icon';
export type IconName = 'wifi' | 'key' | 'home' | 'calendar' | 'clock' | 'rules' | 'plug' | 'check' | 'trash' | 'heart' | 'info' | 'star';
export type Fill = 'none' | 'solid' | 'gray25' | 'gray50' | 'gray75' | 'stripes' | 'dots' | 'checker';

type Base = {
  id: string;
  when?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  invert: boolean;
  group?: string;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
};

export type TextElement = Base & {
  kind: 'text';
  text: string;
  font: string;
  size: number;
  weight: number;
  italic: boolean;
  align: Align;
  lineHeight: number;
  letterSpacing: number;
  fit?: 'grow' | 'shrink' | 'line';
  role?: 'heading' | 'body';
};

export type ImageElement = Base & {
  kind: 'image';
  src: string;
  fit: ImageFit;
  frame?: ImageFrame;
  trim?: boolean;
  autoTrim?: boolean;
  pixelated?: boolean;
  framePad?: number;
  frameBottom?: number;
  cropZoom?: number;
  cropX?: number;
  cropY?: number;
  dither: DitherAlgo;
  brightness: number;
  contrast: number;
  gamma: number;
  threshold: number;
};

export type QrElement = Base & {
  kind: 'qr';
  data: string;
  ecc: 'L' | 'M' | 'Q' | 'H';
};

export type BarcodeElement = Base & {
  kind: 'barcode';
  data: string;
  format: BarcodeFormat;
  showText: boolean;
};

export type ShapeElement = Base & {
  kind: 'shape';
  shape: ShapeKind;
  icon?: IconName;
  fill: Fill;
  stroke: number;
  radius: number;
};

export type Element = TextElement | ImageElement | QrElement | BarcodeElement | ShapeElement;
export type ElementKind = Element['kind'];

export type PrintSettings = {
  heat: number;
  rotate?: 90 | 270;
  cut?: 'none' | 'full' | 'partial';
  cutFeed?: number;
  printWidth?: number;
  copies: number;
  darkness: number;
};

export type RepeatingSection = {
  field: string;
  y: number;
  gap: number;
  variants: Record<string, Element[]>;
};

export type Doc = {
  version: 1;
  name: string;
  landscape: boolean;
  length: number;
  autoLength: boolean;
  endSpace?: number;
  app?: DocApp;
  fields?: Field[];
  repeats?: RepeatingSection[];
  guides?: { x: number[]; y: number[] };
  sections?: Record<string, { gap?: number; inset?: number; align?: 'left' | 'center' | 'right'; name?: string }>;
  elements: Element[];
  print: PrintSettings;
};

export const DEFAULT_PRINT: PrintSettings = { heat: 0, copies: 1, darkness: 128 };
export const DEFAULT_END_SPACE = 96;

let counter = 0;
export function newId() {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

export function docSize(doc: Doc) {
  const length = doc.autoLength ? autoLength(doc) : doc.length;
  return doc.landscape ? { width: length, height: PAPER_DOTS } : { width: PAPER_DOTS, height: length };
}

function autoLength(doc: Doc) {
  if (!doc.elements.length) {
    return 120;
  }
  const end = doc.elements.reduce((max, element) => Math.max(max, doc.landscape ? element.x + element.w : element.y + element.h), 0);
  return Math.max(8, Math.ceil(end + (doc.endSpace ?? DEFAULT_END_SPACE)));
}

export function createElement(kind: ElementKind, at: { x: number; y: number }): Element {
  const base = { id: newId(), x: at.x, y: at.y, rotation: 0, invert: false };
  switch (kind) {
    case 'text':
      return { ...base, kind, w: 384, h: 40, text: 'Double-click to edit', font: 'DotGothic16', size: 28, weight: 400, italic: false, align: 'left', lineHeight: 1.2, letterSpacing: 0 };
    case 'image':
      return { ...base, kind, w: 384, h: 288, src: '', fit: 'cover', dither: 'threshold', brightness: 0, contrast: 0, gamma: 1, threshold: 128 };
    case 'qr':
      return { ...base, kind, w: 160, h: 160, data: 'https://example.com', ecc: 'M' };
    case 'barcode':
      return { ...base, kind, w: 384, h: 90, data: '0123456789', format: 'CODE128', showText: true };
    case 'shape':
      return { ...base, kind, w: 384, h: 8, shape: 'dashes', fill: 'solid', stroke: 3, radius: 0 };
  }
}

export function cloneElement(element: Element, offset = 16): Element {
  return { ...element, id: newId(), x: element.x + offset, y: element.y + offset };
}

export function isDoc(value: unknown): value is Doc {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const doc = value as Partial<Doc>;
  return doc.version === 1 && Array.isArray(doc.elements) && typeof doc.length === 'number' && typeof doc.name === 'string';
}

export function normalizeDoc(doc: Doc): Doc {
  const print = { ...DEFAULT_PRINT, ...doc.print };
  return {
    ...doc,
    endSpace: doc.endSpace ?? DEFAULT_END_SPACE,
    print: { heat: print.heat, copies: print.copies, darkness: print.darkness, rotate: print.rotate, cut: print.cut, cutFeed: print.cutFeed, printWidth: print.printWidth }
  };
}
