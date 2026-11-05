import { cx } from '../../styled-system/css';
import type { Magnet } from './Stage';
import { Menu, type MenuItem } from './Menu';
import { Button } from './ui/button';
import { toolbarStyles as styles } from './toolbar.styles';

type Props = {
  documentName: string;
  onPresets: () => void;
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  zoom: { scale: number; value: number | null; wholeFit: number; dotScale: number; onChange: (value: number | null) => void };
  magnet: Magnet;
  onMagnetChange: (value: Magnet) => void;
  printerLabel: string | null;
  onConnect: () => void;
  printing: { label: string; disabled: boolean; message: string; warning: boolean; onPrint: () => void };
};

export function EditorToolbar({ documentName, onPresets, history, zoom, magnet, onMagnetChange, printerLabel, onConnect, printing }: Props) {
  const documentActions: Exclude<MenuItem, 'divider'>[] = [
    { label: 'Presets', onSelect: onPresets },
    { label: 'Undo', onSelect: history.undo, disabled: !history.canUndo },
    { label: 'Redo', onSelect: history.redo, disabled: !history.canRedo }
  ];
  const zoomActions: MenuItem[] = [
    { label: 'Zoom in', hint: 'Ctrl or Cmd and scroll', onSelect: () => zoom.onChange(Math.min(8, +(zoom.scale * 1.25).toFixed(2))) },
    { label: 'Zoom out', onSelect: () => zoom.onChange(Math.max(0.3, +(zoom.scale / 1.25).toFixed(2))) },
    'divider',
    { label: 'Fit width', checked: zoom.value === null, onSelect: () => zoom.onChange(null) },
    { label: 'Fit whole paper', onSelect: () => zoom.onChange(zoom.wholeFit) },
    { label: 'Actual printer dots', hint: 'One dot per screen pixel', checked: zoom.value !== null && Math.abs(zoom.value - zoom.dotScale) < 0.001, onSelect: () => zoom.onChange(zoom.dotScale) }
  ];
  const snapActions: MenuItem[] = (['objects', 'grid', 'off'] as Magnet[]).map((value) => ({
    label: value === 'off' ? 'Snap off' : value === 'objects' ? 'Snap to objects' : 'Snap to objects + mm',
    checked: magnet === value,
    onSelect: () => onMagnetChange(value)
  }));

  return (
    <header className={cx('topbar', styles.root)}>
      <div className={styles.brand}>
        <span className={styles.wordmark}>inkless</span>
        <span className={styles.name}>{documentName || 'Untitled'}</span>
      </div>
      <div className={styles.actions}>
        {documentActions.map((action) => (
          <Button key={action.label} type="button" onClick={action.onSelect} disabled={action.disabled}>
            {action.label}
          </Button>
        ))}
        <Menu label={`${Math.round(zoom.scale * 100)}%`} title="Zoom" items={zoomActions} />
        <Menu label={magnet === 'off' ? 'Snap off' : magnet === 'objects' ? 'Snap' : 'Snap + mm'} title="Snapping" items={snapActions} />
      </div>
      <div className={styles.compact}>
        <Menu label="Actions" title="Editor actions" items={[...documentActions, 'divider', ...zoomActions, 'divider', ...snapActions]} />
      </div>
      <div className={styles.printCluster}>
        <span className={styles.state} data-warning={printing.warning || undefined} role="status" aria-live="polite">
          {printing.message}
        </span>
        <Button type="button" className={styles.printer} aria-label={printerLabel ? `Printer: ${printerLabel}` : 'Connect printer'} onClick={onConnect}>
          <span className={styles.led} data-connected={!!printerLabel || undefined} aria-hidden="true" />
          <svg className={styles.printerIcon} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M5 7V2.5h10V7M5 14H2.5V7h15v7H15M5 11h10v6.5H5z" />
          </svg>
          <span className={styles.printerLabel}>{printerLabel ?? 'Connect printer'}</span>
        </Button>
        <Button type="button" className={styles.print} onClick={printing.onPrint} disabled={printing.disabled}>
          {printing.label}
        </Button>
      </div>
    </header>
  );
}
