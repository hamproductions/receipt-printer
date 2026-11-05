import { useState, type FormEvent } from 'react';
import { importOffkai, offkaiAvailable } from '../apps/offkai';
import type { AppManifest, AppValues, Field, FieldValue } from '../apps/types';

type Props = {
  manifest: AppManifest;
  values: AppValues;
  onChange: (key: string, value: FieldValue, group?: string) => void;
  onReset: () => void;
  onDetach: () => void;
  onImport: (values: AppValues) => void;
};

function OffkaiImport({ onImport }: { onImport: (values: AppValues) => void }) {
  const [url, setUrl] = useState('');
  const [withSerial, setWithSerial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'done' | 'error'; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await importOffkai(url, withSerial);
      onImport(result.values);
      setUrl('');
      setMessage({ kind: 'done', text: result.serial ? 'Imported the event and your attendee number.' : 'Imported the event name, date and venue. The number was left as is.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="app-import" onSubmit={submit}>
      <label className="field">
        <span className="field-label">Import from your Offkai attendee link</span>
        <input type="url" value={url} placeholder="https://offkai.idolbu.moe/?token=..." autoComplete="off" disabled={!offkaiAvailable} onChange={(event) => setUrl(event.target.value)} />
      </label>
      <label className="field toggle">
        <input type="checkbox" checked={withSerial} disabled={!offkaiAvailable} onChange={(event) => setWithSerial(event.target.checked)} />
        <span>Also use my attendee number</span>
      </label>
      <button type="submit" disabled={busy || !url.trim() || !offkaiAvailable}>
        {busy ? 'Importing' : 'Import event'}
      </button>
      <p className="panel-note">{offkaiAvailable ? 'Only the event name, date, venue and optionally your number are used. The link is cleared after importing and never saved.' : 'Importing needs the local dev server; the static site cannot reach Offkai.'}</p>
      {message && <p className={message.kind === 'error' ? 'field-error' : 'panel-note'}>{message.text}</p>}
    </form>
  );
}

type Row = Record<string, string | number>;

function ListField({ field, value, onChange }: { field: Extract<Field, { type: 'list' }>; value: Row[]; onChange: (rows: Row[], group?: string) => void }) {
  const blank = () => Object.fromEntries(field.columns.map((column) => [column.key, column.type === 'number' ? 0 : ''])) as Row;
  const update = (index: number, key: string, cell: string | number) => onChange(value.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: cell } : row)), `app-${field.key}-${index}-${key}`);
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) {
      return;
    }
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <fieldset className="field app-list">
      <legend className="field-label">{field.label}</legend>
      <div className="app-list-head" style={{ gridTemplateColumns: `${field.columns.map((column) => (column.type === 'number' ? '64px' : 'minmax(0, 1fr)')).join(' ')} auto` }}>
        {field.columns.map((column) => (
          <span key={column.key}>{column.label}</span>
        ))}
        <span />
      </div>
      {value.map((row, index) => (
        <div key={index} className="app-list-row" style={{ gridTemplateColumns: `${field.columns.map((column) => (column.type === 'number' ? '64px' : 'minmax(0, 1fr)')).join(' ')} auto` }}>
          {field.columns.map((column) => (
            <input
              key={column.key}
              aria-label={`${column.label} ${index + 1}`}
              type={column.type === 'number' ? 'number' : 'text'}
              value={row[column.key] ?? ''}
              onChange={(event) => update(index, column.key, column.type === 'number' ? Number(event.target.value) || 0 : event.target.value)}
            />
          ))}
          <span className="app-row-actions">
            <button type="button" aria-label={`Move row ${index + 1} up`} onClick={() => move(index, -1)} disabled={index === 0}>
              ↑
            </button>
            <button type="button" className="danger" aria-label={`Remove row ${index + 1}`} onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}>
              ×
            </button>
          </span>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, blank()])} disabled={field.max !== undefined && value.length >= field.max}>
        Add a row
      </button>
    </fieldset>
  );
}

function FieldInput({ field, value, onChange }: { field: Field; value: FieldValue | undefined; onChange: (value: FieldValue, group?: string) => void }) {
  const group = `app-${field.key}`;
  switch (field.type) {
    case 'list':
      return <ListField field={field} value={Array.isArray(value) ? value : []} onChange={onChange} />;
    case 'toggle':
      return (
        <label className="field toggle">
          <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
          <span>{field.label}</span>
        </label>
      );
    case 'select':
      return (
        <label className="field">
          <span className="field-label">{field.label}</span>
          <select value={String(value ?? field.default)} onChange={(event) => onChange(event.target.value)}>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      );
    case 'number':
      return (
        <label className="field">
          <span className="field-label">{field.label}</span>
          <input type="number" min={field.min} max={field.max} step={field.step} value={Number(value ?? field.default)} onChange={(event) => onChange(Number(event.target.value) || 0, group)} />
        </label>
      );
    case 'longtext':
      return (
        <label className="field">
          <span className="field-label">{field.label}</span>
          <textarea rows={3} value={String(value ?? '')} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value, group)} />
        </label>
      );
    default:
      return (
        <label className="field">
          <span className="field-label">{field.label}</span>
          <input type={field.type === 'url' ? 'url' : field.type} value={String(value ?? '')} placeholder={'placeholder' in field ? field.placeholder : undefined} onChange={(event) => onChange(event.target.value, group)} />
        </label>
      );
  }
}

export function AppPanel({ manifest, values, onChange, onReset, onDetach, onImport }: Props) {
  return (
    <section className="app-panel" aria-label={`${manifest.name} settings`}>
      <h2 className="panel-title">{manifest.name}</h2>
      <p className="panel-note">{manifest.hint}. Fill these in and the paper updates. You can still drag and restyle anything.</p>
      {manifest.importer === 'offkai' && <OffkaiImport onImport={onImport} />}
      <div className="app-fields">
        {manifest.fields.map((field) => (
          <div key={field.key}>
            <FieldInput field={field} value={values[field.key]} onChange={(value, group) => onChange(field.key, value, group)} />
            {field.hint && <p className="panel-note">{field.hint}</p>}
          </div>
        ))}
      </div>
      <div className="button-row">
        <button type="button" onClick={onReset}>
          Reset to sample
        </button>
        <button type="button" onClick={onDetach}>
          Turn into plain text
        </button>
      </div>
    </section>
  );
}
