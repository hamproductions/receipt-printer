import { createElement, type Element } from '../doc';
import { useEffect, useState } from 'react';
import { defaults } from '../apps/bindings';
import type { Field } from '../apps/types';
import { DEFAULT_PRINT, type Doc } from '../doc';
import { ensureFonts } from '../fonts';
import { fontSpecs, layOut } from '../prepare';
import { fitTextHeight, invalidateLayers, renderDoc } from '../render';
import { buildSection, SECTIONS, stackRows, type SectionId } from '../sections';
import type { TokenContext } from '../tokens';
import { PALETTE_MIME } from './Stage';
import { Button } from './ui/button';
import { paletteStyles } from './palette.styles';
import { panelStyles } from './panel.styles';
import { cx } from '../../styled-system/css';

export type Block = { id: string; label: string; glyph: string; build: (x: number, y: number) => Element };

function shapeBlock(id: string, label: string, glyph: string, patch: Partial<Element>): Block {
  return { id, label, glyph, build: (x, y) => ({ ...createElement('shape', { x, y }), ...patch }) as Element };
}

export const BLOCKS: Block[] = [
  { id: 'heading', label: 'Heading', glyph: 'Aa', build: (x, y) => ({ ...createElement('text', { x, y }), text: 'BIG NEWS', font: 'Archivo Black', size: 48 }) as Element },
  { id: 'text', label: 'Text', glyph: 'abc', build: (x, y) => createElement('text', { x, y }) },
  { id: 'receipt-line', label: 'Price line', glyph: '¥', build: (x, y) => ({ ...createElement('text', { x, y }), text: 'Item name          ¥100', font: 'VT323', size: 26 }) as Element },
  { id: 'fortune', label: 'Dice roll', glyph: '⚂', build: (x, y) => ({ ...createElement('text', { x, y }), text: 'You rolled {dice}', font: 'Silkscreen', size: 28, align: 'center' }) as Element },
  { id: 'image', label: 'Photo', glyph: '▦', build: (x, y) => createElement('image', { x, y }) },
  { id: 'polaroid', label: 'Polaroid', glyph: '▣', build: (x, y) => ({ ...createElement('image', { x, y }), w: 384, h: 440, frame: 'polaroid' }) as Element },
  { id: 'qr', label: 'QR code', glyph: '▚', build: (x, y) => createElement('qr', { x, y }) },
  { id: 'barcode', label: 'Barcode', glyph: '║', build: (x, y) => createElement('barcode', { x, y }) },
  shapeBlock('dashes', 'Dashed rule', '- -', { shape: 'dashes', h: 8, stroke: 3 }),
  shapeBlock('line', 'Rule', '━', { shape: 'line', h: 8, stroke: 3 }),
  shapeBlock('zigzag', 'Zigzag', '/\\/', { shape: 'zigzag', h: 12 }),
  shapeBlock('scallop', 'Ticket edge', '◡◡', { shape: 'scallop', h: 14 }),
  shapeBlock('box', 'Box', '□', { shape: 'rect', w: 160, h: 120, fill: 'none', stroke: 4, radius: 8 }),
  shapeBlock('pattern', 'Pattern fill', '▒', { shape: 'rect', w: 384, h: 80, fill: 'stripes', stroke: 0 }),
  shapeBlock('circle', 'Circle', '○', { shape: 'ellipse', w: 120, h: 120, fill: 'none', stroke: 4 })
];

type Props = { onAdd: (block: Block) => void; onSection: (id: SectionId) => void };

function previewOf(id: SectionId) {
  const section = buildSection(id);
  const sample = section.fields.map((field) => {
    if (field.key === 'guest_name') {
      return { ...field, default: 'Guest name' };
    }
    if (field.type === 'date') {
      return { ...field, default: '2026-12-20' };
    }
    if (field.key === 'wifi_name') {
      return { ...field, default: 'Network' };
    }
    if (field.type === 'password') {
      return { ...field, default: field.key === 'door_pin' ? '1234' : 'password' };
    }
    if (field.key === 'room_number') {
      return { ...field, default: '101' };
    }
    return field;
  }) as Field[];
  const tokens: TokenContext = { seed: 1, copy: 1, now: new Date(), values: defaults(sample), fields: sample, blanks: [] };
  const { elements, bottom } = stackRows(section.rows, 4, (element) => (element.kind === 'text' ? fitTextHeight(element, tokens) : element.h));
  const doc: Doc = { version: 1, name: section.label, landscape: false, length: Math.ceil(bottom + 4), autoLength: false, elements, print: { ...DEFAULT_PRINT } };
  return { doc, tokens, specs: fontSpecs({ ...doc, fields: sample, app: { values: defaults(sample) } }) };
}

export function Palette({ onAdd, onSection }: Props) {
  const [previews, setPreviews] = useState<Partial<Record<SectionId, string>>>({});
  useEffect(() => {
    let cancelled = false;
    const built = SECTIONS.map((section) => ({ id: section.id, ...previewOf(section.id) }));
    ensureFonts(built.flatMap((item) => item.specs)).then(() => {
      if (cancelled) {
        return;
      }
      invalidateLayers();
      setPreviews(Object.fromEntries(built.map((item) => [item.id, renderDoc(layOut(item.doc, item.tokens), item.tokens).toDataURL()])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-label="Blocks">
      <h2 className={panelStyles.heading}>Blocks</h2>
      <p className={panelStyles.note}>Click to add, or drag onto the paper.</p>
      <ul className={paletteStyles.blocks}>
        {BLOCKS.map((block) => (
          <li key={block.id}>
            <Button
              type="button"
              className={paletteStyles.block}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(PALETTE_MIME, block.id);
                event.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onAdd(block)}
            >
              <span className={paletteStyles.glyph} aria-hidden="true">
                {block.glyph}
              </span>
              <span>{block.label}</span>
            </Button>
          </li>
        ))}
      </ul>
      <h2 className={cx(panelStyles.heading, paletteStyles.subtitle)}>Ready-made blocks</h2>
      <p className={panelStyles.note}>Added at the bottom, with their own fields.</p>
      <ul className={paletteStyles.sections}>
        {SECTIONS.map((section) => (
          <li key={section.id}>
            <Button type="button" className={paletteStyles.section} onClick={() => onSection(section.id)} aria-label={`Add ${section.label} block`}>
              <span className={paletteStyles.sectionHead}>
                <span>{section.label}</span>
                <span className={paletteStyles.sectionAdd} aria-hidden="true">
                  + Add
                </span>
              </span>
              <span className={paletteStyles.preview}>{previews[section.id] ? <img className={paletteStyles.image} src={previews[section.id]} alt="" /> : <span className={paletteStyles.loading}>Drawing preview</span>}</span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
