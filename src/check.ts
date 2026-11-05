import type { Doc, Element } from './doc';
import { textClipped, textInkSpan } from './render';
import { expandTokens, type TokenContext } from './tokens';

export type Issue = { id: string; kind: 'clip' | 'overlap' | 'bounds'; message: string };

type Rect = { x: number; y: number; w: number; h: number };

function inkRect(element: Element, tokens: TokenContext): Rect | null {
  if (element.kind === 'text') {
    if (!expandTokens(element.text, tokens).trim()) {
      return null;
    }
    const span = textInkSpan(element, tokens);
    return { x: element.x + span.start, y: element.y, w: span.width, h: element.h };
  }
  if (element.kind === 'image' && !element.src) {
    return null;
  }
  if (element.kind === 'shape') {
    return null;
  }
  return { x: element.x, y: element.y, w: element.w, h: element.h };
}

function rotated(element: Element, rect: Rect): Rect {
  if (!element.rotation) {
    return rect;
  }
  const radians = (element.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const w = rect.w * cos + rect.h * sin;
  const h = rect.w * sin + rect.h * cos;
  const cx = element.x + element.w / 2;
  const cy = element.y + element.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function name(element: Element, tokens: TokenContext) {
  if (element.kind === 'text') {
    const text = expandTokens(element.text, tokens).replace(/\s+/g, ' ').trim();
    return `“${text.length > 24 ? `${text.slice(0, 24)}…` : text}”`;
  }
  return { image: 'A photo', qr: 'A QR code', barcode: 'A barcode', shape: 'A shape' }[element.kind];
}

export function checkLayout(doc: Doc, size: { width: number; height: number }, tokens: TokenContext): Issue[] {
  const issues: Issue[] = [];
  const content: { element: Element; rect: Rect }[] = [];
  for (const element of doc.elements) {
    if (element.kind === 'text' && textClipped(element, tokens)) {
      issues.push({ id: element.id, kind: 'clip', message: `${name(element, tokens)} is cut off: it does not fit its box even at the smallest size.` });
    }
    const ink = inkRect(element, tokens);
    const box = rotated(element, ink ?? { x: element.x, y: element.y, w: element.w, h: element.h });
    if (box.x < -0.5 || box.y < -0.5 || box.x + box.w > size.width + 0.5 || box.y + box.h > size.height + 0.5) {
      issues.push({ id: element.id, kind: 'bounds', message: `${name(element, tokens)} goes past the edge of the paper and will be cut off when printing.` });
    }
    if (ink && !(element.kind === 'text' && element.invert)) {
      content.push({ element, rect: rotated(element, ink) });
    }
  }
  for (let i = 0; i < content.length; i += 1) {
    for (let j = i + 1; j < content.length; j += 1) {
      const a = content[i].rect;
      const b = content[j].rect;
      const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (overlapW > 2 && overlapH > 2 && overlapW * overlapH > 16) {
        const first = content[i].element;
        const second = content[j].element;
        issues.push({ id: first.id, kind: 'overlap', message: `${name(first, tokens)} overlaps ${name(second, tokens)}.` });
        issues.push({ id: second.id, kind: 'overlap', message: `${name(second, tokens)} overlaps ${name(first, tokens)}.` });
      }
    }
  }
  return issues;
}
