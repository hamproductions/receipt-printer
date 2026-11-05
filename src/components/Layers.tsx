import { useState, type DragEvent } from 'react';
import type { Element } from '../doc';
import { expandTokens, type TokenContext } from '../tokens';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { layerStyles } from './layers.styles';
import { panelStyles } from './panel.styles';

type Props = {
  elements: Element[];
  selectedIds: string[];
  issueIds: string[];
  tokens: TokenContext;
  onSelect: (ids: string[], additive: boolean) => void;
  onHover: (ids: string[] | null) => void;
  onPatch: (ids: string[], patch: Partial<Element>) => void;
  onMoveBlock: (blockId: string, toIndex: number) => void;
  sectionNames: Record<string, string | undefined>;
  onRenameSection: (group: string, name: string | undefined) => void;
};

type Block = { id: string; group: string | null; members: Element[]; top: number };

const SHAPE_NAME: Record<string, string> = { rect: 'Box', ellipse: 'Circle', line: 'Rule', dashes: 'Divider', zigzag: 'Zigzag edge', scallop: 'Ticket edge', icon: 'Icon' };

function describe(element: Element, tokens: TokenContext) {
  if (element.name) {
    return element.name;
  }
  switch (element.kind) {
    case 'text': {
      const text = expandTokens(element.text, tokens).replace(/\s+/g, ' ').trim();
      return text || (element.text.includes('{{') ? `Empty ${element.text.match(/\{\{\s*(?:[a-z]+:)?([A-Za-z0-9_]+)/)?.[1] ?? 'field'}` : 'Empty text');
    }
    case 'image':
      return element.src ? (element.frame === 'polaroid' ? 'Polaroid photo' : 'Photo') : 'Photo slot (empty)';
    case 'qr': {
      const data = expandTokens(element.data, tokens);
      if (data.startsWith('WIFI:')) {
        return 'Wi-Fi join QR';
      }
      if (data.startsWith('MECARD:')) {
        return 'Contact QR';
      }
      try {
        return `QR to ${new URL(data).host}`;
      } catch {
        return 'QR code';
      }
    }
    case 'barcode':
      return `Barcode ${expandTokens(element.data, tokens)}`;
    case 'shape':
      return element.shape === 'icon' ? `${element.icon ?? ''} icon`.replace(/^./, (char) => char.toUpperCase()) : SHAPE_NAME[element.shape];
  }
}

function KindIcon({ element }: { element: Element }) {
  const common = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true } as const;
  switch (element.kind) {
    case 'text':
      return (
        <svg {...common}>
          <path d="M3 3.5h10M8 3.5v9.5M5.5 13h5" />
        </svg>
      );
    case 'image':
      return (
        <svg {...common}>
          <rect x="2" y="3" width="12" height="10" />
          <path d="M2 11l3.5-3.5L9 11l2-2 3 3" />
        </svg>
      );
    case 'qr':
      return (
        <svg {...common}>
          <rect x="2" y="2" width="4.5" height="4.5" />
          <rect x="9.5" y="2" width="4.5" height="4.5" />
          <rect x="2" y="9.5" width="4.5" height="4.5" />
          <path d="M9.5 9.5h2v2h2.5M11.5 14v-2.5" />
        </svg>
      );
    case 'barcode':
      return (
        <svg {...common}>
          <path d="M2.5 3v10M5 3v10M7 3v10M10 3v10M12 3v10M14 3v10" />
        </svg>
      );
    default:
      return element.shape === 'icon' ? (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 7v4M8 5h.01" />
        </svg>
      ) : element.shape === 'dashes' || element.shape === 'line' || element.shape === 'zigzag' || element.shape === 'scallop' ? (
        <svg {...common}>
          <path d="M2 8h3M6.5 8h3M11 8h3" />
        </svg>
      ) : (
        <svg {...common}>
          <rect x="2.5" y="3.5" width="11" height="9" />
        </svg>
      );
  }
}

function Eye({ off }: { off: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
      {off && <path d="M2.5 13.5l11-11" />}
    </svg>
  );
}

