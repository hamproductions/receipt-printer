import { useState, type FormEvent } from 'react';
import { importOffkai, offkaiAvailable } from '../apps/offkai';
import type { AppManifest, AppValues, Field, FieldValue } from '../apps/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, Toggle } from './fields/controls';
import { cx } from '../../styled-system/css';
import { fieldStyles as form } from './fields/styles';
import { panelStyles as panel } from './panel.styles';
import { appPanelStyles as styles } from './app-panel.styles';
import { PerformanceImport } from './PerformanceImport';

type Props = {
  manifest: AppManifest | null;
  fields: Field[];
  customKeys: string[];
  values: AppValues;
  blanks: string[];
  missing: string[];
  placeholders: string[];
  templateName: string | null;
  onChange: (key: string, value: FieldValue, group?: string) => void;
  onBlank: (key: string, blank: boolean) => void;
  onFields: (fields: Field[]) => void;
  onCreateFields: (keys: string[]) => void;
  onReset: () => void;
  onDetach: () => void;
  onImport: (values: AppValues) => void;
  onSaveTemplate: (name: string) => void;
  onUpdateTemplate: () => void;
  onNewCopy: () => void;
};

const FIELD_TYPES: { value: Field['type']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'longtext', label: 'Long text' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'password', label: 'Password or PIN' },
  { value: 'url', label: 'Link' },
  { value: 'number', label: 'Number' },
  { value: 'toggle', label: 'Yes or no' }
];

function retype(field: Field, type: Field['type']): Field {
  const base = { key: field.key, label: field.label, hint: field.hint, required: field.required, perGuest: field.perGuest };
  if (type === 'number') {
    return { ...base, type, default: 0 };
  }
  if (type === 'toggle') {
    return { ...base, type, default: false };
  }
  return { ...base, type, default: '' } as Field;
}

function PasswordInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [shown, setShown] = useState(false);
  return (
    <label className={form.field}>
      <span className={form.label}>{label}</span>
      <span className={styles.passwordRow}>
        <Input type={shown ? 'text' : 'password'} value={value} autoComplete="off" onChange={(event) => onChange(event.target.value)} />
        <Button type="button" onClick={() => setShown((current) => !current)} aria-pressed={shown}>
          {shown ? 'Hide' : 'Show'}
        </Button>
      </span>
    </label>
  );
}

