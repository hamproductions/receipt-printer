import { useMemo, useState, type FormEvent } from 'react';
import { createSetlistImporter, type Performance } from '../apps/setlist-import';
import type { AppValues, SetlistImporter } from '../apps/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './fields/controls';
import { fieldStyles as field } from './fields/styles';
import { panelStyles as panel } from './panel.styles';
import { appPanelStyles as styles } from './app-panel.styles';

function failureMessage(error: unknown, source: string) {
  if (error instanceof TypeError) {
    return `Could not reach ${source}. Check your connection, then retry.`;
  }
  return error instanceof Error ? error.message : String(error);
}

export function PerformanceImport({ config, onImport }: { config: SetlistImporter; onImport: (values: AppValues) => void }) {
  const importer = useMemo(() => createSetlistImporter(config), [config]);
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState<'catalog' | 'import' | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const needle = query.trim().toLocaleLowerCase();
  const matches = performances.filter((performance) => `${performance.tourName} ${performance.concertName ?? ''} ${performance.performanceName ?? ''} ${performance.date} ${performance.venue}`.toLocaleLowerCase().includes(needle));
  const options = matches.slice(0, 50).map((performance) => ({
    value: performance.id,
    label: [performance.date, performance.tourName, performance.concertName, performance.performanceName, performance.venue].filter(Boolean).join(' · ')
  }));

  async function load() {
    setBusy('catalog');
    setMessage(null);
    try {
      const loaded = await importer.loadPerformances();
      setPerformances(loaded);
      if (!loaded.length) {
        setMessage({ error: false, text: `${config.name} has no published performances.` });
      }
    } catch (error) {
      setMessage({ error: true, text: failureMessage(error, config.name) });
    } finally {
      setBusy(null);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const performance = performances.find((item) => item.id === selectedId);
    if (!performance || busy) {
      return;
    }
    setBusy('import');
    setMessage(null);
    try {
      const result = await importer.importPerformance(performance);
      onImport(result.values);
      setMessage({ error: false, text: `Imported ${result.itemCount} entries in performance order, including MC, VTR and sections where present.` });
    } catch (error) {
      setMessage({ error: true, text: failureMessage(error, config.name) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <form className={styles.appImport} onSubmit={submit}>
      {performances.length === 0 ? (
        <Button type="button" disabled={busy !== null} onClick={() => void load()}>{busy === 'catalog' ? 'Loading performances…' : `Load ${config.name} performances`}</Button>
      ) : (
        <>
          <label className={field.field}>
            <span className={field.label}>Search performances</span>
            <Input value={query} placeholder="Event, venue or date" disabled={busy !== null} onChange={(event) => { setQuery(event.target.value); setSelectedId(''); setMessage(null); }} />
          </label>
          {matches.length ? <Select label="Performance" value={selectedId} disabled={busy !== null} options={options} onChange={(id) => { setSelectedId(id); setMessage(null); }} /> : <p className={panel.note}>No performances match this search.</p>}
          {matches.length > options.length && <p className={panel.note}>Showing the latest {options.length} of {matches.length} matches. Search to narrow the list.</p>}
          <Button type="submit" disabled={!selectedId || busy !== null}>{busy === 'import' ? 'Importing setlist…' : 'Import performance'}</Button>
        </>
      )}
      <p className={panel.note}>Reads the current public {config.name} dataset. Your printed fields stay editable after import.</p>
      {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? field.error : panel.note}>{message.text}</p>}
    </form>
  );
}