function Lock({ on }: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" />
      <path d={on ? 'M5 7V5a3 3 0 0 1 6 0v2' : 'M5 7V5a3 3 0 0 1 5.6-1.5'} />
    </svg>
  );
}

function blocksOf(elements: Element[]): Block[] {
  const map = new Map<string, Block>();
  for (const element of elements) {
    const id = element.group ? `g:${element.group}` : `e:${element.id}`;
    const block = map.get(id) ?? { id, group: element.group ?? null, members: [], top: Infinity };
    block.members.push(element);
    block.top = Math.min(block.top, element.y);
    map.set(id, block);
  }
  const blocks = [...map.values()].sort((a, b) => a.top - b.top);
  blocks.forEach((block) => block.members.sort((a, b) => a.y - b.y || a.x - b.x));
  return blocks;
}

export function Layers({ elements, selectedIds, issueIds = [], tokens, onSelect, onHover, onPatch, onMoveBlock, sectionNames, onRenameSection }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const blocks = blocksOf(elements);

  if (!elements.length) {
    return <p className={panelStyles.note}>Nothing on the paper yet. Add blocks or a section from the Add tab.</p>;
  }

  const toggles = (ids: string[], members: Element[]) => {
    const hidden = members.every((element) => element.hidden);
    const locked = members.every((element) => element.locked);
    return (
      <span className={layerStyles.tools} data-part="layer-tools">
        <Button type="button" className={layerStyles.tool} data-part="layer-tool" aria-pressed={hidden} aria-label={hidden ? 'Show' : 'Hide (not printed)'} title={hidden ? 'Show' : 'Hide (not printed)'} onClick={() => onPatch(ids, { hidden: !hidden })}>
          <Eye off={hidden} />
        </Button>
        <Button type="button" className={layerStyles.tool} data-part="layer-tool" aria-pressed={locked} aria-label={locked ? 'Unlock' : 'Lock in place'} title={locked ? 'Unlock' : 'Lock in place'} onClick={() => onPatch(ids, { locked: !locked })}>
          <Lock on={locked} />
        </Button>
      </span>
    );
  };

  const renameBox = (element: Element) => (
      <Input
        className={layerStyles.rename}
        autoFocus
        defaultValue={element.name ?? describe(element, tokens)}
        aria-label="Layer name"
        onFocus={(event) => event.target.select()}
        onBlur={(event) => {
          const value = event.target.value.trim();
          if (value !== (element.name ?? describe(element, tokens))) {
            onPatch([element.id], { name: value || undefined });
          }
          setRenaming(null);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            (event.target as HTMLInputElement).blur();
          } else if (event.key === 'Escape') {
            setRenaming(null);
          }
        }}
      />
  );

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    if (dragging && dropAt !== null) {
      onMoveBlock(dragging, dropAt);
    }
    setDragging(null);
    setDropAt(null);
  };

  return (
    <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <p className={panelStyles.note}>What is on your paper now, from the top. Drag a row or use the arrows to move it, double-click to rename.</p>
      <ol className={layerStyles.tree}>
        {blocks.map((block, index) => {
          const ids = block.members.map((element) => element.id);
          const selected = ids.every((id) => selectedIds.includes(id));
          const partly = !selected && ids.some((id) => selectedIds.includes(id));
          const problem = ids.some((id) => issueIds.includes(id));
          const head = block.members[0];
          const expanded = open.has(block.id) || partly;
          const headingEl = block.members.find((element) => element.kind === 'text' && element.role === 'heading') ?? block.members.find((element) => element.kind === 'text') ?? head;
          const title = block.group ? sectionNames[block.group] ?? `${describe({ ...headingEl, name: undefined }, tokens)} section` : describe(head, tokens);
          const renameKey = block.group ? `g:${block.group}` : head.id;
          return (
            <li
              key={block.id}
              className={layerStyles.block}
              data-drop-before={dropAt === index || undefined}
              data-drop-after={(dropAt === index + 1 && index === blocks.length - 1) || undefined}
              onDragOver={(event) => {
                event.preventDefault();
                const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                setDropAt(event.clientY < rect.top + rect.height / 2 ? index : index + 1);
              }}
            >
              <div
                className={layerStyles.row}
                data-selected={selected || undefined}
                data-hidden={(head.hidden && block.members.every((element) => element.hidden)) || undefined}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  setDragging(block.id);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setDropAt(null);
                }}
                onMouseEnter={() => onHover(ids)}
                onMouseLeave={() => onHover(null)}
              >
                {block.group ? (
                  <Button
                    type="button"
                    className={layerStyles.twisty}
                    aria-expanded={expanded}
                    aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
                    onClick={() =>
                      setOpen((current) => {
                        const next = new Set(current);
                        if (next.has(block.id)) {
                          next.delete(block.id);
                        } else {
                          next.add(block.id);
                        }
                        return next;
                      })
                    }
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                      <path d={expanded ? 'M1 3l4 4 4-4' : 'M3 1l4 4-4 4'} fill="none" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                  </Button>
                ) : (
                  <span className={layerStyles.twisty} aria-hidden="true" />
                )}
                {renaming === renameKey ? (
                  block.group ? (
                    <Input
                      className={layerStyles.rename}
                      autoFocus
                      defaultValue={title}
                      aria-label="Section name"
                      onFocus={(event) => event.target.select()}
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value !== title) {
                          onRenameSection(block.group!, value || undefined);
                        }
                        setRenaming(null);
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === 'Enter') {
                          (event.target as HTMLInputElement).blur();
                        } else if (event.key === 'Escape') {
                          setRenaming(null);
                        }
                      }}
                    />
                  ) : (
                    renameBox(head)
                  )
                ) : (
                <Button type="button" className={layerStyles.main} data-part="layer-main" aria-pressed={selected} onClick={(event) => onSelect(ids, event.shiftKey || event.metaKey || event.ctrlKey)} onDoubleClick={() => setRenaming(renameKey)}>
                  {block.group ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                      <rect x="2" y="2.5" width="12" height="11" />
                      <path d="M4.5 6h7M4.5 9h5" />
                    </svg>
                  ) : (
                    <KindIcon element={head} />
                  )}
                  <span className={layerStyles.name}>{title}</span>
                  {block.group && <span className={layerStyles.count}>{block.members.length}</span>}
                  {problem && <span className={layerStyles.problem} title="Has a problem listed under Check" />}
                </Button>
                )}
                {toggles(ids, block.members)}
                <span className={layerStyles.order} data-part="layer-order">
                  <Button type="button" className={layerStyles.tool} data-part="layer-tool" aria-label={`Move ${title} up the paper`} disabled={index === 0} onClick={() => onMoveBlock(block.id, index - 1)}>
                    ↑
                  </Button>
                  <Button type="button" className={layerStyles.tool} data-part="layer-tool" aria-label={`Move ${title} down the paper`} disabled={index === blocks.length - 1} onClick={() => onMoveBlock(block.id, index + 2)}>
                    ↓
                  </Button>
                </span>
              </div>
              {block.group && expanded && (
                <ol className={layerStyles.children}>
                  {block.members.map((element) => (
                    <li key={element.id}>
                      <div className={layerStyles.row} data-selected={(selectedIds.length === 1 && selectedIds[0] === element.id) || undefined} data-hidden={element.hidden || undefined} onMouseEnter={() => onHover([element.id])} onMouseLeave={() => onHover(null)}>
                        <span className={layerStyles.twisty} aria-hidden="true" />
                        {renaming === element.id ? renameBox(element) : (
                        <Button type="button" className={layerStyles.main} data-part="layer-main" aria-pressed={selectedIds.length === 1 && selectedIds[0] === element.id} onClick={(event) => onSelect([element.id], event.shiftKey || event.metaKey || event.ctrlKey)} onDoubleClick={() => setRenaming(element.id)}>
                          <KindIcon element={element} />
                          <span className={layerStyles.name}>{describe(element, tokens)}</span>
                          {issueIds.includes(element.id) && <span className={layerStyles.problem} title="Has a problem listed under Check" />}
                        </Button>
                        )}
                        {toggles([element.id], [element])}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
