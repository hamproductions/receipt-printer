import { css } from '../../styled-system/css';

export const stageStyles = {
  wrap: css({ position: 'relative', margin: '0 auto' }),
  slot: css({
    position: 'sticky',
    pointerEvents: 'none',
    top: '0',
    zIndex: '3',
    height: '22px',
    margin: '0 -18px',
    borderRadius: '0 0 8px 8px',
    background: 'ink',
    boxShadow: '0 6px 0 -2px {colors.mat.deep}'
  }),
  paper: css({
    position: 'relative',
    touchAction: 'none',
    userSelect: 'none',
    background: 'paper',
    boxShadow: '0 10px 18px rgba(0, 0, 0, 0.28)',
    _after: {
      content: "''",
      position: 'absolute',
      top: '100%',
      left: '0',
      right: '0',
      height: '6px',
      background: 'paper',
      maskImage: 'conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg)',
      maskPosition: '50%',
      maskSize: '10px 100%',
      pointerEvents: 'none'
    },
    '&[data-feeding]': {
      transition: 'clip-path 160ms linear',
      '@media (prefers-reduced-motion: reduce)': { transition: 'none' }
    },
    '&[data-dropping]': { outline: '3px dashed {colors.accent}', outlineOffset: '4px' },
    '&[data-hovering]': { cursor: 'move' }
  }),
  canvas: css({ display: 'block', imageRendering: 'pixelated' }),
  placeholder: css({
    position: 'absolute',
    pointerEvents: 'none',
    display: 'grid',
    placeItems: 'center',
    padding: '12px',
    border: '2px dashed {colors.ink.soft}',
    background: 'repeating-linear-gradient(-45deg, transparent 0 10px, rgba(25, 26, 25, 0.06) 10px 20px)',
    color: 'ink.soft',
    textAlign: 'center'
  }),
  hover: css({ position: 'absolute', pointerEvents: 'none', outline: '1px dashed {colors.accent}' }),
  selection: css({
    position: 'absolute',
    pointerEvents: 'none',
    outline: '1px solid {colors.accent}',
    background: 'rgba(255, 79, 134, 0.06)',
    '&[data-single]': { outlineWidth: '2px' },
    '&[data-cropping]': { outline: '2px dashed {colors.accent}', background: 'none', cursor: 'grab' }
  }),
  group: css({ position: 'absolute', pointerEvents: 'none', outline: '2px dashed {colors.accent}', outlineOffset: '3px' }),
  marquee: css({ position: 'absolute', pointerEvents: 'none', border: '1px solid {colors.accent}', background: 'rgba(255, 79, 134, 0.12)' }),
  handle: css({
    position: 'absolute',
    width: '12px',
    height: '12px',
    border: '2px solid {colors.accent}',
    background: 'paper',
    pointerEvents: 'auto',
    touchAction: 'none',
    _before: { content: "''", position: 'absolute', inset: '-9px' },
    '&[data-handle="nw"]': { left: '-7px', top: '-7px', cursor: 'nwse-resize' },
    '&[data-handle="n"]': { left: 'calc(50% - 6px)', top: '-7px', cursor: 'ns-resize' },
    '&[data-handle="ne"]': { right: '-7px', top: '-7px', cursor: 'nesw-resize' },
    '&[data-handle="e"]': { right: '-7px', top: 'calc(50% - 6px)', cursor: 'ew-resize' },
    '&[data-handle="se"]': { right: '-7px', bottom: '-7px', cursor: 'nwse-resize' },
    '&[data-handle="s"]': { left: 'calc(50% - 6px)', bottom: '-7px', cursor: 'ns-resize' },
    '&[data-handle="sw"]': { left: '-7px', bottom: '-7px', cursor: 'nesw-resize' },
    '&[data-handle="w"]': { left: '-7px', top: 'calc(50% - 6px)', cursor: 'ew-resize' }
  }),
  rotate: css({
    position: 'absolute',
    top: '-36px',
    left: 'calc(50% - 8px)',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: 'accent',
    cursor: 'grab',
    pointerEvents: 'auto',
    touchAction: 'none',
    _before: { content: "''", position: 'absolute', inset: '-8px' },
    _after: { content: "''", position: 'absolute', top: '16px', left: '7px', width: '2px', height: '12px', background: 'accent' }
  }),
  cropHint: css({
    position: 'absolute',
    left: '0',
    right: '0',
    bottom: 'calc(100% + 6px)',
    padding: '2px 6px',
    borderRadius: 'sm',
    background: 'ink',
    color: 'paper',
    fontSize: '12px',
    textAlign: 'center'
  }),
  sizeTag: css({
    position: 'absolute',
    left: '50%',
    bottom: '-30px',
    padding: '1px 6px',
    borderRadius: 'sm',
    background: 'ink',
    color: 'paper',
    fontSize: '11px',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    transform: 'translateX(-50%)'
  }),
  inlineEdit: css({
    position: 'absolute',
    zIndex: '5',
    minHeight: '1em',
    padding: '0',
    border: '0',
    borderRadius: '0',
    outline: '2px solid {colors.accent}',
    background: 'rgba(251, 252, 248, 0.96)',
    overflow: 'hidden',
    resize: 'none'
  }),
  ruler: css({
    position: 'absolute',
    zIndex: '4',
    overflow: 'visible',
    cursor: 'copy',
    stroke: 'mat.line',
    fill: 'mat.line',
    '& text': { fill: 'mat.label', stroke: 'none' },
    fontSize: '9px',
    userSelect: 'none',
    '&[data-axis="x"]': { top: '0', left: '0' },
    '&[data-axis="y"]': { top: '22px', left: '-26px' }
  }),
  rulerGuide: css({
    position: 'absolute',
    zIndex: '3',
    background: '#1f8fff',
    touchAction: 'none',
    _before: { content: "''", position: 'absolute', inset: '-5px' },
    '&[data-axis="x"]': { top: '0', bottom: '0', width: '1px', cursor: 'col-resize' },
    '&[data-axis="y"]': { left: '0', right: '0', height: '1px', cursor: 'row-resize' },
    '&[data-draft]': { opacity: '0.6' }
  }),
  guide: css({
    position: 'absolute',
    zIndex: '4',
    pointerEvents: 'none',
    background: 'accent',
    '&[data-axis="x"]': { top: '0', bottom: '0', width: '1px' },
    '&[data-axis="y"]': { left: '0', right: '0', height: '1px' }
  }),
  issue: css({
    position: 'absolute',
    pointerEvents: 'none',
    outline: '2px dashed {colors.danger}',
    outlineOffset: '1px',
    background: 'repeating-linear-gradient(45deg, rgba(163, 18, 47, 0.12) 0 6px, transparent 6px 12px)'
  }),
  cutTag: css({
    position: 'absolute',
    top: '-20px',
    left: '0',
    padding: '1px 6px',
    borderRadius: 'sm',
    background: 'danger',
    color: 'white',
    fontSize: '11px',
    whiteSpace: 'nowrap'
  }),
  emptyField: css({
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    padding: '0 6px',
    border: '1px dashed #9aa59f',
    color: 'ink.soft',
    fontSize: '13px',
    pointerEvents: 'none'
  })
};
