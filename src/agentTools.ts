import { createElement, docSize, type Doc, type Element, type ElementKind, type PrintSettings } from './doc';
import { allFonts } from './fonts';
import { APPS, buildApp, findApp } from './apps/registry';
import { fieldsOf } from './prepare';
import type { AppValues } from './apps/types';
import { TOKEN_HELP } from './tokens';
import { appLink, shareLink } from './deeplink';
import { failure, text, type Tool } from './webmcp';

export type AgentApi = {
  doc: Doc;
  laid: Doc;
  output: HTMLCanvasElement;
  selectedIds: string[];
  printerName: string | null;
  update: (change: (doc: Doc) => Doc) => void;
  load: (doc: Doc) => void;
  select: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
  print: () => Promise<string>;
};

const KINDS: ElementKind[] = ['text', 'image', 'qr', 'barcode', 'shape'];
const LOCKED = new Set(['id', 'kind']);
const OPTIONAL: Record<ElementKind, string[]> = { text: [], image: ['frame', 'framePad', 'frameBottom', 'cropZoom', 'cropX', 'cropY'], qr: [], barcode: [], shape: [] };

function summarize(element: Element) {
  return element.kind === 'image' ? { ...element, src: element.src ? `[image ${Math.round(element.src.length / 1024)} KB]` : '' } : element;
}

function cleanPatch(element: Element, patch: unknown) {
  if (!patch || typeof patch !== 'object') {
    throw new Error('patch must be an object');
  }
  const allowed = new Set([...Object.keys(element), ...OPTIONAL[element.kind]]);
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (LOCKED.has(key) || !allowed.has(key)) {
      throw new Error(`${element.kind} has no editable property "${key}"`);
    }
    const current = (element as Record<string, unknown>)[key];
    if (typeof current === 'number' && typeof value !== 'number') {
      throw new Error(`"${key}" must be a number`);
    }
    if (typeof current === 'string' && typeof value !== 'string') {
      throw new Error(`"${key}" must be a string`);
    }
    if (typeof current === 'boolean' && typeof value !== 'boolean') {
      throw new Error(`"${key}" must be true or false`);
    }
    clean[key] = value;
  }
  return clean as Partial<Element>;
}

const ELEMENT_HELP =
  'Coordinates are printer dots (8 dots = 1 mm). Portrait paper is 384 dots wide; landscape paper is 384 dots tall. Text props: text, font, size, weight, italic, align (left|center|right), lineHeight, letterSpacing, invert. Image props: fit (cover|contain|stretch), dither (floyd|atkinson|stucki|jarvis|sierra|bayer|grain|stipple|halftone|engrave|crosshatch|threshold), brightness, contrast, gamma, threshold, frame (none|polaroid|border), framePad, frameBottom, cropZoom (1-5), cropX, cropY (-1..1). QR props: data, ecc (L|M|Q|H). Barcode props: data, format (CODE128|CODE39|EAN13|UPC|ITF14), showText. Shape props: shape (rect|ellipse|line|dashes|zigzag|scallop), fill (none|solid|gray25|gray50|gray75|stripes|dots|checker), stroke, radius. Every element also has x, y, w, h, rotation, invert.';

function checkValues(fields: (typeof APPS)[number]['fields'], input: unknown): AppValues {
  if (input === undefined) {
    return {};
  }
  if (!input || typeof input !== 'object') {
    throw new Error('values must be an object');
  }
  const out: AppValues = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const field = fields.find((item) => item.key === key);
    if (!field) {
      throw new Error(`No field "${key}". Fields: ${fields.map((item) => item.key).join(', ')}`);
    }
    const ok =
      field.type === 'number' ? typeof value === 'number'
      : field.type === 'toggle' ? typeof value === 'boolean'
      : field.type === 'list' ? Array.isArray(value)
      : typeof value === 'string';
    if (!ok) {
      throw new Error(`Field "${key}" expects ${field.type === 'list' ? 'an array of rows' : field.type === 'toggle' ? 'true or false' : field.type === 'number' ? 'a number' : 'a string'}`);
    }
    if (field.type === 'select' && !field.options.includes(value as string)) {
      throw new Error(`Field "${key}" must be one of ${field.options.join(', ')}`);
    }
    out[key] = value as AppValues[string];
  }
  return out;
}

