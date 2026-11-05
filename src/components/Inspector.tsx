import { useEffect, useRef, type ReactNode } from 'react';
import type { BarcodeElement, BarcodeFormat, DitherAlgo, Doc, Element, Fill, IconName, ImageElement, QrElement, ShapeElement, ShapeKind, TextElement } from '../doc';
import { DEFAULT_END_SPACE, DOTS_PER_MM } from '../doc';
import { allFonts, CATEGORY_LABEL, fontInfo, hasLocalFont, requestFont, type FontCategory } from '../fonts';
import { ditherSamples, frameDefaults } from '../render';
import { estimateSeconds, LONG_PRINT_ROWS, MAX_PRINT_ROWS } from '../printer';
import { TOKEN_HELP } from '../tokens';
import type { Issue } from '../check';
import type { Patch } from './Stage';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Range, NumberInput, Choice, Select, Toggle, type Field } from './fields/controls';
import { fieldStyles as fields } from './fields/styles';
import { panelStyles as panel } from './panel.styles';
import { inspectorStyles as styles } from './inspector.styles';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={panel.group}>
      <h3 className={panel.groupHeading}>{title}</h3>
      {children}
    </section>
  );
}

function FontPicker({ value, onChange, onUpload }: Omit<Field<string>, 'label'> & { onUpload: () => void }) {
  const fonts = allFonts();
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fonts.forEach((font) => void requestFont(font.family));
  }, [fonts.length]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [value]);
  const categories = [...new Set(fonts.map((font) => font.category))] as FontCategory[];
  return (
    <div className={fields.field}>
      <span className={fields.label}>Typeface</span>
      <div className={styles.fontList} ref={listRef} role="group" aria-label="Typeface">
        {categories.map((category) => (
          <div key={category}>
            <span className={styles.fontCategory}>{CATEGORY_LABEL[category]}</span>
            {fonts
              .filter((font) => font.category === category)
              .map((font) => (
                <Button key={font.family} type="button" className={styles.fontOption} aria-pressed={font.family === value} style={{ fontFamily: `"${font.family}", sans-serif` }} onClick={() => onChange(font.family)}>
                  <span>{font.family}</span>
                  <span className={styles.fontSample}>{font.japanese ? 'あア字 Aa' : 'Aa 123'}</span>
                </Button>
              ))}
          </div>
        ))}
      </div>
      {fontInfo(value)?.local && (
        <p className={panel.note}>
          {hasLocalFont(fontInfo(value)!.local!) ? `Using ${value} installed on this computer.` : `${value} is not installed here, so it prints with the bundled IBM Plex Sans.`}
        </p>
      )}
      <Button type="button" className={panel.link} onClick={onUpload}>
        Load your own font file
      </Button>
    </div>
  );
}

const DITHERS: { value: DitherAlgo; label: string }[] = [
  { value: 'threshold', label: 'None' },
  { value: 'floyd', label: 'Floyd' },
  { value: 'atkinson', label: 'Atkinson' },
  { value: 'stucki', label: 'Stucki' },
  { value: 'jarvis', label: 'Jarvis' },
  { value: 'sierra', label: 'Sierra' },
  { value: 'bayer', label: 'Bayer' },
  { value: 'grain', label: 'Grain' },
  { value: 'stipple', label: 'Stipple' },
  { value: 'halftone', label: 'Halftone' },
  { value: 'engrave', label: 'Engraving' },
  { value: 'crosshatch', label: 'Crosshatch' }
];

