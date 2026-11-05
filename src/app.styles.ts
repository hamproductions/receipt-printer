import { css } from '../styled-system/css';

export const appStyles = {
  root: css({
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    height: '100dvh',
    '@media (max-width: 900px)': { gridTemplateRows: 'auto minmax(0, 1fr) auto' }
  }),
  workspace: css({
    display: 'grid',
    gridTemplateColumns: '260px minmax(0, 1fr) 328px',
    minHeight: '0',
    '@media (max-width: 900px)': { gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: 'minmax(0, 1fr)' }
  }),
  side: css({
    minHeight: '0',
    overflowY: 'auto',
    padding: '16px',
    background: 'panel',
    '@media (max-width: 900px)': { gridArea: '1 / 1', border: '0' }
  }),
  left: css({
    borderRight: '1px solid {colors.panel.line}',
    '@media (max-width: 900px)': { borderRightWidth: '0', '.app[data-panel="paper"] &, .app[data-panel="edit"] &': { display: 'none' } }
  }),
  right: css({
    borderLeft: '1px solid {colors.panel.line}',
    '@media (max-width: 900px)': { borderLeftWidth: '0', '.app[data-panel="paper"] &, .app[data-panel="blocks"] &': { display: 'none' } }
  }),
  tabs: css({
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    margin: '-16px -16px 16px',
    borderBottom: '1px solid {colors.panel.line}',
    background: 'paper',
    '& [data-part="trigger"]': {
      minHeight: '42px',
      border: '0',
      borderRadius: '0',
      background: 'transparent',
      fontSize: '15px',
      '&[data-selected]': { boxShadow: 'inset 0 -3px 0 {colors.ink}' }
    }
  }),
  count: css({ display: 'inline-block', minWidth: '20px', marginLeft: '4px', padding: '0 5px', borderRadius: '10px', background: 'panel', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }),
  mat: css({
    position: 'relative',
    minHeight: '0',
    overflow: 'auto',
    padding: '0 36px 96px',
    background: 'mat',
    '&[data-panning], &[data-panning] *': { cursor: 'grab' },
    '@media (max-width: 900px)': {
      gridArea: '1 / 1',
      padding: '0 28px 72px',
      '.app[data-panel="blocks"] &, .app[data-panel="edit"] &': { display: 'none' }
    }
  }),
  readout: css({ position: 'sticky', left: '8px', bottom: '8px', zIndex: '5', display: 'inline-block', marginTop: '8px', padding: '2px 8px', borderRadius: 'sm', background: 'ink', color: 'paper', fontSize: '12px', fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }),
  empty: css({ position: 'absolute', top: '120px', left: '50%', width: 'min(300px, 80%)', transform: 'translateX(-50%)', color: 'ink.soft', textAlign: 'center' }),
  mobile: css({
    display: 'none',
    '@media (max-width: 900px)': {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      borderTop: '1px solid {colors.panel.line}',
      background: 'paper',
      '& button': { minHeight: '48px', border: '0', borderRadius: '0', background: 'transparent', '&[aria-pressed="true"]': { boxShadow: 'inset 0 -3px 0 {colors.accent}' } }
    }
  }),
  toast: css({
    position: 'fixed',
    right: '344px',
    bottom: '16px',
    zIndex: '20',
    maxWidth: '360px',
    padding: '10px 16px',
    border: '2px solid {colors.ink}',
    borderRadius: 'md',
    background: 'paper',
    fontFamily: 'ui',
    fontWeight: '600',
    fontSize: '13px',
    _empty: { display: 'none' },
    '&[data-error]': { borderColor: 'danger', color: 'danger' },
    '@media (max-width: 900px)': { left: '16px', right: '16px', bottom: '64px', maxWidth: 'none' }
  })
};