function FieldEditor({ fields, customKeys, onFields }: { fields: Field[]; customKeys: string[]; onFields: (fields: Field[]) => void }) {
  const [draft, setDraft] = useState('');
  const custom = fields.filter((field) => customKeys.includes(field.key));
  const update = (key: string, next: Field) => onFields(custom.map((field) => (field.key === key ? next : field)));
  const add = () => {
    const key = draft.trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!key || fields.some((field) => field.key === key)) {
      return;
    }
    onFields([...custom, { key, label: key.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase()), type: 'text', default: '' }]);
    setDraft('');
  };
  return (
    <details className={panel.details}>
      <summary>Edit fields ({custom.length})</summary>
      {custom.map((field) => (
        <div key={field.key} className={styles.editorRow}>
          <code className={styles.editorCode}>{`{{${field.key}}}`}</code>
          <Input aria-label={`Label for ${field.key}`} value={field.label} onChange={(event) => update(field.key, { ...field, label: event.target.value })} />
          <Select label={`Type of ${field.key}`} value={field.type} options={FIELD_TYPES} onChange={(type) => update(field.key, retype(field, type))} />
          <Toggle label="Required" value={field.required === true} onChange={(required) => update(field.key, { ...field, required })} />
          <Toggle label="Changes per guest" value={field.perGuest === true} onChange={(perGuest) => update(field.key, { ...field, perGuest })} />
          <Button type="button" className={panel.danger} onClick={() => onFields(custom.filter((item) => item.key !== field.key))}>
            Remove
          </Button>
        </div>
      ))}
      <div className={styles.passwordRow}>
        <Input aria-label="New field name" placeholder="new_field_name" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <Button type="button" onClick={add} disabled={!draft.trim()}>
          Add field
        </Button>
      </div>
      <p className={panel.note}>Use a field anywhere by typing its placeholder, for example in text or a QR code.</p>
    </details>
  );
}

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
    <form className={styles.appImport} onSubmit={submit}>
      <label className={form.field}>
        <span className={form.label}>Import from your Offkai attendee link</span>
        <Input type="url" value={url} placeholder="https://offkai.idolbu.moe/?token=..." autoComplete="off" disabled={!offkaiAvailable} onChange={(event) => setUrl(event.target.value)} />
      </label>
      <Toggle label="Also use my attendee number" value={withSerial} disabled={!offkaiAvailable} onChange={setWithSerial} />
      <Button type="submit" disabled={busy || !url.trim() || !offkaiAvailable}>
        {busy ? 'Importing' : 'Import event'}
      </Button>
      <p className={panel.note}>{offkaiAvailable ? 'Only the event name, date, venue and optionally your number are used. The link is cleared after importing and never saved.' : 'Importing needs the local dev server; the static site cannot reach Offkai.'}</p>
      {message && <p className={message.kind === 'error' ? form.error : panel.note}>{message.text}</p>}
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
  if (field.layout === 'stacked') {
    return (
      <fieldset className={styles.appList}>
        <legend className={form.label}>{field.label}</legend>
        {value.map((row, index) => (
          <details key={index} className={panel.details}>
            <summary>{row.number ? `${row.number} · ` : ''}{row.title || `Entry ${index + 1}`}</summary>
            {field.columns.map((column) => (
              <label key={column.key} className={form.field}>
                <span className={form.label}>{column.label}</span>
                <Input value={row[column.key] ?? ''} onChange={(event) => update(index, column.key, event.target.value)} />
              </label>
            ))}
            <div className={panel.row}>
              <Button type="button" disabled={index === 0} onClick={() => move(index, -1)}>Move up</Button>
              <Button type="button" className={panel.danger} onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}>Remove</Button>
            </div>
          </details>
        ))}
        <Button type="button" onClick={() => onChange([...value, { ...blank(), type: 'song' }])}>Add an entry</Button>
      </fieldset>
    );
  }
  return (
    <fieldset className={styles.appList}>
      <legend className={form.label}>{field.label}</legend>
      <div className={styles.appListRow} style={{ gridTemplateColumns: `${field.columns.map((column) => (column.type === 'number' ? '64px' : 'minmax(0, 1fr)')).join(' ')} auto` }}>
        {field.columns.map((column) => (
          <span key={column.key} className={styles.appListLabel}>{column.label}</span>
        ))}
        <span />
      </div>
      {value.map((row, index) => (
        <div key={index} className={styles.appListRow} style={{ gridTemplateColumns: `${field.columns.map((column) => (column.type === 'number' ? '64px' : 'minmax(0, 1fr)')).join(' ')} auto` }}>
          {field.columns.map((column) => (
            <Input
              className={styles.appListInput}
              key={column.key}
              aria-label={`${column.label} ${index + 1}`}
              type={column.type === 'number' ? 'number' : 'text'}
              value={row[column.key] ?? ''}
              onChange={(event) => update(index, column.key, column.type === 'number' ? Number(event.target.value) || 0 : event.target.value)}
            />
          ))}
          <span className={styles.appActions}>
            <Button type="button" className={styles.appAction} aria-label={`Move row ${index + 1} up`} onClick={() => move(index, -1)} disabled={index === 0}>
              ↑
            </Button>
            <Button type="button" className={cx(styles.appAction, panel.danger)} aria-label={`Remove row ${index + 1}`} onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}>
              ×
            </Button>
          </span>
        </div>
      ))}
      <Button type="button" onClick={() => onChange([...value, blank()])} disabled={field.max !== undefined && value.length >= field.max}>
        Add a row
      </Button>
    </fieldset>
  );
}

