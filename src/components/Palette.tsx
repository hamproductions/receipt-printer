import { createElement, type Element } from '../doc';
import { PALETTE_MIME } from './Stage';

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

type Props = { onAdd: (block: Block) => void };

export function Palette({ onAdd }: Props) {
  return (
    <section className="palette" aria-label="Blocks">
      <h2 className="panel-title">Blocks</h2>
      <p className="panel-note">Drag onto the paper, or click to add.</p>
      <ul className="block-list">
        {BLOCKS.map((block) => (
          <li key={block.id}>
            <button
              type="button"
              className="block"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(PALETTE_MIME, block.id);
                event.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onAdd(block)}
            >
              <span className="block-glyph" aria-hidden="true">
                {block.glyph}
              </span>
              <span>{block.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
