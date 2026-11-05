import { useEffect, useEffectEvent, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from 'react';
import { DOTS_PER_MM, type Element, type ImageElement, type TextElement } from '../doc';
import { cropOverflow } from '../render';
import { stageStyles } from './stage.styles';

export type Patch = Partial<Element>;
export type PatchSet = { id: string; patch: Patch }[];

type Props = {
  elements: Element[];
  width: number;
  height: number;
  landscape: boolean;
  output: HTMLCanvasElement | null;
  zoom: number;
  selectedIds: string[];
  editingId: string | null;
  feeding: number | null;
  onSelect: (ids: string[]) => void;
  onEdit: (id: string | null) => void;
  onChange: (patches: PatchSet, group: string) => void;
  onGestureEnd: () => void;
  onDropBlock: (blockId: string, x: number, y: number) => void;
  onDropFiles: (files: File[], x: number, y: number, targetId: string | null) => void;
  onPickImage: (id: string) => void;
  spans: Spans;
  croppingId: string | null;
  onCrop: (id: string | null) => void;
  magnet: Magnet;
  issueIds: string[];
  hoverFromList: string[] | null;
  emptyFields: { id: string; label: string }[];
  cutIds: string[];
  rulerGuides: { x: number[]; y: number[] };
  onGuides: (guides: { x: number[]; y: number[] }) => void;
  onCursor: (point: { x: number; y: number } | null) => void;
};

export type Magnet = 'off' | 'objects' | 'grid';

type Span = { start: number; width: number };
export type Spans = Record<string, Span>;
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type Point = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
type Guide = { axis: 'x' | 'y'; at: number };

type Gesture =
  | { mode: 'move'; start: Point; origins: Element[]; group: string; moved: boolean; drill: string | null }
  | { mode: 'rotate'; start: Point; origin: Element; group: string }
  | { mode: Handle; start: Point; origin: Element; group: string }
  | { mode: 'marquee'; start: Point; additive: boolean; base: string[] }
  | { mode: 'crop'; start: Point; origin: ImageElement; group: string }
  | { mode: 'guide'; axis: 'x' | 'y'; index: number | null; start: Point };

type GestureView = { mode: 'guide'; axis: 'x' | 'y'; index: number | null } | { mode: 'other' };

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const SNAP_PX = 7;
const GRID = DOTS_PER_MM;
const MIN = 8;
const TOLERANCE_PX = 8;

export const PALETTE_MIME = 'application/x-inkless-kind';

function local(element: Element, point: Point) {
  const cx = element.x + element.w / 2;
  const cy = element.y + element.h / 2;
  const radians = (-element.rotation * Math.PI) / 180;
  const dx = point.x - cx;
  const dy = point.y - cy;
  return { x: dx * Math.cos(radians) - dy * Math.sin(radians) + element.w / 2, y: dx * Math.sin(radians) + dy * Math.cos(radians) + element.h / 2 };
}

function contains(element: Element, point: Point, tolerance: number, span?: Span) {
  const p = local(element, point);
  const start = span?.start ?? 0;
  const width = span?.width ?? element.w;
  return p.x >= start - tolerance && p.x <= start + width + tolerance && p.y >= -tolerance && p.y <= element.h + tolerance;
}

function isFrame(element: Element) {
  return element.kind === 'shape' && element.fill === 'none' && (element.shape === 'rect' || element.shape === 'ellipse');
}

function onFrameEdge(element: Element, point: Point, tolerance: number) {
  if (element.kind !== 'shape') {
    return true;
  }
  const inset = element.stroke + tolerance;
  const inner = { ...element, x: element.x + inset, y: element.y + inset, w: element.w - inset * 2, h: element.h - inset * 2 };
  return inner.w <= 0 || inner.h <= 0 || !contains(inner, point, 0);
}

export function hitsAt(elements: Element[], point: Point, tolerance: number, spans: Spans = {}) {
  const area = (element: Element) => (spans[element.id]?.width ?? element.w) * element.h;
  return elements
    .filter((element) => !element.locked)
    .filter((element) => contains(element, point, tolerance, spans[element.id]) && (!isFrame(element) || onFrameEdge(element, point, tolerance)))
    .sort((a, b) => area(a) - area(b) || elements.indexOf(b) - elements.indexOf(a));
}

function bounds(elements: Element[]): Box | null {
  if (!elements.length) {
    return null;
  }
  const x = Math.min(...elements.map((element) => element.x));
  const y = Math.min(...elements.map((element) => element.y));
  return { x, y, w: Math.max(...elements.map((element) => element.x + element.w)) - x, h: Math.max(...elements.map((element) => element.y + element.h)) - y };
}

function intersects(element: Element, box: Box) {
  return element.x < box.x + box.w && element.x + element.w > box.x && element.y < box.y + box.h && element.y + element.h > box.y;
}

function normalize(a: Point, b: Point): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

function Ruler({ axis, length, zoom, onGrab }: { axis: 'x' | 'y'; length: number; zoom: number; onGrab: (event: PointerEvent) => void }) {
  const mm = Math.floor(length / DOTS_PER_MM);
  const step = DOTS_PER_MM * zoom >= 4 ? 1 : DOTS_PER_MM * zoom >= 1.6 ? 5 : 10;
  const size = length * zoom;
  const marks = [];
  for (let index = 0; index <= mm; index += step) {
    const at = index * DOTS_PER_MM * zoom;
    const tall = index % 10 === 0 ? 10 : index % 5 === 0 ? 6 : 3;
    marks.push(axis === 'x' ? <line key={index} x1={at} x2={at} y1={22 - tall} y2={22} /> : <line key={index} y1={at} y2={at} x1={22 - tall} x2={22} />);
    if (index % 10 === 0 && index > 0) {
      marks.push(
        axis === 'x' ? (
          <text key={`t${index}`} x={at + 2} y={10}>
            {index / 10}cm
          </text>
        ) : (
          <text key={`t${index}`} x={2} y={at - 3}>
            {index / 10}
          </text>
        )
      );
    }
  }
  return (
    <svg
      className={stageStyles.ruler}
      data-part="ruler"
      data-axis={axis}
      width={axis === 'x' ? size : 22}
      height={axis === 'x' ? 22 : size}
      onPointerDown={onGrab}
      aria-label={axis === 'x' ? 'Horizontal ruler, drag down to add a guide' : 'Vertical ruler, drag right to add a guide'}
      role="img"
    >
      {marks}
    </svg>
  );
}

export function Stage(props: Props) {
  const { elements, width, height, output, zoom, selectedIds, editingId, feeding } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [gestureView, setGestureView] = useState<GestureView | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [draftGuide, setDraftGuide] = useState<{ axis: 'x' | 'y'; at: number } | null>(null);

  function startGesture(next: Gesture) {
    gesture.current = next;
    setGestureView(next.mode === 'guide' ? { mode: 'guide', axis: next.axis, index: next.index } : { mode: 'other' });
  }

  function beginGuide(event: PointerEvent, axis: 'x' | 'y', index: number | null) {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    capture(event);
    startGesture({ mode: 'guide', axis, index, start: toDoc(event.clientX, event.clientY) });
    setDraftGuide(index === null ? null : { axis, at: props.rulerGuides[axis][index] });
  }
  const selected = elements.filter((element) => selectedIds.includes(element.id));
  const single = selected.length === 1 ? selected[0] : null;
  const group = selected.length > 1 ? bounds(selected) : null;
  const tolerance = TOLERANCE_PX / zoom;

  useEffect(() => {
    const target = canvasRef.current;
    if (!target || !output) {
      return;
    }
    target.width = output.width;
    target.height = output.height;
    target.getContext('2d')!.drawImage(output, 0, 0);
  }, [output]);

  function toDoc(clientX: number, clientY: number) {
    const rect = paperRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
  }

  function pick(point: Point, cycle: boolean) {
    const hits = hitsAt(elements, point, tolerance, props.spans);
    if (!hits.length) {
      return null;
    }
    if (cycle && single) {
      const index = hits.findIndex((element) => element.id === single.id);
      return hits[(index + 1) % hits.length];
    }
    return hits.find((element) => selectedIds.includes(element.id)) ?? hits[0];
  }

  function capture(event: PointerEvent) {
    if (event.isTrusted && event.buttons !== 0) {
      paperRef.current?.setPointerCapture(event.pointerId);
    }
  }

  function onPaperDown(event: PointerEvent) {
    if (event.button !== 0 || editingId) {
      if (editingId) {
        props.onEdit(null);
      }
      return;
    }
    const point = toDoc(event.clientX, event.clientY);
    const cropping = elements.find((element) => element.id === props.croppingId);
    if (cropping?.kind === 'image') {
      capture(event);
      if (hitsAt([cropping], point, tolerance).length) {
        startGesture({ mode: 'crop', start: point, origin: cropping, group: `crop-${event.timeStamp}` });
        return;
      }
      props.onCrop(null);
    }
    const target = pick(point, event.altKey);
    capture(event);
    if (!target) {
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      startGesture({ mode: 'marquee', start: point, additive, base: additive ? selectedIds : [] });
      if (!additive) {
        props.onSelect([]);
      }
      return;
    }
    const members = target.group ? elements.filter((element) => element.group === target.group).map((element) => element.id) : [target.id];
    const wholeGroupSelected = members.length > 1 && members.every((id) => selectedIds.includes(id)) && selectedIds.length === members.length;
    let ids = selectedIds;
    let drill: string | null = null;
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      ids = members.every((id) => selectedIds.includes(id)) ? selectedIds.filter((id) => !members.includes(id)) : [...new Set([...selectedIds, ...members])];
    } else if (event.altKey) {
      ids = [target.id];
    } else if (wholeGroupSelected) {
      drill = target.id;
    } else if (!selectedIds.includes(target.id)) {
      ids = members;
    }
    props.onSelect(ids);
    const origins = elements.filter((element) => ids.includes(element.id));
    startGesture({ mode: 'move', start: point, origins, group: `move-${event.timeStamp}`, moved: false, drill });
  }

  function beginHandle(event: PointerEvent, element: Element, mode: Handle | 'rotate') {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    capture(event);
    startGesture({ mode, start: toDoc(event.clientX, event.clientY), origin: element, group: `${mode}-${event.timeStamp}` });
  }

  function targets(ignore: string[]) {
    const xs = [0, width / 2, width, ...props.rulerGuides.x];
    const ys = [0, height / 2, height, ...props.rulerGuides.y];
    for (const other of elements) {
      if (!ignore.includes(other.id)) {
        xs.push(other.x, other.x + other.w / 2, other.x + other.w);
        ys.push(other.y, other.y + other.h / 2, other.y + other.h);
      }
    }
    return { xs, ys };
  }

  function snapAxis(start: number, size: number, list: number[], axis: 'x' | 'y', found: Guide[], anchors = [0, size / 2, size]) {
    const threshold = SNAP_PX / zoom;
    let best: { delta: number; shift: number; at: number } | null = null;
    for (const target of list) {
      for (const anchor of anchors) {
        const delta = Math.abs(start + anchor - target);
        if (delta <= threshold && (!best || delta < best.delta)) {
          best = { delta, shift: target - anchor - start, at: target };
        }
      }
    }
    if (best) {
      found.push({ axis, at: best.at });
      return best.shift;
    }
    return props.magnet === 'grid' ? Math.round((start + anchors[0]) / GRID) * GRID - (start + anchors[0]) : 0;
  }

  function snapBox(box: Box, ignore: string[], free: boolean) {
    if (props.magnet === 'off' || free) {
      setGuides([]);
      return { x: 0, y: 0 };
    }
    const found: Guide[] = [];
    const { xs, ys } = targets(ignore);
    const shift = { x: snapAxis(box.x, box.w, xs, 'x', found), y: snapAxis(box.y, box.h, ys, 'y', found) };
    setGuides(found);
    return shift;
  }

  function snapEdge(value: number, axis: 'x' | 'y', ignore: string[], free: boolean, found: Guide[]) {
    if (props.magnet === 'off' || free) {
      return value;
    }
    const { xs, ys } = targets(ignore);
    return value + snapAxis(value, 0, axis === 'x' ? xs : ys, axis, found, [0]);
  }

  function onPaperMove(event: PointerEvent) {
    const point = toDoc(event.clientX, event.clientY);
    props.onCursor(point);
    const active = gesture.current;
    if (!active) {
      const hover = pick(point, false);
      setHoverId(hover?.id ?? null);
      return;
    }
    if (active.mode === 'guide') {
      setDraftGuide({ axis: active.axis, at: Math.round(active.axis === 'x' ? point.x : point.y) });
      return;
    }
    const dx = point.x - active.start.x;
    const dy = point.y - active.start.y;
    if (active.mode === 'marquee') {
      const box = normalize(active.start, point);
      setMarquee(box);
      const inside = elements.filter((element) => intersects(element, box)).map((element) => element.id);
      props.onSelect([...new Set([...active.base, ...inside])]);
      return;
    }
    if (active.mode === 'crop') {
      const overflow = cropOverflow(active.origin);
      if (overflow) {
        const pan = (value: number | undefined, delta: number, room: number) => (room > 0 ? Math.max(-1, Math.min(1, (value ?? 0) - (delta * 2) / room)) : 0);
        props.onChange([{ id: active.origin.id, patch: { cropX: pan(active.origin.cropX, dx, overflow.x), cropY: pan(active.origin.cropY, dy, overflow.y) } as Patch }], active.group);
      }
      return;
    }
    if (active.mode === 'move') {
      if (!active.moved && Math.hypot(dx * zoom, dy * zoom) < 3) {
        return;
      }
      active.moved = true;
      const box = bounds(active.origins)!;
      const shift = snapBox({ ...box, x: box.x + dx, y: box.y + dy }, active.origins.map((element) => element.id), event.altKey);
      props.onChange(
        active.origins.map((origin) => ({ id: origin.id, patch: { x: Math.round(origin.x + dx + shift.x), y: Math.round(origin.y + dy + shift.y) } })),
        active.group
      );
      return;
    }
    const origin = active.origin;
    if (active.mode === 'rotate') {
      const cx = origin.x + origin.w / 2;
      const cy = origin.y + origin.h / 2;
      let angle = (Math.atan2(point.y - cy, point.x - cx) * 180) / Math.PI + 90;
      angle = ((angle % 360) + 360) % 360;
      const step = event.shiftKey ? 15 : 90;
      const nearest = Math.round(angle / step) * step;
      if (event.shiftKey || Math.abs(nearest - angle) < 6) {
        angle = nearest % 360;
      }
      props.onChange([{ id: origin.id, patch: { rotation: Math.round(angle) } }], active.group);
      return;
    }
    const radians = (-origin.rotation * Math.PI) / 180;
    const lx = dx * Math.cos(radians) - dy * Math.sin(radians);
    const ly = dx * Math.sin(radians) + dy * Math.cos(radians);
    let { x, y, w, h } = origin;
    if (active.mode.includes('e')) {
      w = Math.max(MIN, origin.w + lx);
    }
    if (active.mode.includes('w')) {
      w = Math.max(MIN, origin.w - lx);
      x = origin.x + origin.w - w;
    }
    if (active.mode.includes('s')) {
      h = Math.max(MIN, origin.h + ly);
    }
    if (active.mode.includes('n')) {
      h = Math.max(MIN, origin.h - ly);
      y = origin.y + origin.h - h;
    }
    if (origin.rotation === 0) {
      const found: Guide[] = [];
      const ignore = [origin.id];
      if (active.mode.includes('e')) {
        w = Math.max(MIN, snapEdge(x + w, 'x', ignore, event.altKey, found) - x);
      }
      if (active.mode.includes('w')) {
        const left = snapEdge(x, 'x', ignore, event.altKey, found);
        w = Math.max(MIN, w + x - left);
        x = left;
      }
      if (active.mode.includes('s') && origin.kind !== 'text') {
        h = Math.max(MIN, snapEdge(y + h, 'y', ignore, event.altKey, found) - y);
      }
      if (active.mode.includes('n') && origin.kind !== 'text') {
        const top = snapEdge(y, 'y', ignore, event.altKey, found);
        h = Math.max(MIN, h + y - top);
        y = top;
      }
      setGuides(found);
    }
    const square = origin.kind === 'qr' || (event.shiftKey && origin.kind !== 'text');
    if (square) {
      const ratio = origin.w / origin.h;
      if (active.mode === 'n' || active.mode === 's') {
        w = h * ratio;
      } else {
        h = w / ratio;
      }
      if (active.mode.includes('n')) {
        y = origin.y + origin.h - h;
      }
      if (active.mode.includes('w')) {
        x = origin.x + origin.w - w;
      }
    }
    const patch: Patch = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
    if (origin.kind === 'text' && active.mode.length === 1 && (active.mode === 'n' || active.mode === 's')) {
      (patch as Partial<TextElement>).size = Math.max(6, Math.round(origin.size * (h / origin.h)));
    } else if (origin.kind === 'text' && active.mode.length === 2) {
      (patch as Partial<TextElement>).size = Math.max(6, Math.round(origin.size * (w / origin.w)));
    }
    props.onChange([{ id: origin.id, patch }], active.group);
  }

  function onPaperUp(event: PointerEvent) {
    const active = gesture.current;
    if (active?.mode === 'guide') {
      const point = toDoc(event.clientX, event.clientY);
      const at = Math.round(active.axis === 'x' ? point.x : point.y);
      const inside = active.axis === 'x' ? at >= 0 && at <= width : at >= 0 && at <= height;
      const list = props.rulerGuides[active.axis].filter((_, index) => index !== active.index);
      props.onGuides({ ...props.rulerGuides, [active.axis]: inside ? [...list, at] : list });
      setDraftGuide(null);
      gesture.current = null;
      setGestureView(null);
      return;
    }
    if (active?.mode === 'move' && !active.moved && active.drill) {
      props.onSelect([active.drill]);
    }
    if (gesture.current) {
      gesture.current = null;
      setGestureView(null);
      setGuides([]);
      setMarquee(null);
      props.onGestureEnd();
    }
  }

  function onDoubleClick(event: MouseEvent) {
    const target = pick(toDoc(event.clientX, event.clientY), false);
    if (target?.kind === 'text') {
      props.onSelect([target.id]);
      props.onEdit(target.id);
    } else if (target?.kind === 'image' && target.src) {
      props.onSelect([target.id]);
      props.onCrop(target.id);
    } else if (target?.kind === 'image') {
      props.onPickImage(target.id);
    }
  }

  const onCropWheel = useEffectEvent((event: WheelEvent) => {
    const target = elements.find((element) => element.id === props.croppingId);
    if (target?.kind !== 'image') {
      return;
    }
    event.preventDefault();
    const zoomValue = Math.max(1, Math.min(5, (target.cropZoom ?? 1) * Math.exp(-event.deltaY * 0.0015)));
    props.onChange([{ id: target.id, patch: { cropZoom: Math.round(zoomValue * 100) / 100 } as Patch }], `crop-zoom-${target.id}`);
  });

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper || !props.croppingId) {
      return;
    }
    const onWheel = (event: WheelEvent) => onCropWheel(event);
    paper.addEventListener('wheel', onWheel, { passive: false });
    return () => paper.removeEventListener('wheel', onWheel);
  }, [props.croppingId]);

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDropping(false);
    const point = toDoc(event.clientX, event.clientY);
    const blockId = event.dataTransfer.getData(PALETTE_MIME);
    if (blockId) {
      props.onDropBlock(blockId, point.x, point.y);
      return;
    }
    const files = Array.from(event.dataTransfer.files);
    if (files.length) {
      const target = hitsAt(elements, point, 0).find((element) => element.kind === 'image');
      props.onDropFiles(files, point.x, point.y, target?.id ?? null);
    }
  }

  const reveal = feeding === null ? 1 : feeding;
  const editing = elements.find((element) => element.id === editingId);
  const frame = (element: Box & { rotation?: number }) => ({
    left: element.x * zoom,
    top: element.y * zoom,
    width: element.w * zoom,
    height: element.h * zoom,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined
  });

  return (
    <div className={stageStyles.wrap} data-part="stage" style={{ width: width * zoom }}>
      <div className={stageStyles.slot} aria-hidden="true" />
      <div
        ref={paperRef}
        className={stageStyles.paper}
        data-part="paper"
        data-dropping={dropping || undefined}
        data-feeding={feeding !== null || undefined}
        data-hovering={!!hoverId || undefined}
        style={{ width: width * zoom, height: height * zoom, clipPath: `inset(0 0 ${(1 - reveal) * 100}% 0)` }}
        onPointerDown={onPaperDown}
        onPointerMove={onPaperMove}
        onPointerUp={onPaperUp}
        onPointerCancel={onPaperUp}
        onPointerLeave={() => {
          setHoverId(null);
          props.onCursor(null);
        }}
        onDoubleClick={onDoubleClick}
        onDragOver={(event) => {
          event.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={onDrop}
      >
        <canvas ref={canvasRef} className={stageStyles.canvas} data-part="paper-canvas" style={{ width: width * zoom, height: height * zoom }} aria-label="Print preview" />
        {elements.map((element) =>
          element.kind === 'image' && !element.src ? (
            <div key={element.id} className={stageStyles.placeholder} style={frame(element)}>
              <span>Drop a photo here, or double-click to choose</span>
            </div>
          ) : null
        )}
        {!gestureView &&
          (props.hoverFromList ?? (hoverId ? [hoverId] : []))
            .filter((id) => !selectedIds.includes(id))
            .map((id) => elements.find((element) => element.id === id))
            .map((hover) => (hover ? <div key={`hover-${hover.id}`} className={stageStyles.hover} style={frame(hover)} /> : null))}
        {selected.map((element) => (
          <div key={element.id} className={stageStyles.selection} data-part="selection" data-single={!!single || undefined} data-cropping={element.id === props.croppingId || undefined} style={frame(element)} data-element-id={element.id}>
            {element.id === props.croppingId && <span className={stageStyles.cropHint}>Drag to reposition, scroll to zoom. Enter or Esc when done.</span>}
            {single && !editing && element.id !== props.croppingId && (
              <>
                {HANDLES.map((handle) => (
                  <span key={handle} className={stageStyles.handle} data-handle={handle} onPointerDown={(event) => beginHandle(event, element, handle)} />
                ))}
                <span className={stageStyles.rotate} title="Rotate (Shift snaps to 15°)" onPointerDown={(event) => beginHandle(event, element, 'rotate')} />
                <span className={stageStyles.sizeTag}>
                  {Math.round(element.w)} × {Math.round(element.h)}
                </span>
              </>
            )}
          </div>
        ))}
        {props.emptyFields.map((item) => {
          const element = elements.find((candidate) => candidate.id === item.id);
          return element ? (
            <div key={`empty-${item.id}`} className={stageStyles.emptyField} style={frame(element)}>
              <span>{item.label}</span>
            </div>
          ) : null;
        })}
        {group && <div className={stageStyles.group} style={frame(group)} />}
        {elements
          .filter((element) => props.issueIds.includes(element.id))
          .map((element) => (
            <div key={`issue-${element.id}`} className={stageStyles.issue} style={frame(element)}>
              {props.cutIds.includes(element.id) && <span className={stageStyles.cutTag}>Cut off in print</span>}
            </div>
          ))}
        {marquee && <div className={stageStyles.marquee} style={frame(marquee)} />}
        {editing && editing.kind === 'text' && (
          <textarea
            className={stageStyles.inlineEdit}
            autoFocus
            onFocus={(event) => event.target.select()}
            value={editing.text}
            style={{
              ...frame(editing),
              fontFamily: `"${editing.font}", sans-serif`,
              fontSize: editing.size * zoom,
              fontWeight: editing.weight,
              fontStyle: editing.italic ? 'italic' : 'normal',
              lineHeight: editing.lineHeight,
              letterSpacing: editing.letterSpacing * zoom,
              textAlign: editing.align
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => props.onChange([{ id: editing.id, patch: { text: event.target.value } }], `text-${editing.id}`)}
            onBlur={() => {
              props.onEdit(null);
              props.onGestureEnd();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape') {
                (event.target as HTMLTextAreaElement).blur();
              }
            }}
          />
        )}
        {(['x', 'y'] as const).map((axis) =>
          props.rulerGuides[axis].map((at, index) =>
            draftGuide && gestureView?.mode === 'guide' && gestureView.axis === axis && gestureView.index === index ? null : (
              <span
                key={`${axis}-${index}`}
                className={stageStyles.rulerGuide}
                data-part="ruler-guide"
                data-axis={axis}
                style={axis === 'x' ? { left: at * zoom } : { top: at * zoom }}
                title="Drag to move, drag off the paper to remove"
                onPointerDown={(event) => beginGuide(event, axis, index)}
              />
            )
          )
        )}
        {draftGuide && <span className={stageStyles.rulerGuide} data-part="ruler-guide" data-axis={draftGuide.axis} data-draft style={draftGuide.axis === 'x' ? { left: draftGuide.at * zoom } : { top: draftGuide.at * zoom }} />}
        {guides.map((guide, index) => (
          <span key={index} className={stageStyles.guide} data-axis={guide.axis} style={guide.axis === 'x' ? { left: guide.at * zoom } : { top: guide.at * zoom }} />
        ))}
      </div>
      <Ruler axis="x" length={width} zoom={zoom} onGrab={(event) => beginGuide(event, 'y', null)} />
      <Ruler axis="y" length={height} zoom={zoom} onGrab={(event) => beginGuide(event, 'x', null)} />
    </div>
  );
}
