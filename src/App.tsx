import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Transport } from 'escpos-web-print';
import { DocInspector, ElementInspector } from './components/Inspector';
import { BLOCKS, Palette, type Block } from './components/Palette';
import { PresetDrawer } from './components/PresetDrawer';
import { Layers } from './components/Layers';
import { EditorToolbar } from './components/EditorToolbar';
import { PrinterDialog } from './components/PrinterDialog';
import { MultiInspector, type AlignMode, type SectionInfo, type SectionStyle } from './components/MultiInspector';
import { Stage, type Magnet, type Patch, type PatchSet } from './components/Stage';
import { cloneElement, createElement, docSize, newId, PAPER_DOTS, type Doc, type Element, type ImageElement, type TextElement } from './doc';
import { addCustomFont, allFonts, ensureFonts } from './fonts';
import { buildAgentTools, type AgentApi } from './agentTools';
import { useHistory } from './history';
import { loadCurrent, loadPrinted, loadShelf, parseDocFile, recordPrinted, saveCurrent, savePrinted, saveShelf, type PrintedItem, type ShelfItem } from './persistence';
import { appTokens, fieldsOf, fontSpecs, layOut, loadImages } from './prepare';
import { defaults, expandBindings, guessField, isMissing, placeholderKeys } from './apps/bindings';
import { buildApp, findApp, saveTemplates, templateFrom, userTemplates } from './apps/registry';
import { AppPanel } from './components/AppPanel';
import { PRESETS } from './presets';
import { expandTokens, type TokenContext } from './tokens';
import { checkLayout } from './check';
import { buildSection, SECTION_GAP, stackRows, type SectionId } from './sections';
import { registerTools } from './webmcp';
import { appLink, readDeepLink, shareLink } from './deeplink';
import { bytes, connect, encode, loadSpeed, MAX_PRINT_ROWS, saveSpeed, send, testPage, type Connection, type Speed } from './printer';
import { barcodeError, fitTextHeight, frameInset, imageAspect, imageSize, textClipped, textInkSpan, wholePixelSize, inkCoverage, invalidateLayers, loadImage, renderDoc } from './render';
import { Tabs } from '@ark-ui/react/tabs';
import { Button } from './components/ui/button';
import { cx } from '../styled-system/css';
import { appStyles as styles } from './app.styles';

type Status = { kind: 'idle' | 'busy' | 'error' | 'done'; message: string };
type Panel = 'blocks' | 'paper' | 'edit';

function isControlEvent(event: KeyboardEvent) {
  return event.defaultPrevented || (event.target instanceof Element && !!event.target.closest('button, input, textarea, select, [contenteditable], [data-scope]'));
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileName(doc: Doc, extension: string) {
  return `${(doc.name || 'inkless').replace(/[^\p{L}\p{N}_-]+/gu, '-').toLowerCase()}.${extension}`;
}

const MONO_SHARE = 0.985;

function isMonochrome(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const data = ctx.getImageData(0, 0, width, height).data;
  let extreme = 0;
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (luma < 48 || luma > 207) {
      extreme += 1;
    }
  }
  return extreme / (data.length / 4) >= MONO_SHARE;
}

function readImageFile(file: File) {
  return new Promise<{ src: string; mono: boolean }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('That file is not an image this browser can open.'));
      image.onload = () => {
        const probe = document.createElement('canvas');
        probe.width = image.naturalWidth;
        probe.height = image.naturalHeight;
        const probeCtx = probe.getContext('2d', { willReadFrequently: true })!;
        probeCtx.fillStyle = '#fff';
        probeCtx.fillRect(0, 0, probe.width, probe.height);
        probeCtx.drawImage(image, 0, 0);
        const mono = isMonochrome(probeCtx, probe.width, probe.height);
        const scale = Math.min(1, (mono ? 2048 : 1024) / Math.max(image.naturalWidth, image.naturalHeight));
        if (scale === 1) {
          resolve({ src: mono ? probe.toDataURL('image/png') : probe.toDataURL('image/jpeg', 0.9), mono });
          return;
        }
        const target = document.createElement('canvas');
        target.width = Math.round(image.naturalWidth * scale);
        target.height = Math.round(image.naturalHeight * scale);
        const ctx = target.getContext('2d')!;
        ctx.imageSmoothingEnabled = !mono;
        ctx.drawImage(probe, 0, 0, target.width, target.height);
        resolve({ src: mono ? target.toDataURL('image/png') : target.toDataURL('image/jpeg', 0.9), mono });
      };
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function detachApp(doc: Doc, tokens: TokenContext): Doc {
  const laid = layOut(doc, tokens);
  const bind = (value: string) => (tokens.values && tokens.fields ? expandBindings(value, tokens.values, tokens.fields) : value);
  return {
    ...doc,
    app: undefined,
    fields: undefined,
    repeats: undefined,
    elements: laid.elements
      .map((element) => {
        const { when: _when, ...rest } = { ...element, locked: doc.elements.some((source) => source.id === element.id) ? element.locked : false };
        if (rest.kind === 'text') {
          return { ...rest, text: bind(rest.text) } as Element;
        }
        if (rest.kind === 'qr' || rest.kind === 'barcode') {
          return { ...rest, data: bind(rest.data) } as Element;
        }
        return rest as Element;
      })
  };
}

function thumbnailOf(source: HTMLCanvasElement) {
  const width = 120;
  const target = document.createElement('canvas');
  target.width = width;
  target.height = Math.max(1, Math.round((source.height / source.width) * width));
  const ctx = target.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, 0, 0, target.width, target.height);
  return target.toDataURL('image/png');
}

function selectionBounds(elements: Element[]) {
  const x = Math.min(...elements.map((element) => element.x));
  const y = Math.min(...elements.map((element) => element.y));
  return { x, y, w: Math.max(...elements.map((element) => element.x + element.w)) - x, h: Math.max(...elements.map((element) => element.y + element.h)) - y };
}

function loadedFaces() {
  let count = 0;
  document.fonts.forEach((face) => {
    if (face.status === 'loaded') {
      count += 1;
    }
  });
  return count;
}

function errorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'No printer was chosen.';
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Printing stopped.';
  }
  return error instanceof Error ? error.message : String(error);
}

