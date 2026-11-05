import { css } from '../../styled-system/css';

export const menuStyles = {
  trigger: css({ gap: '6px', whiteSpace: 'nowrap' }),
  positioner: css({ zIndex: 'dropdown' }),
  content: css({ display: 'grid', minWidth: '220px', maxWidth: 'calc(100vw - 24px)', padding: '4px', border: '1px solid {colors.ink}', borderRadius: 'md', background: 'paper', boxShadow: 'lg', outline: 'none' }),
  separator: css({ margin: '4px 0', borderTop: '1px solid {colors.panel.line}' }),
  item: css({ display: 'flex', alignItems: 'start', gap: '6px', minHeight: '36px', padding: '6px 8px', borderRadius: 'sm', cursor: 'pointer', '&[data-highlighted]': { background: 'panel', outline: 'none' }, '&[data-disabled]': { opacity: '.45', cursor: 'not-allowed' }, '@media (max-width: 900px)': { minHeight: '44px' } }),
  check: css({ flex: 'none', width: '14px' }),
  hint: css({ display: 'block', color: 'ink.soft', fontSize: '12px' })
};
