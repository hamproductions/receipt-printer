import { css } from '../../styled-system/css';

export const layerStyles = {
  tree: css({ display: 'grid', gap: '1px', margin: '0', padding: '0', listStyle: 'none', '& > li': { minWidth: '0' } }),
  children: css({ display: 'grid', gap: '1px', margin: '1px 0 4px 14px', padding: '0 0 0 6px', listStyle: 'none', borderLeft: '1px solid {colors.panel.line}', '& > li': { minWidth: '0' } }),
  block: css({
    minWidth: '0',
    '&[data-drop-before]': { boxShadow: 'inset 0 2px 0 {colors.accent}' },
    '&[data-drop-after]': { boxShadow: 'inset 0 -2px 0 {colors.accent}' }
  }),
  row: css({
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    minHeight: '34px',
    paddingRight: '2px',
    borderRadius: 'sm',
    _hover: { background: 'rgba(25, 26, 25, 0.06)' },
    '&[data-selected]': { background: 'paper', boxShadow: 'inset 0 0 0 1.5px {colors.ink}' },
    '&[data-hidden] [data-part="layer-main"]': { opacity: '0.45', textDecoration: 'line-through' },
    '&[draggable="true"]': { cursor: 'grab' },
    '&[data-selected] [data-part="layer-main"]': { fontWeight: '600' },
    '&:is(:hover, :focus-within, [data-selected]) [data-part="layer-tools"] [data-part="layer-tool"]': { display: 'grid' },
    '&:is(:hover, :focus-within, [data-selected]) [data-part="layer-order"]': { display: 'flex' },
    '@media (hover: none)': {
      '& [data-part="layer-tools"] [data-part="layer-tool"]': { display: 'grid' },
      '& [data-part="layer-order"]': { display: 'flex' }
    }
  }),
  twisty: css({ display: 'grid', flex: 'none', placeItems: 'center', width: '20px', minHeight: '28px', padding: '0', border: '0', background: 'none' }),
  main: css({
    display: 'flex',
    flex: '1',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '8px',
    minWidth: '0',
    minHeight: '30px',
    padding: '2px 4px',
    border: '0',
    background: 'none',
    fontFamily: 'body',
    fontWeight: '400',
    boxShadow: 'none',
    textAlign: 'left',
    '& svg': { flex: 'none' }
  }),
  count: css({ flex: 'none', padding: '0 6px', borderRadius: '10px', background: 'panel', color: 'ink.soft', fontSize: '11px' }),
  problem: css({ flex: 'none', width: '8px', height: '8px', borderRadius: '50%', background: 'danger' }),
  tools: css({ display: 'flex', flex: 'none', '& [data-part="layer-tool"]:not([aria-pressed="true"])': { display: 'none' } }),
  order: css({ display: 'none', flex: 'none' }),
  tool: css({
    display: 'grid',
    placeItems: 'center',
    width: '24px',
    minHeight: '26px',
    padding: '0',
    border: '0',
    background: 'none',
    color: 'ink.soft',
    boxShadow: 'none',
    '&[aria-pressed="true"]': { color: 'ink' }
  }),
  rename: css({ flex: '1', minWidth: '0', minHeight: '26px', padding: '2px 6px' }),
  name: css({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
};
