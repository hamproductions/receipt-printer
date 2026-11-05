import { useEffect, useState } from 'react';
import type { Doc } from '../doc';
import { ensureFonts } from '../fonts';
import type { PrintedItem, ShelfItem } from '../persistence';
import { PRESETS } from '../presets';
import { invalidateLayers, renderDoc } from '../render';
import { appTokens, fontSpecs, layOut } from '../prepare';

type Props = {
  open: boolean;
  shelf: ShelfItem[];
  printed: PrintedItem[];
  onRemovePrinted: (id: string) => void;
  onClose: () => void;
  onPick: (doc: Doc) => void;
  onRemove: (id: string) => void;
};

type Thumb = { id: string; name: string; hint: string; doc: Doc; image: string | null };

function thumbnail(doc: Doc) {
  const tokens = appTokens(doc, { seed: 1, copy: 1, now: new Date() });
  const output = renderDoc(layOut(doc, tokens), tokens);
  return output.toDataURL();
}

export function PresetDrawer({ open, shelf, printed, onClose, onPick, onRemove, onRemovePrinted }: Props) {
  const [thumbs, setThumbs] = useState<Thumb[]>(() => PRESETS.map((preset) => ({ id: preset.id, name: preset.name, hint: preset.hint, doc: preset.build(), image: null })));
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const visible = needle ? thumbs.filter((thumb) => `${thumb.name} ${thumb.hint} ${thumb.id}`.toLowerCase().includes(needle)) : thumbs;

  useEffect(() => {
    if (!open || thumbs.every((thumb) => thumb.image)) {
      return;
    }
    let cancelled = false;
    ensureFonts(thumbs.flatMap((thumb) => fontSpecs(thumb.doc)))
      .then(() => {
        if (!cancelled) {
          invalidateLayers();
          setThumbs((current) => current.map((thumb) => ({ ...thumb, image: thumbnail(thumb.doc) })));
        }
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [open, thumbs]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="drawer-backdrop" onPointerDown={onClose}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onPointerDown={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <h2 id="drawer-title">Start from a preset</h2>
          <button type="button" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
        <p className="panel-note">Previews are real 1-bit renders of what the printer burns. Picking one replaces the current paper; undo brings it back.</p>
        {failed && <p className="field-error">Fonts did not load, so previews may use a fallback typeface.</p>}
        <label className="field preset-search">
          <span className="field-label">Find a preset</span>
          <input type="search" value={query} placeholder="ticket, 日本語, game..." onChange={(event) => setQuery(event.target.value)} />
        </label>
        {visible.length === 0 && <p className="panel-note">No preset matches “{query}”. Try a shorter word.</p>}
        <ul className="preset-grid">
          {visible.map((thumb) => (
            <li key={thumb.id}>
              <button type="button" className="preset" onClick={() => onPick(PRESETS.find((preset) => preset.id === thumb.id)!.build())}>
                <span className="preset-paper">{thumb.image ? <img src={thumb.image} alt="" /> : <span className="preset-loading">Rendering</span>}</span>
                <span className="preset-name">{thumb.name}</span>
                <span className="preset-hint">{thumb.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        <h2 className="drawer-sub">Printed</h2>
        {printed.length === 0 ? (
          <p className="panel-note">Every print saves itself here automatically, newest first, up to 40.</p>
        ) : (
          <ul className="printed-grid">
            {printed.map((item) => (
              <li key={item.id}>
                <button type="button" className="preset" onClick={() => onPick(item.doc)}>
                  <span className="preset-paper is-printed">
                    <img src={item.thumb} alt="" />
                  </span>
                  <span className="preset-name">{item.doc.name || 'Untitled'}</span>
                  <span className="preset-hint">
                    {new Date(item.printedAt).toLocaleString()}
                    {item.copies > 1 ? `, ${item.copies} copies` : ''}
                  </span>
                </button>
                <button type="button" className="link-button danger" onClick={() => onRemovePrinted(item.id)} aria-label={`Remove ${item.doc.name} from printed`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <h2 className="drawer-sub">My designs</h2>
        {shelf.length === 0 ? (
          <p className="panel-note">Nothing saved yet. Use “Save to my designs” in the print panel to keep a design in this browser.</p>
        ) : (
          <ul className="shelf">
            {shelf.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => onPick(item.doc)}>
                  {item.doc.name || 'Untitled'}
                  <span className="preset-hint">{new Date(item.savedAt).toLocaleString()}</span>
                </button>
                <button type="button" className="danger" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.doc.name}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
