import type { AppValues, SetlistImporter } from './types';

export type Performance = {
  id: string;
  tourName: string;
  date: string;
  venue: string;
  performanceName?: string;
  concertName?: string;
  startTime?: string;
  hasSetlist: boolean;
};

export function createSetlistImporter(config: SetlistImporter) {

  function object(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function text(value: unknown): value is string {
    return typeof value === 'string';
  }

  function cached<T>(load: () => Promise<T>) {
    let promise: Promise<T> | undefined;
    return () => {
      promise ??= load().catch((error: unknown) => {
        promise = undefined;
        throw error;
      });
      return promise;
    };
  }

  async function fetchData(file: string, image = false): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(file, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`${config.name} ${file}: HTTP ${response.status}.`);
      }
      if (image) {
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) {
          throw new Error('The artwork source did not return an image.');
        }
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Could not read the performance artwork.'));
          reader.readAsDataURL(blob);
        });
      }
      return await response.json();
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`${config.name} took too long to respond. Please retry.`);
      }
      throw error instanceof Error ? error : new Error(`Could not read ${config.name} data.`);
    } finally {
      clearTimeout(timeout);
    }
  }

  const loadPerformances = cached(async (): Promise<Performance[]> => {
    const [performances, extras] = await Promise.all([fetchData(config.sources.performances), fetchData(config.sources.extras)]);
    if (!Array.isArray(performances) || !object(extras)) {
      throw new Error(`${config.name} performance data has an unsupported format.`);
    }
    const ids = new Set<string>();
    return performances.map((performance): Performance => {
      if (!object(performance) || !text(performance.id)) {
        throw new Error(`${config.name} contains an invalid performance.`);
      }
      const extra = extras[performance.id];
      if (extra !== undefined && !object(extra)) {
        throw new Error(`${config.name} contains invalid performance details.`);
      }
      const merged = { ...performance, ...extra };
      if (!text(merged.id) || !merged.id || ids.has(merged.id) || !text(merged.tourName) || !merged.tourName ||
        !text(merged.date) || !/^\d{4}-\d{2}-\d{2}$/.test(merged.date) || !text(merged.venue) ||
        typeof merged.hasSetlist !== 'boolean' ||
        ['performanceName', 'concertName', 'startTime'].some((key) => merged[key] !== undefined && !text(merged[key]))) {
        throw new Error(`${config.name} contains invalid metadata for performance ${performance.id}.`);
      }
      ids.add(merged.id);
      return {
        id: merged.id,
        tourName: merged.tourName,
        date: merged.date,
        venue: merged.venue,
        hasSetlist: merged.hasSetlist,
        performanceName: merged.performanceName as string | undefined,
        concertName: merged.concertName as string | undefined,
        startTime: merged.startTime as string | undefined
      };
    }).sort((a, b) => b.date.localeCompare(a.date));
  });

  const loadSetlists = cached(async () => {
    const data = await fetchData(config.sources.setlists);
    if (!object(data)) {
      throw new Error(`${config.name} setlist data has an unsupported format.`);
    }
    return data;
  });

  const loadSongs = cached(async () => {
    const data = await fetchData(config.sources.songs);
    if (!Array.isArray(data)) {
      throw new Error(`${config.name} song data has an unsupported format.`);
    }
    const songs = new Map<string, string>();
    for (const song of data) {
      if (!object(song) || !text(song.id) || !text(song.name) || !song.name || songs.has(song.id)) {
        throw new Error(`${config.name} contains an invalid song.`);
      }
      songs.set(song.id, song.name);
    }
    return songs;
  });

  const loadArtwork = cached(async (): Promise<Record<string, unknown>> => {
    if (!config.artwork) {
      return {};
    }
    const data = await fetchData(config.artwork.source);
    if (!object(data)) {
      throw new Error(`${config.name} artwork data has an unsupported format.`);
    }
    return data;
  });

  async function importPerformance(performance: Performance): Promise<{ values: AppValues; itemCount: number }> {
    const [setlists, songs, artwork] = await Promise.all([loadSetlists(), loadSongs(), loadArtwork()]);
    const setlist = setlists[performance.id];
    if (!object(setlist) || !Array.isArray(setlist.items) || setlist.items.length === 0) {
      throw new Error('This performance has no published setlist.');
    }
    if (setlist.performanceId !== performance.id || typeof setlist.isActual !== 'boolean' || !Array.isArray(setlist.sections)) {
      throw new Error(`${config.name} returned an invalid setlist.`);
    }
    const sections = new Map<number, string[]>();
    for (const section of setlist.sections) {
      if (!object(section) || !text(section.name) || !section.name ||
        !Number.isInteger(section.startIndex) || !Number.isInteger(section.endIndex) ||
        (section.startIndex as number) < 0 || (section.endIndex as number) < (section.startIndex as number) ||
        (section.endIndex as number) >= setlist.items.length) {
        throw new Error(`${config.name} returned invalid setlist sections.`);
      }
      const start = section.startIndex as number;
      sections.set(start, [...(sections.get(start) ?? []), section.name]);
    }
    const lines: string[] = [];
    const rows: Record<string, string | number>[] = [];
    let songNumber = 0;
    for (const [index, item] of setlist.items.entries()) {
      if (!object(item) || !['song', 'mc', 'vtr', 'custom'].includes(String(item.type)) ||
        ['title', 'remarks', 'songId', 'customSongName'].some((key) => item[key] !== undefined && !text(item[key])) ||
        (item.isCustomSong !== undefined && typeof item.isCustomSong !== 'boolean')) {
        throw new Error(`${config.name} returned an invalid setlist item at position ${index + 1}.`);
      }
      for (const name of sections.get(index) ?? []) {
        lines.push(config.format.section.replace('{name}', name));
        rows.push({ type: 'section', number: '', title: name, notes: '' });
      }
      let row: Record<string, string | number>;
      if (item.type === 'song') {
        const title = item.isCustomSong ? item.customSongName : songs.get(item.songId as string);
        if (!text(title) || !title) {
          throw new Error(`${config.name} has no song title for setlist position ${index + 1}.`);
        }
        const number = String(++songNumber).padStart(2, '0');
        lines.push(config.format.song.replace('{number}', number).replace('{title}', title));
        row = { type: 'song', number, title, notes: text(item.remarks) ? item.remarks : '' };
      } else {
        const title = item.title || (item.type === 'mc' ? 'MC' : item.type === 'vtr' ? 'VTR' : '');
        if (!text(title) || !title) {
          throw new Error(`${config.name} has no title for setlist position ${index + 1}.`);
        }
        lines.push(title);
        row = { type: String(item.type), number: String(item.type).toUpperCase(), title, notes: text(item.remarks) ? item.remarks : '' };
      }
      rows.push(row);
      if (text(item.remarks) && item.remarks) {
        lines.push(item.remarks);
      }
    }
    let artworkData = '';
    if (config.artwork && config.output.artwork) {
      for (const pattern of config.artwork.keys) {
        const key = pattern.replace(/\{(\w+)\}/g, (_, field: string) => String(performance[field as keyof Performance] ?? ''));
        const record = artwork[key];
        if (object(record) && text(record[config.artwork.image])) {
          const image = record[config.artwork.image] as string;
          const url = new URL(config.artwork.url ? config.artwork.url.replace('{image}', encodeURIComponent(image)) : image);
          if (url.protocol !== 'https:') {
            throw new Error('Performance artwork must use HTTPS.');
          }
          artworkData = await fetchData(url.href, true) as string;
          break;
        }
      }
    }
    return {
      itemCount: setlist.items.length,
      values: {
        ...Object.fromEntries(Object.entries(config.output.fields).map(([key, mapping]) => [key,
          [...new Set(mapping.from.map((field) => performance[field as keyof Performance]).filter((value) => typeof value === 'string' && value))].join(mapping.separator)
        ])),
        [config.output.setlist]: config.output.structured ? rows : lines.join('\n'),
        ...(config.output.artwork ? { [config.output.artwork]: artworkData } : {}),
        [config.output.status]: setlist.isActual ? config.format.actual : config.format.provisional,
        [config.output.source]: config.name
      }
    };
  }

  return { loadPerformances, importPerformance };
}
