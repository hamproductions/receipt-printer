export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'stretch' | 'stack' | 'spread';

type Props = {
  count: number;
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

export function MultiInspector({ count, onAlign, onLayer, onDuplicate, onDelete }: Props) {
  return (
    <div className="inspector-body">
      <h2 className="panel-title">{count} selected</h2>
      <p className="panel-note">Drag any of them to move all. Arrows nudge all.</p>
      {ROWS.map((row) => (
        <section key={row.title} className="group">
          <h3>{row.title}</h3>
          <div className="button-row">
            {row.items.map((item) => (
              <button key={item.mode} type="button" onClick={() => onAlign(item.mode)}>
                {item.label}
              </button>
            ))}
          </div>
        </section>
      ))}
      <section className="group">
        <h3>Arrange</h3>
        <div className="button-row">
          <button type="button" onClick={() => onLayer('top')}>
            To front
          </button>
          <button type="button" onClick={() => onLayer('bottom')}>
            To back
          </button>
          <button type="button" onClick={onDuplicate}>
            Duplicate
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}
