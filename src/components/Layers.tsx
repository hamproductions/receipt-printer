import type { Element } from '../doc';
import { expandTokens, type TokenContext } from '../tokens';

type Props = {
  elements: Element[];
  selectedIds: string[];
  tokens: TokenContext;
  onSelect: (id: string, additive: boolean) => void;
};

function describe(element: Element, tokens: TokenContext) {
  switch (element.kind) {
    case 'text':
      return expandTokens(element.text, tokens).replace(/\s+/g, ' ').trim() || 'Empty text';
    case 'image':
      return element.src ? 'Photo' : 'Photo (empty)';
    case 'qr':
      return `QR ${element.data}`;
    case 'barcode':
      return `Barcode ${element.data}`;
    case 'shape':
      return { rect: 'Box', ellipse: 'Circle', line: 'Rule', dashes: 'Dashed rule', zigzag: 'Zigzag', scallop: 'Ticket edge' }[element.shape];
  }
}

const GLYPH: Record<Element['kind'], string> = { text: 'T', image: '▦', qr: '▚', barcode: '║', shape: '□' };

export function Layers({ elements, selectedIds, tokens, onSelect }: Props) {
  if (!elements.length) {
    return null;
  }
  return (
    <section className="layers" aria-label="Layers">
      <h2 className="panel-title">Layers</h2>
      <p className="panel-note">Top of the list prints on top. Shift-click to pick several.</p>
      <ol className="layer-list">
        {[...elements].reverse().map((element) => (
          <li key={element.id}>
            <button type="button" aria-pressed={selectedIds.includes(element.id)} onClick={(event) => onSelect(element.id, event.shiftKey || event.metaKey || event.ctrlKey)}>
              <span className="layer-glyph" aria-hidden="true">
                {GLYPH[element.kind]}
              </span>
              <span className="layer-name">{describe(element, tokens)}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
