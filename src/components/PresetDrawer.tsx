import { useEffect, useState } from 'react';
import type { Doc } from '../doc';
import { ensureFonts } from '../fonts';
import type { PrintedItem, ShelfItem } from '../persistence';
import { buildApp, saveTemplates, userTemplates } from '../apps/registry';
import { PRESETS } from '../presets';
import { invalidateLayers, renderDoc } from '../render';
import { appTokens, fontSpecs, layOut } from '../prepare';
import { Modal } from './Modal';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { css, cx } from '../../styled-system/css';
import { presetStyles as styles } from './preset.styles';
import { panelStyles } from './panel.styles';
import { fieldStyles } from './fields/styles';

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
  const [templates, setTemplates] = useState(() => userTemplates());
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
    if (open) {
      setTemplates(userTemplates());
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Start from a preset" wide>
        <p className={panelStyles.note}>Previews are real 1-bit renders of what the printer burns. Picking one replaces the current paper; undo brings it back.</p>
        {failed && <p className={fieldStyles.error}>Fonts did not load, so previews may use a fallback typeface.</p>}
        <label className={styles.search}>
          <span className={fieldStyles.label}>Find a preset</span>
          <Input type="search" value={query} placeholder="ticket, 日本語, game..." onChange={(event) => setQuery(event.target.value)} />
        </label>
        {visible.length === 0 && <p className={panelStyles.note}>No preset matches “{query}”. Try a shorter word.</p>}
        <ul className={styles.grid}>
          {visible.map((thumb) => (
            <li key={thumb.id}>
              <Button type="button" className={styles.preset} onClick={() => onPick(PRESETS.find((preset) => preset.id === thumb.id)!.build())}>
                <span className={styles.paper}>{thumb.image ? <img src={thumb.image} alt="" /> : <span className={styles.loading}>Rendering</span>}</span>
                <span className={styles.name}>{thumb.name}</span>
                <span className={styles.hint}>{thumb.hint}</span>
              </Button>
            </li>
          ))}
        </ul>
        <h2 className={styles.sub}>My templates</h2>
        {templates.length === 0 ? (
          <p className={panelStyles.note}>Add fields to a design, then use Save as template in the Fields panel. Each new copy starts with the per-guest fields empty.</p>
        ) : (
          <ul className={styles.shelf}>
            {templates.map((template) => (
              <li key={template.id}>
                <Button type="button" onClick={() => onPick(buildApp(template))}>
                  {template.name}
                  <span className={styles.hint}>
                    {template.fields.length} fields, new copy
                  </span>
                </Button>
                <Button
                  type="button"
                  className={panelStyles.danger}
                  aria-label={`Delete template ${template.name}`}
                  onClick={() => {
                    const next = templates.filter((item) => item.id !== template.id);
                    saveTemplates(next);
                    setTemplates(next);
                  }}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
        <h2 className={styles.sub}>Sent to printer</h2>
        {printed.length === 0 ? (
          <p className={panelStyles.note}>Every design you send to the printer is kept here automatically, newest first, up to 40.</p>
        ) : (
          <ul className={styles.printed}>
            {printed.map((item) => (
              <li key={item.id}>
                <Button type="button" className={styles.preset} onClick={() => onPick(item.doc)}>
                  <span className={cx(styles.paper, css({ height: '150px' }))}>
                    <img src={item.thumb} alt="" />
                  </span>
                  <span className={styles.name}>{item.doc.name || 'Untitled'}</span>
                  <span className={styles.hint}>
                    {new Date(item.printedAt).toLocaleString()}
                    {item.copies > 1 ? `, ${item.copies} copies` : ''}
                  </span>
                </Button>
                <Button type="button" className={styles.remove} onClick={() => onRemovePrinted(item.id)} aria-label={`Remove ${item.doc.name} from printed`}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <h2 className={styles.sub}>My designs</h2>
        {shelf.length === 0 ? (
          <p className={panelStyles.note}>Nothing saved yet. Use “Save to my designs” in the print panel to keep a design in this browser.</p>
        ) : (
          <ul className={styles.shelf}>
            {shelf.map((item) => (
              <li key={item.id}>
                <Button type="button" onClick={() => onPick(item.doc)}>
                  {item.doc.name || 'Untitled'}
                  <span className={styles.hint}>{new Date(item.savedAt).toLocaleString()}</span>
                </Button>
                <Button type="button" className={css({ color: 'danger' })} onClick={() => onRemove(item.id)} aria-label={`Remove ${item.doc.name}`}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
    </Modal>
  );
}
