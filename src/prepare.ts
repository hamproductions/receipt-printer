import type { Field } from './apps/types';
import type { Doc, Element, TextElement } from './doc';
import { defaults, expandBindings, formatRow, isShown } from './apps/bindings';
import { findApp } from './apps/registry';
import { fitTextHeight, loadImage } from './render';
import type { TokenContext } from './tokens';

export function fontSpecs(doc: Doc) {
  const extra = doc.app ? JSON.stringify(doc.app.values, (_, value) => typeof value === 'string' && value.startsWith('data:image/') ? '' : value) : '';
  const elements = [...doc.elements, ...(doc.repeats ?? []).flatMap((section) => Object.values(section.variants).flat())];
  return elements.filter((element): element is TextElement => element.kind === 'text').map((element) => ({ family: element.font, weight: element.weight, italic: element.italic, size: element.size, text: element.text + extra }));
}

export function loadImages(doc: Doc) {
  const fields = fieldsOf(doc);
  return Promise.all(doc.elements.map((element) => (element.kind === 'image' ? loadImage(expandBindings(element.src, doc.app?.values ?? {}, fields, doc.app?.blanks)) : Promise.resolve())));
}

export function fieldsOf(doc: Doc): Field[] {
  const manifest = doc.app?.id ? findApp(doc.app.id) : null;
  return [...(manifest && !manifest.user ? manifest.fields : []), ...(doc.fields ?? [])];
}

export function appTokens(doc: Doc, base: Omit<TokenContext, 'values' | 'fields' | 'blanks'>): TokenContext {
  const fields = fieldsOf(doc);
  return fields.length ? { ...base, values: doc.app?.values ?? {}, fields, blanks: doc.app?.blanks ?? [] } : base;
}

type Growth = { id: string; bottom: number; delta: number };

function growths(doc: Doc, elements: Element[], tokens: TokenContext): Growth[] {
  if (doc.landscape || !tokens.fields?.length) {
    return [];
  }
  const sample = { ...tokens, values: defaults(tokens.fields), blanks: [] };
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

function repeatedElements(doc: Doc, elements: Element[], flow: Growth[]) {
  let placed = elements;
  let previousHeight = 0;
  for (const section of [...(doc.repeats ?? [])].sort((a, b) => a.y - b.y)) {
    const value = doc.app?.values[section.field];
    if (!Array.isArray(value)) {
      continue;
    }
    const anchor = section.y + previousHeight + flow.reduce((sum, growth) => section.y >= growth.bottom - 1 ? sum + growth.delta : sum, 0);
    const generated: Element[] = [];
    let offset = 0;
    for (const [index, row] of value.entries()) {
      const template = section.variants[String(row.type)] ?? section.variants.default ?? [];
      const parts = template.filter((part) => isShown(part.when, row)).map((part): Element => {
        const base = { ...part, id: `${section.field}-${index}-${part.id}`, locked: true };
        return base.kind === 'text' ? { ...base, text: formatRow(base.text, row) } : base;
      });
      const growth = parts.filter((part): part is TextElement => part.kind === 'text').map((part) => ({
        id: part.id, bottom: part.y + part.h, delta: fitTextHeight(part) - part.h
      }));
      const laid = parts.map((part) => ({
        ...part,
        y: part.y + growth.reduce((sum, item) => item.id !== part.id && part.y >= item.bottom - 1 ? sum + item.delta : sum, 0),
        h: part.kind === 'text' ? fitTextHeight(part) : part.h
      }));
      const height = Math.max(0, ...laid.map((part) => part.y + part.h));
      generated.push(...laid.map((part) => ({ ...part, y: anchor + offset + part.y })));
      offset += height + section.gap;
    }
    placed = [...placed.map((part) => part.y >= anchor - 1 ? { ...part, y: part.y + offset } : part), ...generated];
    previousHeight += offset;
  }
  return placed;
}

export function layOut(doc: Doc, tokens?: TokenContext): Doc {
  const values = doc.app?.values ?? {};
  const conditional = doc.elements.filter((element) => !element.hidden);
  const visible = conditional.filter((element) => isShown(element.when, values));
  const hidden = conditional.filter((element) => !visible.includes(element));
  const flow = [...(tokens ? growths(doc, visible, tokens) : []), ...collapses(doc, visible, hidden)];
  const elements = visible.map((element): Element => {
    const shift = flow.reduce((total, growth) => (growth.id !== element.id && element.y >= growth.bottom - 1 ? total + growth.delta : total), 0);
    const placed = shift ? { ...element, y: element.y + shift } : element;
    if (placed.kind === 'image') {
      return { ...placed, src: expandBindings(placed.src, values, fieldsOf(doc), doc.app?.blanks) };
    }
    return placed.kind === 'text' ? { ...placed, h: fitTextHeight(placed, tokens) } : placed;
  });
  return { ...doc, elements: repeatedElements(doc, elements, flow) };
}