function FieldInput({ field, value, onChange }: { field: Field; value: FieldValue | undefined; onChange: (value: FieldValue, group?: string) => void }) {
  const group = `app-${field.key}`;
  switch (field.type) {
    case 'list':
      return <ListField field={field} value={Array.isArray(value) ? value : []} onChange={onChange} />;
    case 'toggle':
      return <Toggle label={field.label} value={value === true} onChange={onChange} />;
    case 'select':
      return <Select label={field.label} value={String(value ?? field.default)} options={field.options.map((option) => ({ value: option, label: option }))} onChange={onChange} />;
    case 'number':
      return (
        <label className={form.field}>
          <span className={form.label}>{field.label}</span>
          <Input type="number" min={field.min} max={field.max} step={field.step} value={Number(value ?? field.default)} onChange={(event) => onChange(Number(event.target.value) || 0, group)} />
        </label>
      );
    case 'longtext':
      return (
        <label className={form.field}>
          <span className={form.label}>{field.label}</span>
          <textarea className={form.textarea} rows={3} value={String(value ?? '')} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value, group)} />
        </label>
      );
    case 'password':
      return <PasswordInput label={field.label} value={String(value ?? '')} onChange={(next) => onChange(next, group)} />;
    default:
      return (
        <label className={form.field}>
          <span className={form.label}>{field.label}</span>
          <Input type={field.type === 'url' ? 'url' : field.type} value={String(value ?? '')} placeholder={'placeholder' in field ? field.placeholder : undefined} onChange={(event) => onChange(event.target.value, group)} />
        </label>
      );
  }
}

export function AppPanel(props: Props) {
  const { manifest, fields, values, blanks, missing, placeholders, templateName } = props;
  const [templateDraft, setTemplateDraft] = useState('');
  const title = templateName ?? manifest?.name ?? 'Fields';
  return (
    <section className={styles.app} aria-label={`${title} settings`}>
      <h2 className={panel.heading}>{title}</h2>
      <p className={panel.note}>Type here and the paper updates.</p>
      {manifest?.importer === 'offkai' && <OffkaiImport onImport={props.onImport} />}
      {typeof manifest?.importer === 'object' && <PerformanceImport key={manifest.id} config={manifest.importer} onImport={props.onImport} />}
      {placeholders.length > 0 && (
        <div className={styles.placeholder}>
          <p className={styles.placeholderText}>
            Placeholders without a field: {placeholders.map((key) => `{{${key}}}`).join(', ')}
          </p>
          <Button type="button" onClick={() => props.onCreateFields(placeholders)}>
            Create {placeholders.length === 1 ? 'this field' : `these ${placeholders.length} fields`}
          </Button>
        </div>
      )}
      {missing.length > 0 && <p className={form.error}>{missing.length === 1 ? '1 field' : `${missing.length} fields`} to fill in before printing</p>}
      <div className={styles.appFields}>
        {fields.filter((field) => !field.hidden).map((field) => {
          const blank = blanks.includes(field.key);
          return (
            <div key={field.key} className={styles.appField} data-missing={missing.includes(field.key)} data-blank={blank}>
              {blank ? (
                <div className={form.field}>
                  <span className={form.label}>{field.label}</span>
                  <p className={styles.blankNote}>Prints a blank line to write on</p>
                </div>
              ) : (
                <FieldInput field={field.required ? ({ ...field, label: `${field.label} *` } as Field) : field} value={values[field.key]} onChange={(value, group) => props.onChange(field.key, value, group)} />
              )}
              {field.type !== 'toggle' && field.type !== 'list' && (
                <Button type="button" className={styles.blankToggle} aria-pressed={blank} title="Print a blank line to fill in by hand" onClick={() => props.onBlank(field.key, !blank)}>
                  {blank ? 'Type it' : 'Handwrite'}
                </Button>
              )}
              {field.hint && <p className={panel.note}>{field.hint}</p>}
            </div>
          );
        })}
      </div>
      <FieldEditor fields={fields} customKeys={props.customKeys} onFields={props.onFields} />
      <div className={panel.row}>
        {templateName ? (
          <>
            <Button type="button" onClick={props.onNewCopy}>
              New guest copy
            </Button>
            <Button type="button" onClick={props.onUpdateTemplate}>
              Update template
            </Button>
          </>
        ) : (
          fields.length > 0 && (
            <span className={styles.passwordRow}>
              <Input aria-label="Template name" placeholder="Template name" value={templateDraft} onChange={(event) => setTemplateDraft(event.target.value)} />
              <Button type="button" disabled={!templateDraft.trim()} onClick={() => props.onSaveTemplate(templateDraft.trim())}>
                Save as template
              </Button>
            </span>
          )
        )}
        {manifest && !manifest.user && (
          <Button type="button" onClick={props.onReset}>
            Reset to sample
          </Button>
        )}
        <Button type="button" onClick={props.onDetach}>
          Turn into plain text
        </Button>
      </div>
    </section>
  );
}
