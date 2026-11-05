import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Transport } from 'escpos-web-print';
import { DocInspector, ElementInspector } from './components/Inspector';
import { BLOCKS, Palette, type Block } from './components/Palette';
import { PresetDrawer } from './components/PresetDrawer';
import { Layers } from './components/Layers';
import { MultiInspector, type AlignMode } from './components/MultiInspector';
import { Stage, type Magnet, type Patch, type PatchSet } from './components/Stage';
import { cloneElement, createElement, docSize, PAPER_DOTS, type Doc, type Element, type ImageElement, type TextElement } from './doc';
import { addCustomFont, ensureFonts } from './fonts';
import { buildAgentTools, type AgentApi } from './agentTools';
import { useHistory } from './history';
import { loadCurrent, loadPrinted, loadShelf, parseDocFile, recordPrinted, saveCurrent, savePrinted, saveShelf, type PrintedItem, type ShelfItem } from './persistence';
import { appTokens, fontSpecs, layOut, loadImages } from './prepare';
import { defaults, expandBindings } from './apps/bindings';
import { findApp } from './apps/registry';
import { AppPanel } from './components/AppPanel';
import { PRESETS } from './presets';
import type { TokenContext } from './tokens';
import { registerTools } from './webmcp';
import { appLink, readDeepLink, shareLink } from './deeplink';
import { bytes, connect, encode, loadSpeed, MAX_PRINT_ROWS, saveSpeed, send, SPEEDS, supported, testPage, type Connection, type Speed } from './printer';
import { barcodeError, frameInset, imageAspect, imageSize, textInkSpan, wholePixelSize, inkCoverage, invalidateLayers, loadImage, renderDoc } from './render';

type Status = { kind: 'idle' | 'busy' | 'error' | 'done'; message: string };
type Panel = 'blocks' | 'paper' | 'edit';