function DitherLab({ element, onPatch }: { element: ImageElement } & Pick<ElementProps, 'onPatch'>) {
  const previews = ditherSamples(element, DITHERS.map((dither) => dither.value));
  return (
    <fieldset className={fields.field}>
      <legend className={fields.label}>Dithering (None keeps black and white as is; each tile shows this image at real dot size)</legend>
      <div className={styles.dither}>
        {DITHERS.map((dither) => (
          <Button key={dither.value} type="button" className={styles.ditherTile} aria-pressed={element.dither === dither.value} onClick={() => onPatch({ dither: dither.value } as Partial<ImageElement>)}>
            {previews ? <img className={styles.ditherImage} src={previews[dither.value]} alt="" /> : <span className={styles.ditherImage} />}
            <span>{dither.label}</span>
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

const FILLS: { value: Fill; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'solid', label: 'Solid' },
  { value: 'gray25', label: 'Light gray' },
  { value: 'gray50', label: 'Mid gray' },
  { value: 'gray75', label: 'Dark gray' },
  { value: 'stripes', label: 'Stripes' },
  { value: 'dots', label: 'Dots' },
  { value: 'checker', label: 'Checker' }
];

const SHAPES: { value: ShapeKind; label: string }[] = [
  { value: 'rect', label: 'Box' },
  { value: 'ellipse', label: 'Circle' },
  { value: 'line', label: 'Rule' },
  { value: 'dashes', label: 'Dashed rule' },
  { value: 'zigzag', label: 'Zigzag' },
  { value: 'scallop', label: 'Ticket edge' },
  { value: 'icon', label: 'Icon' }
];

const ICONS: { value: IconName; label: string }[] = [
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'key', label: 'Key' },
  { value: 'home', label: 'Home' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'clock', label: 'Clock' },
  { value: 'rules', label: 'List' },
  { value: 'plug', label: 'Plug' },
  { value: 'check', label: 'Checkbox' },
  { value: 'trash', label: 'Bin' },
  { value: 'heart', label: 'Heart' },
  { value: 'info', label: 'Info' },
  { value: 'star', label: 'Star' }
];

const FORMATS: { value: BarcodeFormat; label: string }[] = [
  { value: 'CODE128', label: 'Code 128 (any text)' },
  { value: 'CODE39', label: 'Code 39' },
  { value: 'EAN13', label: 'EAN-13 (12 or 13 digits)' },
  { value: 'UPC', label: 'UPC-A (11 or 12 digits)' },
  { value: 'ITF14', label: 'ITF-14 (13 or 14 digits)' }
];

type ElementProps = {
  element: Element;
  onPatch: (patch: Patch, group?: string) => void;
  onPickImage: () => void;
  onFitImage: () => void;
  onWholePixels: () => void;
  onUploadFont: () => void;
  barcodeError: string | null;
  cropping: boolean;
  onCrop: (on: boolean) => void;
};

function TextFields({ element, onPatch, onUploadFont, laidHeight, clipped }: { element: TextElement; laidHeight: number; clipped: boolean } & Pick<ElementProps, 'onPatch' | 'onUploadFont'>) {
  const weights = fontInfo(element.font)?.weights ?? [400];
  const fit = element.fit ?? 'grow';
  return (
    <>
      <Choice
        label="When text is long"
        value={fit}
        options={[
          { value: 'grow', label: 'Wrap and grow' },
          { value: 'shrink', label: 'Shrink to fit box' },
          { value: 'line', label: 'One line, shrink' }
        ]}
        onChange={(next) => onPatch({ fit: next, h: Math.max(8, Math.round(laidHeight)) } as Partial<TextElement>)}
      />
      {fit !== 'grow' && <Range label="Box height" value={Math.round(element.h)} min={8} max={600} unit=" dots" onChange={(h) => onPatch({ h } as Partial<TextElement>, `th-${element.id}`)} />}
      {clipped && <p className={fields.error}>This text does not fit even at the smallest size. Make the box bigger or the text shorter.</p>}
      <label className={fields.field}>
        <span className={fields.label}>Text</span>
        <textarea className={fields.textarea} rows={4} value={element.text} onChange={(event) => onPatch({ text: event.target.value }, `text-${element.id}`)} />
      </label>
      <details className={panel.details}>
        <summary>Live tokens: dates, dice, random picks</summary>
        <ul className={styles.tokenList}>
          {TOKEN_HELP.map((item) => (
            <li key={item.token} className={styles.tokenRow}>
              <Button type="button" className={styles.token} onClick={() => onPatch({ text: `${element.text}${item.token}` })}>
                {item.token}
              </Button>
              <span>{item.meaning}</span>
            </li>
          ))}
        </ul>
      </details>
      <FontPicker value={element.font} onChange={(font) => onPatch({ font, weight: (fontInfo(font)?.weights ?? [400]).includes(element.weight) ? element.weight : (fontInfo(font)?.weights[0] ?? 400) } as Partial<TextElement>)} onUpload={onUploadFont} />
      <Range label="Size" value={element.size} min={6} max={240} unit=" dots" onChange={(size) => onPatch({ size } as Partial<TextElement>, `size-${element.id}`)} />
      {weights.length > 1 && <Choice label="Weight" value={String(element.weight)} options={weights.map((weight) => ({ value: String(weight), label: String(weight) }))} onChange={(weight) => onPatch({ weight: Number(weight) } as Partial<TextElement>)} />}
      <Choice label="Align" value={element.align} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} onChange={(align) => onPatch({ align } as Partial<TextElement>)} />
      <Range label="Line height" value={element.lineHeight} min={0.8} max={2.4} step={0.05} onChange={(lineHeight) => onPatch({ lineHeight } as Partial<TextElement>, `lh-${element.id}`)} />
      <Range label="Letter spacing" value={element.letterSpacing} min={-4} max={24} unit=" dots" onChange={(letterSpacing) => onPatch({ letterSpacing } as Partial<TextElement>, `ls-${element.id}`)} />
      <Toggle label="Italic" value={element.italic} onChange={(italic) => onPatch({ italic } as Partial<TextElement>)} />
    </>
  );
}

function ImageFields({ element, onPatch, onPickImage, onFitImage, onWholePixels, cropping, onCrop }: { element: ImageElement } & Pick<ElementProps, 'onPatch' | 'onPickImage' | 'onFitImage' | 'onWholePixels' | 'cropping' | 'onCrop'>) {
  return (
    <>
      <div className={panel.row}>
        <Button type="button" onClick={onPickImage}>
          {element.src ? 'Replace photo' : 'Choose photo'}
        </Button>
        {element.src && (
          <Button type="button" onClick={onFitImage}>
            Match photo shape
          </Button>
        )}
      </div>
      {element.src && (
        <div className={styles.crop}>
          <Button type="button" className={styles.pressed} aria-pressed={cropping} onClick={() => onCrop(!cropping)}>
            {cropping ? 'Done cropping' : 'Crop and reposition'}
          </Button>
          <Range label="Crop zoom" value={element.cropZoom ?? 1} min={1} max={5} step={0.05} unit="×" onChange={(cropZoom) => onPatch({ cropZoom } as Partial<ImageElement>, `crop-zoom-${element.id}`)} />
          <Button type="button" className={panel.link} onClick={() => onPatch({ cropZoom: 1, cropX: 0, cropY: 0 } as Partial<ImageElement>)}>
            Reset crop
          </Button>
        </div>
      )}
      {element.src && (
        <>
          <Toggle label="Keep pixels sharp (for pixel art and black-and-white images)" value={element.pixelated === true} onChange={(pixelated) => onPatch({ pixelated } as Partial<ImageElement>)} />
          <Button type="button" onClick={onWholePixels}>
            Whole-pixel size (prints dot for dot)
          </Button>
        </>
      )}
      {element.src && <Toggle label="Trim white edges (good for logos)" value={element.trim === true} onChange={(trim) => onPatch({ trim } as Partial<ImageElement>)} />}
      <Choice label="Frame" value={element.frame ?? 'none'} options={[{ value: 'none', label: 'None' }, { value: 'polaroid', label: 'Polaroid' }, { value: 'border', label: 'Thin border' }]} onChange={(frame) => onPatch({ frame } as Partial<ImageElement>)} />
      {element.frame && element.frame !== 'none' && (
        <>
          <Range label="Frame padding" value={element.framePad ?? frameDefaults(element.frame, element.w).pad} min={0} max={80} unit=" dots" onChange={(framePad) => onPatch({ framePad } as Partial<ImageElement>, `fp-${element.id}`)} />
          {element.frame === 'polaroid' && <Range label="Bottom margin" value={element.frameBottom ?? frameDefaults(element.frame, element.w).bottom} min={0} max={240} unit=" dots" onChange={(frameBottom) => onPatch({ frameBottom } as Partial<ImageElement>, `fb-${element.id}`)} />}
        </>
      )}
      <DitherLab element={element} onPatch={onPatch} />
      <Choice label="Fit" value={element.fit} options={[{ value: 'cover', label: 'Fill' }, { value: 'contain', label: 'Fit' }, { value: 'stretch', label: 'Stretch' }]} onChange={(fit) => onPatch({ fit } as Partial<ImageElement>)} />
      <Range label="Brightness" value={element.brightness} min={-100} max={100} onChange={(brightness) => onPatch({ brightness } as Partial<ImageElement>, `br-${element.id}`)} />
      <Range label="Contrast" value={element.contrast} min={-100} max={100} onChange={(contrast) => onPatch({ contrast } as Partial<ImageElement>, `ct-${element.id}`)} />
      <Range label="Gamma" value={element.gamma} min={0.3} max={3} step={0.05} onChange={(gamma) => onPatch({ gamma } as Partial<ImageElement>, `gm-${element.id}`)} />
      <Range label="Threshold" value={element.threshold} min={1} max={254} onChange={(threshold) => onPatch({ threshold } as Partial<ImageElement>, `th-${element.id}`)} />
    </>
  );
}

function QrFields({ element, onPatch }: { element: QrElement } & Pick<ElementProps, 'onPatch'>) {
  return (
    <>
      <label className={fields.field}>
        <span className={fields.label}>Link or text</span>
        <Input value={element.data} onChange={(event) => onPatch({ data: event.target.value } as Partial<QrElement>, `qr-${element.id}`)} />
      </label>
      {!element.data && <p className={fields.error}>Type something to encode. An empty QR code prints nothing.</p>}
      <Choice label="Error correction" value={element.ecc} options={[{ value: 'L', label: 'L 7%' }, { value: 'M', label: 'M 15%' }, { value: 'Q', label: 'Q 25%' }, { value: 'H', label: 'H 30%' }]} onChange={(ecc) => onPatch({ ecc } as Partial<QrElement>)} />
    </>
  );
}

function BarcodeFields({ element, onPatch, barcodeError }: { element: BarcodeElement } & Pick<ElementProps, 'onPatch' | 'barcodeError'>) {
  return (
    <>
      <label className={fields.field}>
        <span className={fields.label}>Value</span>
        <Input value={element.data} onChange={(event) => onPatch({ data: event.target.value } as Partial<BarcodeElement>, `bc-${element.id}`)} />
      </label>
      {barcodeError && <p className={fields.error}>{barcodeError}. Nothing prints until the value fits the format.</p>}
      <Select label="Format" value={element.format} options={FORMATS} onChange={(format) => onPatch({ format } as Partial<BarcodeElement>)} />
      <Toggle label="Print the value under the bars" value={element.showText} onChange={(showText) => onPatch({ showText } as Partial<BarcodeElement>)} />
    </>
  );
}

function ShapeFields({ element, onPatch }: { element: ShapeElement } & Pick<ElementProps, 'onPatch'>) {
  const closed = element.shape === 'rect' || element.shape === 'ellipse';
  return (
    <>
      <Select label="Shape" value={element.shape} options={SHAPES} onChange={(shape) => onPatch({ shape, ...(shape === 'icon' ? { icon: element.icon ?? 'info', stroke: 2 } : {}) } as Partial<ShapeElement>)} />
      {element.shape === 'icon' && <Select label="Icon" value={element.icon ?? 'info'} options={ICONS} onChange={(icon) => onPatch({ icon } as Partial<ShapeElement>)} />}
      <Select label="Fill" value={element.fill} options={closed ? FILLS : FILLS.filter((fill) => fill.value !== 'none')} onChange={(fill) => onPatch({ fill } as Partial<ShapeElement>)} />
      {(closed || element.shape === 'line' || element.shape === 'dashes') && <Range label={closed ? 'Outline' : 'Thickness'} value={element.stroke} min={0} max={40} unit=" dots" onChange={(stroke) => onPatch({ stroke } as Partial<ShapeElement>, `st-${element.id}`)} />}
      {element.shape === 'rect' && <Range label="Corner radius" value={element.radius} min={0} max={120} unit=" dots" onChange={(radius) => onPatch({ radius } as Partial<ShapeElement>, `rd-${element.id}`)} />}
    </>
  );
}

const KIND_LABEL: Record<Element['kind'], string> = { text: 'Text', image: 'Photo', qr: 'QR code', barcode: 'Barcode', shape: 'Shape' };

export function ElementInspector(props: ElementProps & { laidHeight: number; clipped: boolean; paperWidth: number; onDuplicate: () => void; onDelete: () => void; onLayer: (direction: 1 | -1) => void }) {
  const { element, onPatch } = props;
  return (
    <div className={panel.body}>
      <div className={panel.body}>
        <h2 className={panel.heading}>{KIND_LABEL[element.kind]}</h2>
        <div className={panel.row}>
          <Button type="button" onClick={() => props.onLayer(-1)} title="Send backward">
            Back
          </Button>
          <Button type="button" onClick={() => props.onLayer(1)} title="Bring forward">
            Front
          </Button>
          <Button type="button" onClick={props.onDuplicate} title="Duplicate (Ctrl+D)">
            Copy
          </Button>
          <Button type="button" className={panel.danger} onClick={props.onDelete} title="Delete (Del)">
            Delete
          </Button>
        </div>
      </div>
      <Group title="Content">
        {element.kind === 'text' && <TextFields element={element} onPatch={onPatch} onUploadFont={props.onUploadFont} laidHeight={props.laidHeight} clipped={props.clipped} />}
        {element.kind === 'image' && <ImageFields element={element} onPatch={onPatch} onPickImage={props.onPickImage} onFitImage={props.onFitImage} onWholePixels={props.onWholePixels} cropping={props.cropping} onCrop={props.onCrop} />}
        {element.kind === 'qr' && <QrFields element={element} onPatch={onPatch} />}
        {element.kind === 'barcode' && <BarcodeFields element={element} onPatch={onPatch} barcodeError={props.barcodeError} />}
        {element.kind === 'shape' && <ShapeFields element={element} onPatch={onPatch} />}
        <Toggle label="Invert (white on black)" value={element.invert} onChange={(invert) => onPatch({ invert })} />
      </Group>
      <Group title="Position">
        <div className={panel.grid}>
          <NumberInput label="X" value={element.x} onChange={(x) => onPatch({ x })} />
          <NumberInput label="Y" value={element.y} onChange={(y) => onPatch({ y })} />
          <NumberInput label="Width" value={element.w} min={8} onChange={(w) => onPatch({ w: Math.max(8, w) })} />
          {element.kind !== 'text' && <NumberInput label="Height" value={element.h} min={8} onChange={(h) => onPatch({ h: Math.max(8, h) })} />}
          <NumberInput label="Rotation" value={element.rotation} onChange={(rotation) => onPatch({ rotation: ((rotation % 360) + 360) % 360 })} />
        </div>
        <Button type="button" onClick={() => onPatch({ x: 0, w: props.paperWidth })}>
          Stretch edge to edge
        </Button>
        <p className={panel.note}>Units are printer dots. 8 dots = 1 mm. The print head covers {props.paperWidth} dots.</p>
      </Group>
    </div>
  );
}

type DocProps = {
  issues: Issue[];
  onSelectIssue: (id: string) => void;
  ditherNew: boolean;
  onDitherNew: (on: boolean) => void;
  ditheredCount: number;
  onUndither: () => void;
  doc: Doc;
  size: { width: number; height: number };
  onDoc: (update: (doc: Doc) => Doc, group?: string) => void;
  onReroll: () => void;
  onExportPng: () => void;
  onExportBin: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onShelve: () => void;
  coverage: number;
  link: string | null;
  hasApp: boolean;
  onCopyLink: (kind: 'design' | 'app') => void;
};

export function DocInspector({ issues, onSelectIssue, ditherNew, onDitherNew, ditheredCount, onUndither, doc, size, onDoc, onReroll, onExportPng, onExportBin, onExportJson, onImportJson, onShelve, coverage, link, hasApp, onCopyLink }: DocProps) {
  const length = doc.landscape ? size.width : size.height;
  const setPrint = (patch: Partial<Doc['print']>, group?: string) => onDoc((current) => ({ ...current, print: { ...current.print, ...patch } }), group);
  return (
    <div className={panel.body}>
      <h2 className={panel.heading}>This print</h2>
      <Group title={issues.length ? `Check (${issues.length})` : 'Check'}>
        {issues.length === 0 ? (
          <p className={panel.note}>Nothing is cut off, clipped or overlapping.</p>
        ) : (
          <ul className={styles.issues}>
            {issues.map((issue, index) => (
              <li key={`${issue.id}-${issue.kind}-${index}`} className={styles.issue}>
                <span>{issue.message}</span>
                <Button type="button" className={styles.issueButton} onClick={() => onSelectIssue(issue.id)}>
                  Select
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Group>
      <Group title="Paper">
        <label className={fields.field}>
          <span className={fields.label}>Name</span>
          <Input value={doc.name} onChange={(event) => onDoc((current) => ({ ...current, name: event.target.value }), 'doc-name')} />
        </label>
        <Choice
          label="Direction"
          value={doc.landscape ? 'landscape' : 'portrait'}
          options={[{ value: 'portrait', label: 'Down the roll' }, { value: 'landscape', label: 'Along the roll' }]}
          onChange={(value) => onDoc((current) => ({ ...current, landscape: value === 'landscape' }))}
        />
        <p className={panel.note}>The printer gets exactly this paper, dot for dot, including the blank end you see under the design.</p>
        <Toggle label="Grow length to fit content" value={doc.autoLength} onChange={(autoLength) => onDoc((current) => ({ ...current, autoLength, length }))} />
        {doc.autoLength && <Range label="Blank paper at the end" value={Math.round((doc.endSpace ?? DEFAULT_END_SPACE) / DOTS_PER_MM)} min={0} max={40} unit=" mm" onChange={(mm) => onDoc((current) => ({ ...current, endSpace: mm * DOTS_PER_MM }), 'end-space')} />}
        {doc.autoLength && (doc.endSpace ?? DEFAULT_END_SPACE) < 10 * DOTS_PER_MM && <p className={panel.note}>The tear bar sits about 10 mm past the print head, so less than that leaves the end of the design inside the printer.</p>}
        {!doc.autoLength && <Range label="Length" value={Math.round(doc.length / DOTS_PER_MM)} min={15} max={600} unit=" mm" onChange={(mm) => onDoc((current) => ({ ...current, length: mm * DOTS_PER_MM }), 'doc-length')} />}
        <p className={panel.note}>
          {Math.round(length / DOTS_PER_MM)} mm of paper per copy, about {estimateSeconds(length)} s over Bluetooth, {Math.round(coverage * 100)}% of dots heated.
        </p>
        {length > MAX_PRINT_ROWS ? (
          <p className={fields.error}>Longer than 1 m. The printer maker advises shorter continuous prints, so you will be asked to confirm.</p>
        ) : length > LONG_PRINT_ROWS ? (
          <p className={fields.error}>Longer than 30 cm. Check the roll has enough paper left.</p>
        ) : null}
        {coverage > 0.5 && <p className={fields.error}>Over half the dots are black. Large solid areas print faint on low battery; try a pattern fill.</p>}
      </Group>
      <Group title="Printing">
        <Toggle label="Dither new photos (off prints images as plain black and white)" value={ditherNew} onChange={onDitherNew} />
        {ditheredCount > 0 && (
          <Button type="button" onClick={onUndither}>
            Remove dithering from {ditheredCount === 1 ? 'the 1 dithered image' : `all ${ditheredCount} dithered images`}
          </Button>
        )}
        <Range label="Boldness" value={doc.print.darkness} min={60} max={230} onChange={(darkness) => setPrint({ darkness }, 'darkness')} />
        <Range label="Heat (0 keeps printer default)" value={doc.print.heat} min={0} max={255} onChange={(heat) => setPrint({ heat }, 'heat')} />

        {doc.landscape && (
          <Choice
            label="Turn the design"
            value={String(doc.print.rotate ?? 90)}
            options={[{ value: '90', label: 'Clockwise' }, { value: '270', label: 'Counterclockwise' }]}
            onChange={(value) => setPrint({ rotate: Number(value) as 90 | 270 })}
          />
        )}
        <NumberInput
          label="Printer width in dots (384 = 58 mm, 576 = 80 mm)"
          value={doc.print.printWidth ?? 384}
          min={128}
          max={2048}
          onChange={(value) => setPrint({ printWidth: Math.max(128, Math.min(2048, Math.round(value / 8) * 8)) }, 'print-width')}
        />
        {(doc.print.printWidth ?? 384) !== 384 && <p className={panel.note}>The design is scaled to this width when printing, so dots no longer match the preview one to one.</p>}
        <Select
          label="Cutter"
          value={doc.print.cut ?? 'none'}
          options={[{ value: 'none', label: 'No cutter (tear by hand)' }, { value: 'full', label: 'Full cut' }, { value: 'partial', label: 'Partial cut' }]}
          onChange={(cut) => setPrint({ cut: cut as Doc['print']['cut'] })}
        />
        {doc.print.cut && doc.print.cut !== 'none' && <Range label="Feed before the cut" value={doc.print.cutFeed ?? 0} min={0} max={255} onChange={(cutFeed) => setPrint({ cutFeed }, 'cut-feed')} />}
        <Range label="Copies" value={doc.print.copies} min={1} max={20} onChange={(copies) => setPrint({ copies }, 'copies')} />
        <Button type="button" onClick={onReroll}>
          Reroll dice and picks
        </Button>
      </Group>
      <Group title="Files">
        <div className={panel.row}>
          <Button type="button" onClick={onShelve}>
            Save to my designs
          </Button>
          <Button type="button" onClick={onExportPng}>
            Download PNG
          </Button>
          <Button type="button" onClick={onExportBin}>
            Download ESC/POS
          </Button>
          <Button type="button" onClick={onExportJson}>
            Export design
          </Button>
          <Button type="button" onClick={onImportJson}>
            Import design
          </Button>
          <Button type="button" onClick={() => onCopyLink('design')}>
            Copy share link
          </Button>
          {hasApp && (
            <Button type="button" onClick={() => onCopyLink('app')}>
              Copy preset link
            </Button>
          )}
        </div>
        {link && (
          <label className={fields.field}>
            <span className={fields.label}>Link ({link.length.toLocaleString()} characters). It opens this design in inkless; nothing is uploaded.</span>
            <Input readOnly value={link} onFocus={(event) => event.target.select()} />
          </label>
        )}
      </Group>
      <Group title="Shortcuts">
        <ul className={styles.shortcuts}>
          <li>
            <kbd>Del</kbd> delete, <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate
          </li>
          <li>
            <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> redo
          </li>
          <li>Arrows nudge 1 dot, with Shift 8 dots</li>
          <li>Hold Alt while dragging to skip snapping</li>
          <li>Paste an image to add it</li>
        </ul>
      </Group>
    </div>
  );
}