export function App() {
  const history = useHistory<Doc>(() => loadCurrent() ?? PRESETS[1].build());
  const { doc, set } = history;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [croppingId, setCroppingId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [seed, setSeed] = useState(1);
  const [now, setNow] = useState(() => new Date());
  const [printer, setPrinter] = useState<Transport | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle', message: '' });
  const [feeding, setFeeding] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [shelf, setShelf] = useState<ShelfItem[]>(() => loadShelf());
  const [printed, setPrinted] = useState<PrintedItem[]>(() => loadPrinted());
  const [speed, setSpeed] = useState<Speed>(() => loadSpeed());
  const [magnet, setMagnet] = useState<Magnet>(() => {
    try {
      const value = localStorage.getItem('inkless:magnet');
      return value === 'off' || value === 'grid' ? value : 'objects';
    } catch {
      return 'objects';
    }
  });
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [leftTab, setLeftTab] = useState<'add' | 'layers'>('add');
  const [listHover, setListHover] = useState<string[] | null>(null);
  const [ditherNew, setDitherNew] = useState(() => {
    try {
      return localStorage.getItem('inkless:dither-new') === 'on';
    } catch {
      return false;
    }
  });
  const [panning, setPanning] = useState(false);
  const spaceDown = useRef(false);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const scaleRef = useRef(1);
  const [panel, setPanel] = useState<Panel>('paper');
  const [zoom, setZoom] = useState<number | null>(null);
  const [matWidth, setMatWidth] = useState(600);
  const [matHeight, setMatHeight] = useState(600);
  const [lastSend, setLastSend] = useState<{ at: Date; bytes: number; copies: number } | null>(null);
  const [saveWarning, setSaveWarning] = useState(false);
  const matRef = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const fontInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const imageTarget = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const longConfirmed = useRef(false);
  const printAfterConnect = useRef(false);
  const issuesConfirmed = useRef(false);
  const [link, setLink] = useState<string | null>(null);

  const tokens = useMemo(() => appTokens(doc, { seed, copy: 1, now }), [doc, seed, now]);
  const laid = useMemo(() => layOut(doc, tokens), [doc, tokens, tick]);
  const size = docSize(laid);
  const output = useMemo(() => renderDoc(laid, tokens), [laid, tokens]);
  const coverage = useMemo(() => inkCoverage(output), [output]);
  const spans = useMemo(() => Object.fromEntries(laid.elements.filter((element) => element.kind === 'text').map((element) => [element.id, textInkSpan(element as TextElement, tokens)])), [laid, tokens]);
  const selected = laid.elements.find((element) => element.id === selectedId) ?? null;
  const appManifest = doc.app?.id ? findApp(doc.app.id) : null;
  const allFields = useMemo(() => fieldsOf(doc), [doc]);
  const placeholders = useMemo(() => {
    const known = new Set(allFields.map((field) => field.key));
    return placeholderKeys(doc.elements.flatMap((element) => (element.kind === 'text' ? [element.text] : element.kind === 'qr' || element.kind === 'barcode' ? [element.data] : []))).filter((key) => !known.has(key));
  }, [doc, allFields]);
  const issues = useMemo(() => checkLayout(laid, size, tokens), [laid, size.width, size.height, tokens]);
  const emptyFields = useMemo(
    () =>
      laid.elements
        .filter((element): element is TextElement => element.kind === 'text' && element.text.includes('{{') && !expandTokens(element.text, tokens).trim())
        .map((element) => {
          const key = element.text.match(/\{\{\s*(?:[a-z]+:)?([A-Za-z0-9_]+)/)?.[1];
          return { id: element.id, label: allFields.find((field) => field.key === key)?.label ?? 'Empty field' };
        }),
    [laid, tokens, allFields]
  );
  const missingFields = allFields.filter((field) => field.required && isMissing(field, doc.app?.values ?? {}, doc.app?.blanks ?? [])).map((field) => field.key);
  const fitZoom = Math.max(0.3, Math.min(3, (matWidth - 72) / size.width));
  const scale = zoom ?? fitZoom;
  scaleRef.current = scale;

  useEffect(() => {
    let cancelled = false;
    const before = loadedFaces();
    Promise.all([ensureFonts(fontSpecs(doc)), loadImages(doc)]).then(() => {
      if (!cancelled) {
        if (loadedFaces() !== before) {
          invalidateLayers();
        }
        setTick((value) => value + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  useEffect(() => {
    const bump = () => {
      invalidateLayers();
      setTick((value) => value + 1);
    };
    document.fonts.addEventListener('loadingdone', bump);
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      document.fonts.removeEventListener('loadingdone', bump);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSaveWarning(!saveCurrent(doc)), 400);
    return () => clearTimeout(timer);
  }, [doc]);

  useEffect(() => {
    const target = matRef.current;
    if (!target) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setMatWidth(entry.contentRect.width);
      setMatHeight(entry.contentRect.height);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const mat = matRef.current;
    if (!mat) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      const rect = mat.getBoundingClientRect();
      const before = scaleRef.current;
      const after = Math.max(0.3, Math.min(8, before * Math.exp(-event.deltaY * 0.0025)));
      const pointX = event.clientX - rect.left + mat.scrollLeft;
      const pointY = event.clientY - rect.top + mat.scrollTop;
      scaleRef.current = after;
      setZoom(after);
      requestAnimationFrame(() => {
        mat.scrollLeft = pointX * (after / before) - (event.clientX - rect.left);
        mat.scrollTop = pointY * (after / before) - (event.clientY - rect.top);
      });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isControlEvent(event)) {
        event.preventDefault();
        spaceDown.current = true;
        setPanning(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceDown.current = false;
        setPanning(false);
      }
    };
    mat.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      mat.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const revealId = useRef<string | null>(null);
  useEffect(() => {
    if (revealId.current) {
      document.querySelector(`[data-element-id="${revealId.current}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      revealId.current = null;
    }
  }, [selectedIds]);

  const flash = useCallback((message: string, kind: Status['kind'] = 'done') => setStatus({ kind, message }), []);

  useEffect(() => {
    if (status.kind === 'busy' || !status.message) {
      return;
    }
    const timer = setTimeout(() => setStatus((current) => (current === status ? { kind: 'idle', message: '' } : current)), status.kind === 'error' ? 9000 : 5000);
    return () => clearTimeout(timer);
  }, [status]);

  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;

  const reflow = useCallback((before: Doc, after: Doc): Doc => {
    if (after.landscape) {
      return after;
    }
    const shifts: { bottom: number; delta: number; id: string }[] = [];
    for (const next of after.elements) {
      const previous = before.elements.find((element) => element.id === next.id);
      if (!previous || previous === next || previous.kind !== 'text' || next.kind !== 'text' || next.text.includes('{{') || previous.y !== next.y) {
        continue;
      }
      const oldHeight = fitTextHeight(previous, tokensRef.current);
      const newHeight = fitTextHeight(next, tokensRef.current);
      if (newHeight !== oldHeight) {
        shifts.push({ id: next.id, bottom: previous.y + oldHeight, delta: newHeight - oldHeight });
      }
    }
    if (!shifts.length) {
      return after;
    }
    return {
      ...after,
      elements: after.elements.map((element) => {
        const delta = shifts.reduce((total, shift) => (shift.id !== element.id && element.y >= shift.bottom - 1 ? total + shift.delta : total), 0);
        return delta ? { ...element, y: Math.max(0, element.y + delta) } : element;
      })
    };
  }, []);

  const updateMany = useCallback(
    (patches: PatchSet, group?: string) =>
      set((current) => {
        const byId = new Map(patches.map((item) => [item.id, item.patch]));
        return reflow(current, { ...current, elements: current.elements.map((element) => (byId.has(element.id) ? ({ ...element, ...byId.get(element.id) } as Element) : element)) });
      }, group),
    [set, reflow]
  );

  const updateElement = useCallback(
    (id: string, patch: Patch, group?: string) => set((current) => reflow(current, { ...current, elements: current.elements.map((element) => (element.id === id ? ({ ...element, ...patch } as Element) : element)) }), group),
    [set, reflow]
  );

  const insert = useCallback(
    (element: Element) => {
      set((current) => ({ ...current, elements: [...current.elements, element] }));
      revealId.current = element.id;
      setSelectedId(element.id);
      setPanel('paper');
    },
    [set, setSelectedId]
  );

  function placement(width: number, height: number, x?: number, y?: number) {
    const across = doc.landscape ? size.height : size.width;
    const cx = x ?? (doc.landscape ? size.width / 2 : across / 2);
    const cy = y ?? (doc.landscape ? across / 2 : Math.max(height / 2 + 8, laid.elements.reduce((max, element) => Math.max(max, element.y + element.h), 0) + 16 + height / 2));
    return {
      x: Math.round(Math.max(0, Math.min(size.width - Math.min(width, size.width), cx - width / 2))),
      y: Math.round(Math.max(0, cy - height / 2))
    };
  }

  function addBlock(block: Block, x?: number, y?: number) {
    const element = block.build(0, 0);
    const width = Math.min(element.w, doc.landscape ? element.w : PAPER_DOTS);
    insert({ ...element, w: width, ...placement(width, element.h, x, y) } as Element);
    if (element.kind === 'image' && !element.src) {
      imageTarget.current = element.id;
      imageInput.current?.click();
    }
  }

  async function addImage(file: File, x?: number, y?: number, targetId?: string | null) {
    try {
      const { src, mono } = await readImageFile(file);
      await loadImage(src);
      const look = mono
        ? ({ dither: 'threshold', threshold: 128, pixelated: true, contrast: 0, brightness: 0, gamma: 1 } as const)
        : ditherNew
          ? ({ dither: 'floyd', contrast: 10 } as const)
          : ({ dither: 'threshold', threshold: 128 } as const);
      const empty = doc.elements.filter((element) => element.kind === 'image' && !element.src);
      const fallback = empty.find((element) => selectedIds.includes(element.id)) ?? empty[0];
      const target = (targetId ? doc.elements.find((element) => element.id === targetId) : null) ?? fallback;
      if (target?.kind === 'image') {
        updateElement(target.id, { src, ...look, ...(target.autoTrim ? { trim: true, cropZoom: 1, cropX: 0, cropY: 0 } : {}) });
        setSelectedId(target.id);
        if (mono) {
          flash('Black-and-white image: printing it as is, with sharp pixels and no dithering.');
        }
        return;
      }
      const natural = imageSize(src) ?? { width: PAPER_DOTS, height: PAPER_DOTS };
      const ratio = natural.width / natural.height;
      const across = doc.landscape ? PAPER_DOTS * ratio : PAPER_DOTS;
      const width = mono && natural.width <= across ? natural.width * Math.max(1, Math.floor(across / natural.width)) : Math.min(PAPER_DOTS, across);
      const height = Math.round(width / ratio);
      const element = { ...createElement('image', { x: 0, y: 0 }), src, w: Math.round(width), h: height, fit: mono ? 'stretch' : 'cover', ...look } as ImageElement;
      if (mono) {
        flash(`Black-and-white image: printing it as is at ${Math.round(width / natural.width)}× with sharp pixels and no dithering.`);
      }
      insert({ ...element, ...placement(element.w, element.h, x, y) });
    } catch (error) {
      flash(errorMessage(error), 'error');
    }
  }

  const selectedGroup = (() => {
    const groups = new Set(doc.elements.filter((element) => selectedIds.includes(element.id)).map((element) => element.group));
    if (groups.size !== 1) {
      return null;
    }
    const [group] = [...groups];
    if (!group) {
      return null;
    }
    const members = doc.elements.filter((element) => element.group === group).map((element) => element.id);
    return members.length === selectedIds.length && members.length > 1 ? group : null;
  })();

  const sectionInfo: SectionInfo | null = (() => {
    if (!selectedGroup) {
      return null;
    }
    const members = doc.elements.filter((element) => element.group === selectedGroup);
    const headingEl = members.find((element): element is TextElement => element.kind === 'text' && element.role === 'heading');
    const bodyEl = members.find((element): element is TextElement => element.kind === 'text' && element.role !== 'heading') ?? headingEl;
    const stored = doc.sections?.[selectedGroup];
    return {
      gap: stored?.gap ?? SECTION_GAP,
      inset: stored?.inset ?? Math.max(0, Math.min(...members.map((element) => element.x))),
      align: stored?.align ?? (bodyEl?.align ?? 'left'),
      headingFont: headingEl?.font ?? 'Archivo Black',
      headingSize: headingEl?.size ?? 28,
      bodyFont: bodyEl?.font ?? 'Zen Kaku Gothic New',
      bodySize: bodyEl?.size ?? 22
    };
  })();

  function applySectionStyle(style: SectionStyle) {
    if (!selectedGroup || !sectionInfo) {
      return;
    }
    const fields = fieldsOf(doc);
    const sample: TokenContext = { ...tokens, values: defaults(fields), blanks: [] };
    const heightOf = (element: Element) => (element.kind === 'text' ? fitTextHeight(element, sample) : element.h);
    set((current) => {
      let elements = current.elements;
      const sections = { ...(current.sections ?? {}) };
      const groups = style.everywhere ? [...new Set(elements.map((element) => element.group).filter((group): group is string => !!group))] : [selectedGroup];
      const ordered = groups.map((group) => ({ group, top: Math.min(...elements.filter((element) => element.group === group).map((element) => element.y)) })).sort((a, b) => a.top - b.top);
      for (const { group } of ordered) {
        const settings = { gap: sectionInfo.gap, inset: sectionInfo.inset, align: sectionInfo.align, ...(current.sections?.[group] ?? {}), ...(style.everywhere ? {} : { gap: style.gap ?? (current.sections?.[group]?.gap ?? sectionInfo.gap), inset: style.inset ?? (current.sections?.[group]?.inset ?? sectionInfo.inset), align: style.align ?? (current.sections?.[group]?.align ?? sectionInfo.align) }) };
        sections[group] = settings;
        const members = elements.filter((element) => element.group === group);
        const oldBottom = Math.max(...members.map((element) => element.y + heightOf(element)));
        const top = Math.min(...members.map((element) => element.y));
        const iconRows = new Set(members.filter((element) => element.kind === 'shape' && element.shape === 'icon').map((element) => element.y));
        const styled = members.map((element): Element => {
          const span = PAPER_DOTS - settings.inset * 2;
          if (element.kind === 'shape' && element.shape === 'icon') {
            return { ...element, x: settings.inset };
          }
          if (element.kind === 'text') {
            const beside = element.role === 'heading' && [...iconRows].some((y) => Math.abs(y - element.y) < element.size);
            const font = element.role === 'heading' ? { font: style.headingFont ?? element.font, size: element.size === sectionInfo.headingSize || style.everywhere ? (style.headingSize ?? element.size) : element.size } : { font: style.bodyFont ?? element.font, size: element.size === sectionInfo.bodySize || style.everywhere ? (style.bodySize ?? element.size) : element.size };
            return { ...element, ...font, align: beside ? element.align : settings.align, x: beside ? settings.inset + 48 : settings.inset, w: beside ? span - 48 : span };
          }
          if (element.kind === 'qr' || element.kind === 'barcode' || element.kind === 'image') {
            const x = settings.align === 'left' ? settings.inset : settings.align === 'right' ? PAPER_DOTS - settings.inset - element.w : (PAPER_DOTS - element.w) / 2;
            return { ...element, x: Math.round(x) };
          }
          return { ...element, x: settings.inset, w: span };
        });
        const sorted = [...styled].sort((a, b) => a.y - b.y);
        const rows: Element[][] = [];
        let rowBottom = -Infinity;
        for (const element of sorted) {
          if (!rows.length || element.y >= rowBottom - 1) {
            rows.push([element]);
            rowBottom = element.y + heightOf(element);
          } else {
            rows[rows.length - 1].push(element);
            rowBottom = Math.max(rowBottom, element.y + heightOf(element));
          }
        }
        const stacked = stackRows(rows, top, heightOf, settings.gap).elements;
        const newBottom = Math.max(...stacked.map((element) => element.y + heightOf(element)));
        const delta = newBottom - oldBottom;
        const byId = new Map(stacked.map((element) => [element.id, element]));
        elements = elements.map((element) => byId.get(element.id) ?? (element.group !== group && element.y >= oldBottom - 1 ? { ...element, y: element.y + delta } : element));
      }
      return { ...current, sections, elements };
    });
  }

  function moveBlock(blockId: string, toIndex: number) {
    const axis = doc.landscape ? 'x' : 'y';
    const sample: TokenContext = { ...tokens, values: defaults(fieldsOf(doc)), blanks: [] };
    const extent = (element: Element) => (axis === 'y' ? (element.kind === 'text' ? fitTextHeight(element, sample) : element.h) : element.w);
    set((current) => {
      const map = new Map<string, Element[]>();
      for (const element of current.elements) {
        const key = element.group ? `g:${element.group}` : `e:${element.id}`;
        map.set(key, [...(map.get(key) ?? []), element]);
      }
      const blocks = [...map.entries()].map(([id, members]) => ({ id, members, start: Math.min(...members.map((element) => element[axis])), end: Math.max(...members.map((element) => element[axis] + extent(element))) })).sort((a, b) => a.start - b.start);
      const from = blocks.findIndex((block) => block.id === blockId);
      if (from < 0) {
        return current;
      }
      const gaps = blocks.slice(1).map((block, index) => Math.max(8, block.start - blocks[index].end));
      const gap = gaps.length ? Math.round(gaps.reduce((total, value) => total + value, 0) / gaps.length) : 16;
      const order = [...blocks];
      const [moved] = order.splice(from, 1);
      order.splice(Math.max(0, Math.min(order.length, toIndex > from ? toIndex - 1 : toIndex)), 0, moved);
      let cursor = blocks[0].start;
      const shift = new Map<string, number>();
      for (const block of order) {
        shift.set(block.id, cursor - block.start);
        cursor += block.end - block.start + gap;
      }
      return {
        ...current,
        elements: current.elements.map((element) => {
          const delta = shift.get(element.group ? `g:${element.group}` : `e:${element.id}`) ?? 0;
          return delta ? ({ ...element, [axis]: Math.round(element[axis] + delta) } as Element) : element;
        })
      };
    });
  }

  function insertSection(id: SectionId) {
    const section = buildSection(id);
    const known = new Set(fieldsOf(doc).map((field) => field.key));
    const added = section.fields.filter((field) => !known.has(field.key));
    const nextFields = [...(doc.fields ?? []), ...added];
    const nextValues = { ...defaults(added), ...(doc.app?.values ?? {}) };
    const probe: Doc = { ...doc, fields: nextFields, app: { ...(doc.app ?? {}), values: nextValues } };
    const probeTokens = appTokens(probe, { seed, copy: 1, now });
    const bottom = laid.elements.reduce((max, element) => Math.max(max, element.y + element.h), 0);
    const group = newId();
    const { elements } = stackRows(section.rows, laid.elements.length ? bottom + 16 : 8, (element) => (element.kind === 'text' ? fitTextHeight(element, probeTokens) : element.h), SECTION_GAP, group);
    set((current) => ({ ...current, fields: [...(current.fields ?? []), ...added.filter((field) => !(current.fields ?? []).some((item) => item.key === field.key))], app: { ...(current.app ?? {}), values: { ...defaults(added), ...(current.app?.values ?? {}) } }, elements: [...current.elements, ...elements] }));
    revealId.current = elements[0].id;
    setSelectedIds(elements.map((element) => element.id));
    flash(`Added ${section.label}${added.length ? ` with ${added.length} new field${added.length === 1 ? '' : 's'}` : ''}.`);
  }

  function deleteSelected() {
    if (!selectedIds.length) {
      return;
    }
    set((current) => ({ ...current, elements: current.elements.filter((element) => !selectedIds.includes(element.id)) }));
    setSelectedIds([]);
  }

  function duplicateSelected() {
    if (!selectedIds.length) {
      return;
    }
    const copies = doc.elements.filter((element) => selectedIds.includes(element.id)).map((element) => cloneElement(element));
    set((current) => ({ ...current, elements: [...current.elements, ...copies] }));
    setSelectedIds(copies.map((element) => element.id));
  }

  function layer(direction: 1 | -1 | 'top' | 'bottom') {
    set((current) => {
      const picked = current.elements.filter((element) => selectedIds.includes(element.id));
      const rest = current.elements.filter((element) => !selectedIds.includes(element.id));
      if (!picked.length) {
        return current;
      }
      if (direction === 'top') {
        return { ...current, elements: [...rest, ...picked] };
      }
      if (direction === 'bottom') {
        return { ...current, elements: [...picked, ...rest] };
      }
      const elements = [...current.elements];
      const order = direction === 1 ? [...elements.keys()].reverse() : [...elements.keys()];
      for (const index of order) {
        const target = index + direction;
        if (selectedIds.includes(elements[index].id) && target >= 0 && target < elements.length && !selectedIds.includes(elements[target].id)) {
          [elements[index], elements[target]] = [elements[target], elements[index]];
        }
      }
      return { ...current, elements };
    });
  }

  function align(mode: AlignMode) {
    const picked = laid.elements.filter((element) => selectedIds.includes(element.id));
    if (!picked.length) {
      return;
    }
    const area = picked.length > 1 ? selectionBounds(picked) : { x: 0, y: 0, w: size.width, h: size.height };
    const patches: PatchSet = picked.map((element): PatchSet[number] => {
      switch (mode) {
        case 'left':
          return { id: element.id, patch: { x: Math.round(area.x) } };
        case 'center':
          return { id: element.id, patch: { x: Math.round(area.x + (area.w - element.w) / 2) } };
        case 'right':
          return { id: element.id, patch: { x: Math.round(area.x + area.w - element.w) } };
        case 'top':
          return { id: element.id, patch: { y: Math.round(area.y) } };
        case 'middle':
          return { id: element.id, patch: { y: Math.round(area.y + (area.h - element.h) / 2) } };
        case 'bottom':
          return { id: element.id, patch: { y: Math.round(area.y + area.h - element.h) } };
        default:
          return { id: element.id, patch: doc.landscape ? { y: 0, h: PAPER_DOTS } : { x: 0, w: PAPER_DOTS } };
      }
    });
    if (mode === 'stack' || mode === 'spread') {
      const sorted = [...picked].sort((a, b) => a.y - b.y);
      const total = sorted.reduce((sum, element) => sum + element.h, 0);
      const gap = mode === 'stack' ? 8 : sorted.length > 1 ? (area.h - total) / (sorted.length - 1) : 0;
      let cursor = sorted[0].y;
      updateMany(
        sorted.map((element) => {
          const patch = { id: element.id, patch: { y: Math.round(cursor) } };
          cursor += element.h + gap;
          return patch;
        })
      );
      return;
    }
    updateMany(patches);
  }

  useEffect(() => {
    const open = () => {
      if (!location.hash || location.hash.length < 3) {
        return;
      }
      readDeepLink(location.hash)
        .then((result) => {
          if (!result) {
            return;
          }
          loadDoc(result.doc);
          window.history.replaceState(null, '', `${location.pathname}${location.search}`);
          flash(result.ignored.length ? `Opened from the link. Ignored unknown fields: ${result.ignored.join(', ')}.` : 'Opened from the link. Undo brings back what you had.');
        })
        .catch((error) => flash(errorMessage(error), 'error'));
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);

  async function copyLink(kind: 'design' | 'app') {
    try {
      const result = kind === 'app' && doc.app?.id ? { url: appLink(doc.app.id, doc.app.values), droppedPhotos: false } : await shareLink(doc);
      setLink(result.url);
      const copied = await navigator.clipboard.writeText(result.url).then(
        () => true,
        () => false
      );
      flash(`${copied ? 'Link copied.' : 'Link ready below, copy it from the box.'}${result.droppedPhotos ? ' Photos were left out to keep the link short.' : ''}`);
    } catch (error) {
      flash(errorMessage(error), 'error');
    }
  }

  function loadDoc(next: Doc) {
    history.reset(next);
    setSelectedIds([]);
    setEditingId(null);
    setDrawerOpen(false);
    setZoom(null);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isControlEvent(event) || drawerOpen || connectOpen) {
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (croppingId && (event.key === 'Escape' || event.key === 'Enter')) {
        event.preventDefault();
        setCroppingId(null);
        return;
      }
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          history.redo();
        } else {
          history.undo();
        }
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        history.redo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelectedIds(doc.elements.map((element) => element.id));
        return;
      }
      if (!selectedIds.length) {
        return;
      }
      if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        layer(event.key === ']' ? (mod ? 'top' : 1) : mod ? 'bottom' : -1);
      } else if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelected();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelected();
      } else if (event.key === 'Escape') {
        setSelectedIds([]);
      } else if (event.key === 'Enter' && selected?.kind === 'text') {
        event.preventDefault();
        setEditingId(selected.id);
      } else if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        const step = event.shiftKey ? 8 : 1;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        updateMany(
          doc.elements.filter((element) => selectedIds.includes(element.id)).map((element) => ({ id: element.id, patch: { x: element.x + dx, y: element.y + dy } })),
          `nudge-${selectedIds.join()}`
        );
      }
    };
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest?.('input, textarea')) {
        return;
      }
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'));
      if (file) {
        event.preventDefault();
        void addImage(file);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  });

  async function connectPrinter(connection: Connection, showAllDevices: boolean) {
    setStatus({ kind: 'busy', message: 'Waiting for you to pick a printer' });
    try {
      const next = await connect(connection, () => {
        setPrinter(null);
        flash('Printer disconnected.', 'error');
      }, showAllDevices);
      setPrinter(next);
      flash(`Connected to ${next.deviceName ?? next.label}.`);
      if (printAfterConnect.current) {
        printAfterConnect.current = false;
        setConnectOpen(false);
        void print(next);
      }
    } catch (error) {
      printAfterConnect.current = false;
      flash(errorMessage(error), 'error');
    }
  }

  async function disconnectPrinter() {
    await printer?.close().catch(() => undefined);
    setPrinter(null);
    flash('Disconnected.');
  }

  async function runTestPage() {
    if (!printer) {
      return;
    }
    setStatus({ kind: 'busy', message: 'Sending a text test page' });
    try {
      await testPage(printer, speed);
      flash('Test page sent. If paper fed but stayed blank, flip the roll.');
    } catch (error) {
      flash(errorMessage(error), 'error');
    }
  }

  async function print(target: Transport | null = printer): Promise<string> {
    if (missingFields.length) {
      const message = `Fill in before printing: ${allFields.filter((field) => missingFields.includes(field.key)).map((field) => field.label).join(', ')}. Or tick Leave blank to handwrite.`;
      flash(message, 'error');
      setSelectedIds([]);
      setPanel('edit');
      return message;
    }
    if (issues.length && !issuesConfirmed.current) {
      issuesConfirmed.current = true;
      const message = `Check before printing: ${issues[0].message}${issues.length > 1 ? ` (${issues.length} problems, listed under Check)` : ''} Press Print again to print anyway.`;
      flash(message, 'error');
      return message;
    }
    issuesConfirmed.current = false;
    if (!target) {
      printAfterConnect.current = true;
      setConnectOpen(true);
      return 'No printer connected.';
    }
    const rows = laid.landscape ? size.width : size.height;
    if (rows > MAX_PRINT_ROWS && !longConfirmed.current) {
      longConfirmed.current = true;
      const message = `This print is ${Math.round(rows / 80) / 10} m long. The printer maker advises under 1 m in one go. Press Print again to go ahead.`;
      flash(message, 'error');
      return message;
    }
    longConfirmed.current = false;
    const controller = new AbortController();
    abort.current = controller;
    const copies = doc.print.copies;
    setFeeding(0);
    setLastSend(null);
    let sentBytes = 0;
    try {
      for (let copy = 1; copy <= copies; copy += 1) {
        setStatus({ kind: 'busy', message: copies > 1 ? `Sending copy ${copy} of ${copies} to the printer` : 'Sending to the printer' });
        const copyTokens = appTokens(doc, { seed, copy, now: new Date() });
        const sheet = renderDoc(layOut(doc, copyTokens), copyTokens);
        const { parts } = encode(sheet, laid.landscape, laid.print);
        await send(target, parts, controller.signal, (ratio) => setFeeding((copy - 1 + ratio) / copies), speed);
        sentBytes += parts.reduce((total, part) => total + part.length, 0);
      }
      setLastSend({ at: new Date(), bytes: sentBytes, copies });
      setPrinted((items) => recordPrinted(items, { id: `${Date.now()}`, printedAt: Date.now(), copies, thumb: thumbnailOf(output), doc }));
      const message = `Sent ${copies > 1 ? `${copies} copies` : 'the design'} to the printer. The printer does not report back, so check that the paper came out.`;
      flash(message);
      setSeed((value) => value + copies);
      return message;
    } catch (error) {
      flash(errorMessage(error), 'error');
      return errorMessage(error);
    } finally {
      abort.current = null;
      setFeeding(null);
    }
  }

  function exportPng() {
    output.toBlob((blob) => blob && download(blob, fileName(doc, 'png')));
  }

  function exportBin() {
    const { parts } = encode(output, laid.landscape, laid.print);
    download(new Blob([bytes(parts) as BlobPart], { type: 'application/octet-stream' }), fileName(doc, 'escpos.bin'));
  }

  function exportJson() {
    download(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), fileName(doc, 'inkless.json'));
  }

  function shelve() {
    const name = doc.name.trim();
    const existing = name ? shelf.find((item) => item.doc.name.trim() === name) : undefined;
    const entry = { id: existing?.id ?? `${Date.now()}`, savedAt: Date.now(), doc };
    const next = [entry, ...shelf.filter((item) => item.id !== entry.id)].slice(0, 30);
    if (saveShelf(next)) {
      setShelf(next);
      flash(existing ? `Updated “${name}” in my designs.` : `Saved “${doc.name || 'Untitled'}” to my designs.`);
    } else {
      flash('Browser storage is full. Export the design as a file instead.', 'error');
    }
  }

  function removeShelved(id: string) {
    const next = shelf.filter((item) => item.id !== id);
    saveShelf(next);
    setShelf(next);
  }

  const agentApi = useRef<AgentApi | null>(null);
  agentApi.current = {
    doc,
    laid,
    output,
    selectedIds,
    printerName: printer ? (printer.deviceName ?? printer.label) : null,
    update: (change) => set(change),
    load: loadDoc,
    select: setSelectedIds,
    undo: history.undo,
    redo: history.redo,
    print
  };

  useEffect(() => registerTools(buildAgentTools(() => agentApi.current!)), []);

  const busy = status.kind === 'busy';
  const printLabel = feeding !== null ? 'Stop' : doc.print.copies > 1 ? `Print ${doc.print.copies}` : 'Print';

  return (
    <div className={cx('app', styles.root)} data-panel={panel}>
      <EditorToolbar
        documentName={doc.name || 'Untitled'}
        onPresets={() => setDrawerOpen(true)}
        history={{ canUndo: history.canUndo, canRedo: history.canRedo, undo: history.undo, redo: history.redo }}
        zoom={{ scale, value: zoom, wholeFit: Math.max(.3, Math.min(3, (matWidth - 72) / size.width, (matHeight - 90) / size.height)), dotScale: 1 / (window.devicePixelRatio || 1), onChange: setZoom }}
        magnet={magnet}
        onMagnetChange={(value) => {
          setMagnet(value);
          try {
            localStorage.setItem('inkless:magnet', value);
          } catch {
            return;
          }
        }}
        printerLabel={printer ? printer.deviceName ?? printer.label : null}
        onConnect={() => setConnectOpen(true)}
        printing={{
          label: printLabel,
          disabled: busy && feeding === null,
          warning: saveWarning || (doc.print.printWidth ?? PAPER_DOTS) !== PAPER_DOTS,
          message: saveWarning ? 'Not saved, storage full' : feeding !== null ? `Sending ${Math.round(feeding * 100)}%` : lastSend && printer ? `Sent at ${lastSend.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, check the paper` : (doc.print.printWidth ?? PAPER_DOTS) !== PAPER_DOTS ? `Scaled to ${doc.print.printWidth} dots` : '',
          onPrint: () => feeding !== null ? abort.current?.abort() : void print()
        }}
      />

      <main className={styles.workspace}>
        <aside className={cx('side side-left', styles.side, styles.left)}>
          <Tabs.Root value={leftTab} onValueChange={({ value }) => setLeftTab(value as 'add' | 'layers')} lazyMount unmountOnExit>
          <Tabs.List className={styles.tabs} aria-label="Left panel">
            <Tabs.Trigger value="add">
              Add
            </Tabs.Trigger>
            <Tabs.Trigger value="layers">
              Layers <span className={styles.count}>{doc.elements.length}</span>
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="add">
            <Palette onAdd={(block) => addBlock(block)} onSection={insertSection} />
          </Tabs.Content>
          <Tabs.Content value="layers">
            <Layers
              elements={doc.elements}
              selectedIds={selectedIds}
              issueIds={issues.map((issue) => issue.id)}
              tokens={tokens}
              onSelect={(ids, additive) => {
                revealId.current = ids[0];
                setSelectedIds((current) => (additive ? (ids.every((id) => current.includes(id)) ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]) : ids));
                setPanel('edit');
              }}
              onHover={setListHover}
              onPatch={(ids, patch) => set((current) => ({ ...current, elements: current.elements.map((element) => (ids.includes(element.id) ? ({ ...element, ...patch } as Element) : element)) }))}
              onMoveBlock={moveBlock}
              sectionNames={Object.fromEntries(Object.entries(doc.sections ?? {}).map(([group, value]) => [group, value.name]))}
              onRenameSection={(group, name) => set((current) => ({ ...current, sections: { ...(current.sections ?? {}), [group]: { ...(current.sections?.[group] ?? {}), name } } }))}
            />
          </Tabs.Content>
          </Tabs.Root>
        </aside>
        <div
          className={cx('mat', styles.mat)}
          data-panning={panning || undefined}
          ref={matRef}
          onPointerDownCapture={(event) => {
            if (event.button === 1 || (event.button === 0 && spaceDown.current)) {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              pan.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
              setPanning(true);
            }
          }}
          onPointerMove={(event) => {
            if (pan.current) {
              event.currentTarget.scrollLeft = pan.current.left - (event.clientX - pan.current.x);
              event.currentTarget.scrollTop = pan.current.top - (event.clientY - pan.current.y);
            }
          }}
          onPointerUp={() => {
            if (pan.current) {
              pan.current = null;
              setPanning(spaceDown.current);
            }
          }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedIds([]);
              setEditingId(null);
            }
          }}
        >
          <Stage
            elements={laid.elements}
            width={size.width}
            height={size.height}
            landscape={doc.landscape}
            output={output}
            zoom={scale}
            selectedIds={selectedIds}
            spans={spans}
            issueIds={[...new Set(issues.map((issue) => issue.id))]}
            hoverFromList={listHover}
            emptyFields={emptyFields}
            cutIds={[...new Set(issues.filter((issue) => issue.kind === 'bounds').map((issue) => issue.id))]}
            magnet={magnet}
            rulerGuides={doc.guides ?? { x: [], y: [] }}
            onGuides={(guides) => set((current) => ({ ...current, guides }))}
            onCursor={setCursor}
            croppingId={croppingId && selectedIds.includes(croppingId) ? croppingId : null}
            onCrop={setCroppingId}
            editingId={editingId}
            feeding={feeding}
            onSelect={setSelectedIds}
            onEdit={setEditingId}
            onChange={(patches, group) => {
              const offsets = new Map(laid.elements.map((element) => [element.id, element.y - (doc.elements.find((item) => item.id === element.id)?.y ?? element.y)]));
              updateMany(
                patches.map((item) => (item.patch.y !== undefined && offsets.get(item.id) ? { ...item, patch: { ...item.patch, y: item.patch.y - offsets.get(item.id)! } } : item)),
                group
              );
            }}
            onGestureEnd={history.endGroup}
            onDropBlock={(id, x, y) => {
              const block = BLOCKS.find((item) => item.id === id);
              if (block) {
                addBlock(block, x, y);
              }
            }}
            onDropFiles={(files, x, y, targetId) => {
              const image = files.find((file) => file.type.startsWith('image/'));
              const json = files.find((file) => file.name.endsWith('.json'));
              if (image) {
                void addImage(image, x, y, targetId);
              } else if (json) {
                json.text().then((text) => loadDoc(parseDocFile(text))).catch((error) => flash(errorMessage(error), 'error'));
              } else {
                flash('Drop an image or an inkless design file.', 'error');
              }
            }}
            onPickImage={(id) => {
              imageTarget.current = id;
              imageInput.current?.click();
            }}
          />
          {cursor && (
            <div className={styles.readout} aria-live="off">
              x {Math.round(cursor.x)}, y {Math.round(cursor.y)} dots ({(cursor.x / 8).toFixed(1)}, {(cursor.y / 8).toFixed(1)} mm)
            </div>
          )}
          {laid.elements.length === 0 && (
            <div className={styles.empty}>
              <p>Empty roll. Drag a block onto the paper, drop a photo, or</p>
              <Button type="button" onClick={() => setDrawerOpen(true)}>
                pick a preset
              </Button>
            </div>
          )}
        </div>
        <aside className={cx('side side-right', styles.side, styles.right)}>
          {selectedIds.length > 1 ? (
            <MultiInspector
              count={selectedIds.length}
              section={sectionInfo}
              fonts={allFonts().map((font) => font.family)}
              onSection={applySectionStyle}
              onGroup={() => {
                const group = newId();
                set((current) => ({ ...current, elements: current.elements.map((element) => (selectedIds.includes(element.id) ? { ...element, group } : element)) }));
              }}
              onUngroup={() => set((current) => ({ ...current, elements: current.elements.map((element) => (selectedIds.includes(element.id) ? { ...element, group: undefined } : element)) }))}
              onAlign={align}
              onLayer={layer}
              onDuplicate={duplicateSelected}
              onDelete={deleteSelected}
            />
          ) : selected ? (
            <ElementInspector
              element={doc.elements.find((element) => element.id === selected.id)!}
              onPatch={(patch, group) => updateElement(selected.id, patch, group)}
              onPickImage={() => {
                imageTarget.current = selected.id;
                imageInput.current?.click();
              }}
              onWholePixels={() => {
                if (selected.kind === 'image') {
                  const size = wholePixelSize(selected);
                  if (size) {
                    updateElement(selected.id, { w: size.w, h: size.h, fit: 'stretch', frame: 'none', cropZoom: 1, cropX: 0, cropY: 0 } as Patch);
                    flash(size.scale >= 1 ? `Every image pixel is now exactly ${size.scale}×${size.scale} printer dots.` : `Scaled to 1/${Math.round(1 / size.scale)} so the size divides evenly.`);
                  }
                }
              }}
              onFitImage={() => {
                if (selected.kind === 'image') {
                  const ratio = imageAspect(selected.src, selected.trim);
                  if (ratio) {
                    const inner = frameInset(selected, selected.w, selected.h);
                    updateElement(selected.id, { h: Math.round(selected.h - inner.h + inner.w / ratio) });
                  }
                }
              }}
              onUploadFont={() => fontInput.current?.click()}
              cropping={croppingId === selected.id}
              onCrop={(on) => setCroppingId(on ? selected.id : null)}
              barcodeError={selected.kind === 'barcode' ? barcodeError(selected, tokens) : null}
              laidHeight={selected.h}
              clipped={selected.kind === 'text' && textClipped(selected, tokens)}
              paperWidth={doc.landscape ? size.width : PAPER_DOTS}
              onDuplicate={duplicateSelected}
              onDelete={deleteSelected}
              onLayer={layer}
            />
          ) : (
            <>
              {(allFields.length > 0 || placeholders.length > 0 || appManifest) && (
                <AppPanel
                  manifest={appManifest}
                  fields={allFields}
                  customKeys={(doc.fields ?? []).map((field) => field.key)}
                  values={doc.app?.values ?? {}}
                  blanks={doc.app?.blanks ?? []}
                  missing={missingFields}
                  placeholders={placeholders}
                  templateName={appManifest?.user ? appManifest.name : null}
                  onChange={(key, value, group) => set((current) => ({ ...current, app: { ...(current.app ?? { values: {} }), values: { ...(current.app?.values ?? {}), [key]: value } } }), group)}
                  onBlank={(key, blank) =>
                    set((current) => {
                      const blanks = new Set(current.app?.blanks ?? []);
                      if (blank) {
                        blanks.add(key);
                      } else {
                        blanks.delete(key);
                      }
                      return { ...current, app: { ...(current.app ?? { values: {} }), blanks: [...blanks] } };
                    })
                  }
                  onFields={(fields) => set((current) => ({ ...current, fields }))}
                  onCreateFields={(keys) => set((current) => ({ ...current, fields: [...(current.fields ?? []), ...keys.map((key) => guessField(key))] }))}
                  onReset={() =>
                    set((current) => {
                      const app = current.app ? findApp(current.app.id) : null;
                      if (!current.app || !app) {
                        return current;
                      }
                      const samples = app.doc.elements.filter((element) => element.kind === 'image');
                      let index = 0;
                      const elements = current.elements.map((element) => {
                        if (element.kind !== 'image') {
                          return element;
                        }
                        const sample = samples[index++];
                        return sample && sample.kind === 'image' ? { ...element, src: sample.src, trim: sample.trim, cropZoom: 1, cropX: 0, cropY: 0 } : element;
                      });
                      return { ...current, elements, app: { ...current.app, values: defaults(app.fields), blanks: [] } };
                    })
                  }
                  onDetach={() => set((current) => detachApp(current, tokens))}
                  onImport={(imported) => set((current) => (current.app ? { ...current, app: { ...current.app, values: { ...current.app.values, ...imported } } } : current))}
                  onSaveTemplate={(name) => {
                    const template = templateFrom(doc, name, allFields);
                    if (saveTemplates([...userTemplates(), template])) {
                      set((current) => ({ ...current, name, fields: template.fields, app: { id: template.id, values: current.app?.values ?? {}, blanks: current.app?.blanks } }));
                      flash(`Saved the template “${name}”. Find it under Presets, My templates.`);
                    } else {
                      flash('Browser storage is full, so the template was not saved.', 'error');
                    }
                  }}
                  onUpdateTemplate={() => {
                    if (!appManifest?.user) {
                      return;
                    }
                    const template = templateFrom(doc, appManifest.name, allFields, appManifest.id);
                    if (saveTemplates(userTemplates().map((item) => (item.id === template.id ? template : item)))) {
                      flash(`Updated the template “${appManifest.name}”.`);
                    } else {
                      flash('Browser storage is full, so the template was not updated.', 'error');
                    }
                  }}
                  onNewCopy={() => {
                    if (appManifest?.user) {
                      loadDoc(buildApp(appManifest));
                      flash('New guest copy. Fill in this guest’s details.');
                    }
                  }}
                />
              )}
            <DocInspector
              issues={issues}
              onSelectIssue={(id) => setSelectedIds([id])}
              ditherNew={ditherNew}
              onDitherNew={(on) => {
                setDitherNew(on);
                try {
                  localStorage.setItem('inkless:dither-new', on ? 'on' : 'off');
                } catch {
                  return;
                }
              }}
              ditheredCount={doc.elements.filter((element) => element.kind === 'image' && element.dither !== 'threshold').length}
              onUndither={() => set((current) => ({ ...current, elements: current.elements.map((element) => (element.kind === 'image' && element.dither !== 'threshold' ? { ...element, dither: 'threshold' } : element)) }))}
              doc={doc}
              size={size}
              coverage={coverage}
              onDoc={set}
              onReroll={() => setSeed((value) => value + 1)}
              onExportPng={exportPng}
              onExportBin={exportBin}
              onExportJson={exportJson}
              onImportJson={() => jsonInput.current?.click()}
              onShelve={shelve}
              link={link}
              hasApp={!!doc.app}
              onCopyLink={(kind) => void copyLink(kind)}
            />
            </>
          )}
        </aside>
      </main>

      <nav className={styles.mobile} aria-label="Panels">
        {(['blocks', 'paper', 'edit'] as Panel[]).map((value) => (
          <Button key={value} type="button" aria-pressed={panel === value} onClick={() => setPanel(value)}>
            {value === 'blocks' ? 'Blocks' : value === 'paper' ? 'Paper' : selected ? 'Edit' : 'Settings'}
          </Button>
        ))}
      </nav>

      <div className={styles.toast} data-error={status.kind === 'error' || undefined} role="status" aria-live="polite">
        {status.message}
        {saveWarning && <span> This design is too large to autosave. Export it to keep it.</span>}
      </div>

      <PresetDrawer
        open={drawerOpen}
        shelf={shelf}
        printed={printed}
        onClose={() => setDrawerOpen(false)}
        onPick={loadDoc}
        onRemove={removeShelved}
        onRemovePrinted={(id) => {
          const next = printed.filter((item) => item.id !== id);
          savePrinted(next);
          setPrinted(next);
        }}
      />

      <PrinterDialog
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        printer={printer}
        busy={busy}
        status={status}
        speed={speed}
        onSpeed={(value) => { setSpeed(value); saveSpeed(value); }}
        onConnect={(connection, showAllDevices) => void connectPrinter(connection, showAllDevices)}
        onDisconnect={() => void disconnectPrinter()}
        onTest={() => void runTestPage()}
      />

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void addImage(file, undefined, undefined, imageTarget.current);
          }
          event.target.value = '';
        }}
      />
      <input
        ref={fontInput}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) {
            return;
          }
          addCustomFont(file)
            .then((family) => {
              if (selected?.kind === 'text') {
                updateElement(selected.id, { font: family, weight: 400 } as Patch);
              }
              flash(`Loaded ${family}.`);
            })
            .catch(() => flash('That font file could not be loaded.', 'error'));
        }}
      />
      <input
        ref={jsonInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          file
            ?.text()
            .then((text) => loadDoc(parseDocFile(text)))
            .catch((error) => flash(errorMessage(error), 'error'));
        }}
      />
    </div>
  );
}
