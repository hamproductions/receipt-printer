import type { Doc, Element, TextElement } from './doc';
import { defaults, isShown } from './apps/bindings';
import { findApp } from './apps/registry';
import { fitTextHeight, loadImage } from './render';
import type { TokenContext } from './tokens';

export function fontSpecs(doc: Doc) {
  const extra = doc.app ? JSON.stringify(doc.app.values) : '';
  return doc.elements.filter((element): element is TextElement => element.kind === 'text').map((element) => ({ family: element.font, weight: element.weight, italic: element.italic, size: element.size, text: element.text + extra }));
}

export function loadImages(doc: Doc) {
  return Promise.all(doc.elements.map((element) => (element.kind === 'image' ? loadImage(element.src) : Promise.resolve())));
}

export function appTokens(doc: Doc, base: Omit<TokenContext, 'values' | 'fields'>): TokenContext {
  const manifest = doc.app ? findApp(doc.app.id) : null;
  return manifest && doc.app ? { ...base, values: doc.app.values, fields: manifest.fields } : base;
}

type Growth = { id: string; bottom: number; delta: number };

function growths(doc: Doc, elements: Element[], tokens: TokenContext): Growth[] {
  if (!doc.app || doc.landscape || !tokens.fields) {
    return [];
  }
  const sample = { ...tokens, values: defaults(tokens.fields) };
  return elements
    .filter((element): element is TextElement => element.kind === 'text' && element.text.includes('{{'))
    .map((element) => {
      const before = fitTextHeight(element, sample);
      return { id: element.id, bottom: element.y + before, delta: fitTextHeight(element, tokens) - before };
    })
    .filter((growth) => growth.delta !== 0);
}

function collapses(doc: Doc, visible: Element[], hidden: Element[]): Growth[] {
  if (doc.landscape || !hidden.length) {
    return [];
  }
  const bands: { top: number; bottom: number }[] = [];
  for (const element of [...hidden].sort((a, b) => a.y - b.y)) {
    const last = bands[bands.length - 1];
    if (last && element.y < last.bottom) {
      last.bottom = Math.max(last.bottom, element.y + element.h);
    } else {
      bands.push({ top: element.y, bottom: element.y + element.h });
    }
  }
  return bands
    .filter((band) => !visible.some((element) => element.y < band.bottom && element.y + element.h > band.top))
    .map((band, index) => {
      const below = doc.elements.filter((element) => element.y >= band.bottom - 1).map((element) => element.y);
      const next = below.length ? Math.min(...below) : band.bottom;
      return { id: `band-${index}`, bottom: band.bottom, delta: -(next - band.top) };
    });
}

export function layOut(doc: Doc, tokens?: TokenContext): Doc {
  const values = doc.app?.values ?? {};
  const visible = doc.elements.filter((element) => isShown(element.when, values));
  const hidden = doc.elements.filter((element) => !visible.includes(element));
  const flow = [...(tokens ? growths(doc, visible, tokens) : []), ...collapses(doc, visible, hidden)];
  return {
    ...doc,
    elements: visible.map((element): Element => {
      const shift = flow.reduce((total, growth) => (growth.id !== element.id && element.y >= growth.bottom - 1 ? total + growth.delta : total), 0);
      const placed = shift ? { ...element, y: element.y + shift } : element;
      return placed.kind === 'text' ? { ...placed, h: fitTextHeight(placed, tokens) } : placed;
    })
  };
}