export function buildAgentTools(api: () => AgentApi): Tool[] {
  return [
    {
      name: 'inkless_get_design',
      description: 'Read the current receipt design: paper size in dots, print settings, selection, and every element with its properties in print order (later prints on top). Images are summarized, not returned.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const { laid, selectedIds, printerName } = api();
        return text({ name: laid.name, app: laid.app ?? null, paper: docSize(laid), landscape: laid.landscape, autoLength: laid.autoLength, print: laid.print, printer: printerName ?? 'not connected', selectedIds, elements: laid.elements.map(summarize), help: ELEMENT_HELP, tokens: TOKEN_HELP });
      }
    },
    {
      name: 'inkless_get_preview',
      description: 'Get the exact 1-bit image that will be printed, as a PNG. What you see is dot for dot what the printer burns.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const { output } = api();
        return { content: [{ type: 'image', data: output.toDataURL('image/png').split(',')[1], mimeType: 'image/png' }, { type: 'text', text: `${output.width} x ${output.height} dots` }] };
      }
    },
    {
      name: 'inkless_list_presets',
      description: 'List the preset apps. Each has configurable fields (with types and defaults) that fill its template; pass values to inkless_load_preset or inkless_set_app_values.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => text(APPS.map((app) => ({ id: app.id, name: app.name, hint: app.hint, fields: app.fields })))
    },
    {
      name: 'inkless_load_preset',
      description: 'Replace the current design with a preset app, optionally filling its fields. Missing fields use their defaults. The user can undo it.',
      inputSchema: { type: 'object', properties: { id: { type: 'string', enum: APPS.map((app) => app.id) }, values: { type: 'object' } }, required: ['id'] },
      execute: ({ id, values }) => {
        const app = findApp(String(id));
        if (!app) {
          return failure(`Unknown preset "${String(id)}"`);
        }
        const doc = buildApp(app);
        api().load(doc.app ? { ...doc, app: { ...doc.app, values: { ...doc.app.values, ...checkValues(app.fields, values) } } } : doc);
        return text(`Loaded ${app.name}.`);
      }
    },
    {
      name: 'inkless_set_app_values',
      description: 'Change field values of the current preset app (see inkless_get_design for the app id and inkless_list_presets for its fields). One undo step.',
      inputSchema: { type: 'object', properties: { values: { type: 'object' } }, required: ['values'] },
      execute: ({ values }) => {
        const fields = fieldsOf(api().doc);
        if (!fields.length) {
          return failure('The current design has no fields.');
        }
        const checked = checkValues(fields, values);
        api().update((doc) => ({ ...doc, app: { ...(doc.app ?? {}), values: { ...(doc.app?.values ?? {}), ...checked } } }));
        return text(`Updated ${Object.keys(checked).join(', ')}.`);
      }
    },
    {
      name: 'inkless_get_share_link',
      description: 'Get a link that reopens the current design in inkless. kind "design" packs the whole design into the URL hash (photos are left out if the link would be too long); kind "preset" links to the current preset app with its field values.',
      inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['design', 'preset'] } } },
      annotations: { readOnlyHint: true },
      execute: async ({ kind }) => {
        const { doc } = api();
        if (kind === 'preset') {
          return doc.app?.id ? text(appLink(doc.app.id, doc.app.values)) : failure('The current design is not a preset app.');
        }
        const result = await shareLink(doc);
        return text(result.droppedPhotos ? `${result.url}\n(Photos were left out to keep the link short.)` : result.url);
      }
    },
    {
      name: 'inkless_list_fonts',
      description: 'List typefaces available for text elements, with whether they cover Japanese.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => text(allFonts().map((font) => ({ family: font.family, category: font.category, weights: font.weights, japanese: font.japanese })))
    },
    {
      name: 'inkless_add_element',
      description: `Add an element to the design and select it. Returns its id. ${ELEMENT_HELP}`,
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: KINDS },
          props: { type: 'object', description: 'Properties to set, e.g. {"x":0,"y":40,"w":384,"text":"Hello","font":"DotGothic16","size":32}' }
        },
        required: ['kind']
      },
      execute: ({ kind, props }) => {
        if (!KINDS.includes(kind as ElementKind)) {
          return failure(`kind must be one of ${KINDS.join(', ')}`);
        }
        const element = createElement(kind as ElementKind, { x: 0, y: 0 });
        const next = { ...element, ...(props ? cleanPatch(element, props) : {}) } as Element;
        api().update((doc) => ({ ...doc, elements: [...doc.elements, next] }));
        api().select([next.id]);
        return text({ id: next.id });
      }
    },
    {
      name: 'inkless_update_elements',
      description: `Change properties of one or more elements in a single undo step. ${ELEMENT_HELP}`,
      inputSchema: {
        type: 'object',
        properties: { updates: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, patch: { type: 'object' } }, required: ['id', 'patch'] } } },
        required: ['updates']
      },
      execute: ({ updates }) => {
        if (!Array.isArray(updates) || !updates.length) {
          return failure('updates must be a non-empty array');
        }
        const { doc } = api();
        const patches = new Map<string, Partial<Element>>();
        for (const update of updates as { id: string; patch: unknown }[]) {
          const element = doc.elements.find((item) => item.id === update.id);
          if (!element) {
            return failure(`No element with id "${update.id}"`);
          }
          patches.set(update.id, cleanPatch(element, update.patch));
        }
        api().update((current) => ({ ...current, elements: current.elements.map((element) => (patches.has(element.id) ? ({ ...element, ...patches.get(element.id) } as Element) : element)) }));
        return text(`Updated ${patches.size} element(s).`);
      }
    },
    {
      name: 'inkless_delete_elements',
      description: 'Delete elements by id in a single undo step.',
      inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
      execute: ({ ids }) => {
        const list = Array.isArray(ids) ? (ids as string[]) : [];
        const known = api().doc.elements.filter((element) => list.includes(element.id)).length;
        if (!known) {
          return failure('None of those ids exist.');
        }
        api().update((doc) => ({ ...doc, elements: doc.elements.filter((element) => !list.includes(element.id)) }));
        api().select([]);
        return text(`Deleted ${known} element(s).`);
      }
    },
    {
      name: 'inkless_select',
      description: 'Select elements on the canvas so the user sees which ones you mean.',
      inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
      execute: ({ ids }) => {
        const existing = new Set(api().doc.elements.map((element) => element.id));
        const list = (Array.isArray(ids) ? (ids as string[]) : []).filter((id) => existing.has(id));
        api().select(list);
        return text(`Selected ${list.length} element(s).`);
      }
    },
    {
      name: 'inkless_set_paper',
      description: 'Change paper and print settings. lengthMm applies when autoLength is false. darkness is the 1-bit threshold (60 to 230, higher is bolder). heat is ESC 7 heating time (0 keeps the printer default).',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          landscape: { type: 'boolean' },
          autoLength: { type: 'boolean' },
          endSpaceMm: { type: 'number', minimum: 0, maximum: 40, description: 'Blank paper drawn after the content when autoLength is on' },
          lengthMm: { type: 'number', minimum: 5, maximum: 1000 },
          darkness: { type: 'number', minimum: 60, maximum: 230 },
          heat: { type: 'number', minimum: 0, maximum: 255 },
          copies: { type: 'number', minimum: 1, maximum: 20 }
        }
      },
      execute: (input) => {
        const print: Partial<PrintSettings> = {};
        for (const key of ['darkness', 'heat', 'copies'] as const) {
          if (typeof input[key] === 'number') {
            print[key] = Math.round(input[key] as number);
          }
        }
        api().update((doc) => ({
          ...doc,
          name: typeof input.name === 'string' ? input.name : doc.name,
          landscape: typeof input.landscape === 'boolean' ? input.landscape : doc.landscape,
          autoLength: typeof input.autoLength === 'boolean' ? input.autoLength : doc.autoLength,
          length: typeof input.lengthMm === 'number' ? Math.round(input.lengthMm * 8) : doc.length,
          endSpace: typeof input.endSpaceMm === 'number' ? Math.round(input.endSpaceMm * 8) : doc.endSpace,
          print: { ...doc.print, ...print }
        }));
        return text('Paper updated.');
      }
    },
    {
      name: 'inkless_undo',
      description: 'Undo the last change.',
      inputSchema: { type: 'object', properties: {} },
      execute: () => {
        api().undo();
        return text('Undone.');
      }
    },
    {
      name: 'inkless_redo',
      description: 'Redo the last undone change.',
      inputSchema: { type: 'object', properties: {} },
      execute: () => {
        api().redo();
        return text('Redone.');
      }
    },
    {
      name: 'inkless_print',
      description: 'Print the current design on the connected thermal printer, using the copies setting. The user must have connected a printer with the Connect printer button first, because browsers only open the device chooser from a click.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { consequentialHint: true },
      execute: async () => {
        if (!api().printerName) {
          return failure('No printer connected. Ask the user to click "Connect printer" in inkless first.');
        }
        return text(await api().print());
      }
    }
  ];
}
