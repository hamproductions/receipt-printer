import { css } from '../../styled-system/css';

export const panelStyles = {
  body: css({ display: 'grid', gap: '8px' }),
  heading: css({ margin: '0 0 4px', fontFamily: 'ui', fontSize: '20px', fontWeight: '800', letterSpacing: '-0.02em' }),
  note: css({ margin: '4px 0 12px', color: 'ink.soft', fontSize: '13px' }),
  row: css({ display: 'flex', flexWrap: 'wrap', gap: '6px' }),
  group: css({ display: 'grid', gap: '10px', padding: '12px 0', borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'panel.line' }),
  groupHeading: css({ margin: '0', fontFamily: 'ui', fontSize: '15px', fontWeight: '700' }),
  danger: css({ color: 'danger' }),
  grid: css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }),
  link: css({ justifySelf: 'start', minHeight: '28px', padding: '0', border: '0', background: 'none', textDecoration: 'underline' }),
  details: css({ '& > summary': { cursor: 'pointer', fontFamily: 'ui', fontWeight: '600' } })
};
