import { css } from '../../styled-system/css';

export const toolbarStyles = {
  root: css({
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: '12px',
    minHeight: '56px',
    padding: '8px 16px',
    borderBottom: '1px solid {colors.panel.line}',
    background: 'paper',
    '@media (max-width: 900px)': { gap: '8px', padding: '6px 12px' }
  }),
  brand: css({ display: 'flex', flex: '0 1 auto', alignItems: 'baseline', gap: '12px', minWidth: '0' }),
  wordmark: css({
    fontFamily: 'ui',
    fontSize: '26px',
    fontWeight: '800',
    fontVariationSettings: "'opsz' 96",
    letterSpacing: '-0.04em',
    '@media (max-width: 900px)': { fontSize: '21px' }
  }),
  name: css({
    maxWidth: '260px',
    overflow: 'hidden',
    color: 'ink.soft',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    '@media (max-width: 1100px)': { display: 'none' }
  }),
  actions: css({
    display: 'flex',
    flex: '1 1 auto',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: '6px',
    minWidth: '0',
    '@media (max-width: 900px)': { display: 'none' }
  }),
  compact: css({
    display: 'none',
    '@media (max-width: 900px)': { display: 'flex', flex: '1 1 auto', minWidth: '0', '& > button': { minHeight: '44px' } }
  }),
  printCluster: css({ display: 'flex', flex: 'none', alignItems: 'center', gap: '8px', '@media (max-width: 900px)': { marginLeft: 'auto' } }),
  state: css({
    display: 'block',
    maxWidth: '220px',
    overflow: 'hidden',
    color: 'ink.soft',
    fontSize: '13px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    '&[data-warning]': { color: 'danger', fontWeight: '600' },
    '@media (max-width: 1100px)': { display: 'none' }
  }),
  printer: css({
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    maxWidth: '220px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    '@media (max-width: 900px)': { width: '44px', minHeight: '44px', padding: '0', justifyContent: 'center' }
  }),
  printerLabel: css({ '@media (max-width: 900px)': { display: 'none' } }),
  printerIcon: css({ display: 'none', '@media (max-width: 900px)': { display: 'block' } }),
  led: css({
    flex: 'none', width: '9px', height: '9px', borderRadius: '50%', background: '#b9c2bc',
    '&[data-connected]': { background: '#1f9d57' },
    '@media (max-width: 900px)': { position: 'absolute', top: '5px', right: '5px', width: '6px', height: '6px' }
  }),
  print: css({
    minWidth: '96px',
    minHeight: '40px',
    border: '2px solid {colors.ink}',
    borderRadius: 'md',
    background: 'accent',
    color: 'ink',
    fontSize: '16px',
    fontWeight: '800',
    _hover: { background: 'accent', borderColor: 'ink' },
    '@media (max-width: 900px)': { minWidth: '66px', minHeight: '44px', padding: '4px 8px' }
  })
};