const CONNECTIONS: { value: Connection; label: string; detail: string }[] = [
  { value: 'bluetooth', label: 'Bluetooth', detail: 'No pairing needed. Turn the printer on and keep it close.' },
  { value: 'usb', label: 'USB cable', detail: 'For printers that show up as a USB printer.' },
  { value: 'serial', label: 'Serial port', detail: 'Printers paired with this computer, or USB serial adapters.' }
];

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
  const shown = layOut(doc, tokens).elements.map((element) => element.id);
  const bind = (value: string) => (tokens.values && tokens.fields ? expandBindings(value, tokens.values, tokens.fields) : value);
  return {
    ...doc,
    app: undefined,
    elements: doc.elements
      .filter((element) => shown.includes(element.id))
      .map((element) => {
        const { when: _when, ...rest } = element;
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
  const [showAllDevices, setShowAllDevices] = useState(false);
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
  const [saveWarning, setSaveWarning] = useState(false);
  const matRef = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const fontInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const imageTarget = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const longConfirmed = useRef(false);
  const printAfterConnect = useRef(false);
  const [link, setLink] = useState<string | null>(null);

  const tokens = useMemo(() => appTokens(doc, { seed, copy: 1, now }), [doc, seed, now]);
  const laid = useMemo(() => layOut(doc, tokens), [doc, tokens, tick]);
  const size = docSize(laid);
  const output = useMemo(() => renderDoc(laid, tokens), [laid, tokens]);
  const coverage = useMemo(() => inkCoverage(output), [output]);
  const spans = useMemo(() => Object.fromEntries(laid.elements.filter((element) => element.kind === 'text').map((element) => [element.id, textInkSpan(element as TextElement, tokens)])), [laid, tokens]);
  const selected = laid.elements.find((element) => element.id === selectedId) ?? null;
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
    const observer = new ResizeObserver(([entry]) => setMatWidth(entry.contentRect.width));
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
    const isTyping = (event: KeyboardEvent) => event.target instanceof Element && !!event.target.closest('input, textarea, select, [contenteditable]');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isTyping(event)) {
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

  const updateMany = useCallback(
    (patches: PatchSet, group?: string) =>
      set((current) => {
        const byId = new Map(patches.map((item) => [item.id, item.patch]));
        return { ...current, elements: current.elements.map((element) => (byId.has(element.id) ? ({ ...element, ...byId.get(element.id) } as Element) : element)) };
      }, group),
    [set]
  );

  const updateElement = useCallback(
    (id: string, patch: Patch, group?: string) => set((current) => ({ ...current, elements: current.elements.map((element) => (element.id === id ? ({ ...element, ...patch } as Element) : element)) }), group),
    [set]
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
      const result = kind === 'app' && doc.app ? { url: appLink(doc.app.id, doc.app.values), droppedPhotos: false } : await shareLink(doc);
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
      const target = event.target;
      if ((target instanceof Element && target.closest('input, textarea, select, [contenteditable]')) || drawerOpen || connectOpen) {
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

  async function connectPrinter(connection: Connection) {
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
    try {
      for (let copy = 1; copy <= copies; copy += 1) {
        setStatus({ kind: 'busy', message: copies > 1 ? `Printing copy ${copy} of ${copies}` : 'Printing' });
        const copyTokens = appTokens(doc, { seed, copy, now: new Date() });
        const sheet = renderDoc(layOut(doc, copyTokens), copyTokens);
        const { parts } = encode(sheet, laid.landscape, laid.print);
        await send(target, parts, controller.signal, (ratio) => setFeeding((copy - 1 + ratio) / copies), speed);
      }
      setPrinted((items) => recordPrinted(items, { id: `${Date.now()}`, printedAt: Date.now(), copies, thumb: thumbnailOf(output), doc }));
      const message = copies > 1 ? `Printed ${copies} copies.` : 'Printed. Tear against the edge.';
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
    <div className="app" data-panel={panel}>
      <header className="topbar">
        <div className="brand">
          <span className="wordmark">inkless</span>
          <span className="doc-name">{doc.name || 'Untitled'}</span>
        </div>
        <div className="toolbar">
          <button type="button" onClick={() => setDrawerOpen(true)}>
            Presets
          </button>
          <button type="button" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo">
            Undo
          </button>
          <button type="button" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo">
            Redo
          </button>
          <div className="zoom" role="group" aria-label="Snapping">
            {(['off', 'objects', 'grid'] as Magnet[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={magnet === value}
                title={value === 'off' ? 'No snapping' : value === 'objects' ? 'Snap to paper edges, other items and guides' : 'Also snap to a 1 mm grid'}
                onClick={() => {
                  setMagnet(value);
                  try {
                    localStorage.setItem('inkless:magnet', value);
                  } catch {
                    return;
                  }
                }}
              >
                {value === 'off' ? 'Snap off' : value === 'objects' ? 'Snap' : 'Snap + mm'}
              </button>
            ))}
          </div>
          <div className="zoom" role="group" aria-label="Zoom">
            <button type="button" onClick={() => setZoom(Math.max(0.3, +(scale / 1.25).toFixed(2)))} aria-label="Zoom out">
              −
            </button>
            <button type="button" onClick={() => setZoom(null)} aria-pressed={zoom === null}>
              {Math.round(scale * 100)}%
            </button>
            <button type="button" onClick={() => setZoom(Math.min(8, +(scale * 1.25).toFixed(2)))} aria-label="Zoom in">
              +
            </button>
          </div>
        </div>
        <div className="print-cluster">
          <button type="button" className={`printer-pill${printer ? ' is-on' : ''}`} onClick={() => setConnectOpen(true)}>
            <span className="led" aria-hidden="true" />
            {printer ? printer.deviceName ?? printer.label : 'Connect printer'}
          </button>
          <button type="button" className="print-button" onClick={() => (feeding !== null ? abort.current?.abort() : void print())} disabled={busy && feeding === null}>
            {printLabel}
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="side side-left">
          <Palette onAdd={(block) => addBlock(block)} />
          <Layers
            elements={laid.elements}
            selectedIds={selectedIds}
            tokens={tokens}
            onSelect={(id, additive) => {
              revealId.current = id;
              setSelectedIds((current) => (additive ? (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) : [id]));
            }}
          />
        </aside>
        <div
          className={`mat${panning ? ' is-panning' : ''}`}
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
            <div className="readout" aria-live="off">
              x {Math.round(cursor.x)}, y {Math.round(cursor.y)} dots ({(cursor.x / 8).toFixed(1)}, {(cursor.y / 8).toFixed(1)} mm)
            </div>
          )}
          {laid.elements.length === 0 && (
            <div className="empty-paper">
              <p>Empty roll. Drag a block onto the paper, drop a photo, or</p>
              <button type="button" onClick={() => setDrawerOpen(true)}>
                pick a preset
              </button>
            </div>
          )}
        </div>
        <aside className="side side-right">
          {selectedIds.length > 1 ? (
            <MultiInspector count={selectedIds.length} onAlign={align} onLayer={layer} onDuplicate={duplicateSelected} onDelete={deleteSelected} />
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
              paperWidth={doc.landscape ? size.width : PAPER_DOTS}
              onDuplicate={duplicateSelected}
              onDelete={deleteSelected}
              onLayer={layer}
            />
          ) : (
            <>
              {doc.app && findApp(doc.app.id) && (
                <AppPanel
                  manifest={findApp(doc.app.id)!}
                  values={doc.app.values}
                  onChange={(key, value, group) => set((current) => (current.app ? { ...current, app: { ...current.app, values: { ...current.app.values, [key]: value } } } : current), group)}
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
                      return { ...current, elements, app: { ...current.app, values: defaults(app.fields) } };
                    })
                  }
                  onDetach={() => set((current) => detachApp(current, tokens))}
                  onImport={(imported) => set((current) => (current.app ? { ...current, app: { ...current.app, values: { ...current.app.values, ...imported } } } : current))}
                />
              )}
            <DocInspector
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

      <nav className="mobile-tabs" aria-label="Panels">
        {(['blocks', 'paper', 'edit'] as Panel[]).map((value) => (
          <button key={value} type="button" aria-pressed={panel === value} onClick={() => setPanel(value)}>
            {value === 'blocks' ? 'Blocks' : value === 'paper' ? 'Paper' : selected ? 'Edit' : 'Settings'}
          </button>
        ))}
      </nav>

      <div className={`toast toast-${status.kind}`} role="status" aria-live="polite">
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

      {connectOpen && (
        <div className="drawer-backdrop" onPointerDown={() => setConnectOpen(false)} onKeyDown={(event) => event.key === 'Escape' && setConnectOpen(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="connect-title" onPointerDown={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <h2 id="connect-title">Printer</h2>
              <button type="button" onClick={() => setConnectOpen(false)} autoFocus>
                Close
              </button>
            </div>
            {printer ? (
              <div className="connected">
                <p>
                  Connected to <strong>{printer.deviceName ?? printer.label}</strong>.
                </p>
                <div className="button-row">
                  <button type="button" onClick={runTestPage} disabled={busy}>
                    Print a text test page
                  </button>
                  <button type="button" className="danger" onClick={disconnectPrinter}>
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="panel-note">58 mm ESC/POS printers (PT-210 class and similar). Needs desktop or Android Chrome or Edge.</p>
                <ul className="connections">
                  {CONNECTIONS.map((option) => {
                    const available = supported(option.value);
                    return (
                      <li key={option.value}>
                        <button type="button" onClick={() => void connectPrinter(option.value)} disabled={!available || busy}>
                          <strong>{option.label}</strong>
                          <span>{available ? option.detail : 'This browser cannot use this connection.'}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <label className="field toggle">
                  <input type="checkbox" checked={showAllDevices} onChange={(event) => setShowAllDevices(event.target.checked)} />
                  <span>Printer missing from the Bluetooth list? Show every nearby device.</span>
                </label>
              </>
            )}
            <fieldset className="field speed">
              <legend className="field-label">Sending speed</legend>
              {(Object.keys(SPEEDS) as Speed[]).map((value) => (
                <label key={value} className="toggle">
                  <input
                    type="radio"
                    name="speed"
                    checked={speed === value}
                    onChange={() => {
                      setSpeed(value);
                      saveSpeed(value);
                    }}
                  />
                  <span>
                    <strong>{SPEEDS[value].label}</strong> {SPEEDS[value].detail}
                  </span>
                </label>
              ))}
              <p className="panel-note">If a print stops halfway, comes out garbled or skips lines, step down a speed.</p>
            </fieldset>
            {status.message && <p className={`dialog-status status-${status.kind}`}>{status.message}</p>}
          </div>
        </div>
      )}

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
