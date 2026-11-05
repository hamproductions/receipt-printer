import { Button } from './ui/button';
import { Input } from './ui/input';
import { Choice, Range, Select } from './fields/controls';
import { fieldStyles as fields } from './fields/styles';
import { panelStyles as styles } from './panel.styles';

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'stretch' | 'stack' | 'spread';

export type SectionStyle = { gap?: number; inset?: number; align?: 'left' | 'center' | 'right'; headingFont?: string; headingSize?: number; bodyFont?: string; bodySize?: number; everywhere?: boolean };

export type SectionInfo = { gap: number; inset: number; align: 'left' | 'center' | 'right'; headingFont: string; headingSize: number; bodyFont: string; bodySize: number };

type Props = {
  count: number;
  section: SectionInfo | null;
  fonts: string[];
  onSection: (style: SectionStyle) => void;
  onGroup: () => void;
  onUngroup: () => void;
  onAlign: (mode: AlignMode) => void;
  onLayer: (direction: 1 | -1 | 'top' | 'bottom') => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

const ROWS: { title: string; items: { mode: AlignMode; label: string }[] }[] = [
  {
    title: 'Line up',
    items: [
      { mode: 'left', label: 'Left edges' },
      { mode: 'center', label: 'Centers' },
      { mode: 'right', label: 'Right edges' },
      { mode: 'top', label: 'Tops' },
      { mode: 'middle', label: 'Middles' },
      { mode: 'bottom', label: 'Bottoms' }
    ]
  },
  {
    title: 'Space out',
    items: [
      { mode: 'stack', label: 'Stack, 1 mm gaps' },
      { mode: 'spread', label: 'Even gaps' },
      { mode: 'stretch', label: 'Edge to edge' }
    ]
  }
];

export function MultiInspector({ count, section, fonts, onSection, onGroup, onUngroup, onAlign, onLayer, onDuplicate, onDelete }: Props) {
  return (
    <div className={styles.body}>
      <h2 className={styles.heading}>{section ? 'Section' : `${count} selected`}</h2>
      <p className={styles.note}>{section ? 'Click again on one item to edit it alone. Drag to move the whole section.' : 'Drag any of them to move all. Arrows nudge all.'}</p>
      {section && (
        <section className={styles.group}>
          <h3 className={styles.groupHeading}>Section layout</h3>
          <Range label="Space between rows" min={0} max={40} value={section.gap} unit=" dots" onChange={(gap) => onSection({ gap })} />
          <Range label="Side padding" min={0} max={64} value={section.inset} unit=" dots" onChange={(inset) => onSection({ inset })} />
          <Choice label="Align" value={section.align} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} onChange={(align) => onSection({ align })} />
          <h3 className={styles.groupHeading}>Typography</h3>
          <div className={styles.grid}>
            <Select label="Heading font" value={section.headingFont} options={fonts.map((font) => ({ value: font, label: font }))} onChange={(headingFont) => onSection({ headingFont })} />
            <label className={fields.field}>
              <span className={fields.label}>Heading size</span>
              <Input type="number" min={10} max={80} value={section.headingSize} onChange={(event) => onSection({ headingSize: Number(event.target.value) || section.headingSize })} />
            </label>
            <Select label="Body font" value={section.bodyFont} options={fonts.map((font) => ({ value: font, label: font }))} onChange={(bodyFont) => onSection({ bodyFont })} />
            <label className={fields.field}>
              <span className={fields.label}>Body size</span>
              <Input type="number" min={8} max={60} value={section.bodySize} onChange={(event) => onSection({ bodySize: Number(event.target.value) || section.bodySize })} />
            </label>
          </div>
          <Button type="button" onClick={() => onSection({ headingFont: section.headingFont, headingSize: section.headingSize, bodyFont: section.bodyFont, bodySize: section.bodySize, everywhere: true })}>
            Use this typography in every section
          </Button>
        </section>
      )}
      {ROWS.map((row) => (
        <section key={row.title} className={styles.group}>
          <h3 className={styles.groupHeading}>{row.title}</h3>
          <div className={styles.row}>
            {row.items.map((item) => (
              <Button key={item.mode} type="button" onClick={() => onAlign(item.mode)}>
                {item.label}
              </Button>
            ))}
          </div>
        </section>
      ))}
      <section className={styles.group}>
        <h3 className={styles.groupHeading}>Arrange</h3>
        <div className={styles.row}>
          <Button type="button" onClick={() => onLayer('top')}>
            To front
          </Button>
          <Button type="button" onClick={() => onLayer('bottom')}>
            To back
          </Button>
          <Button type="button" onClick={onDuplicate}>
            Duplicate
          </Button>
          {section ? (
            <Button type="button" onClick={onUngroup}>
              Ungroup
            </Button>
          ) : (
            <Button type="button" onClick={onGroup}>
              Group as section
            </Button>
          )}
          <Button type="button" className={styles.danger} onClick={onDelete}>
            Delete
          </Button>
        </div>
      </section>
    </div>
  );
}
