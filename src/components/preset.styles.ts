import { css } from '../../styled-system/css';

export const presetStyles = {
  search: css({ display: 'grid', gap: '4px', maxWidth: '360px', marginBottom: '16px' }),
  grid: css({ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '16px 12px', margin: '0', padding: '0', listStyle: 'none' }),
  preset: css({ display: 'grid', alignContent: 'start', gap: '4px', width: '100%', height: '100%', padding: '0', borderWidth: '0', background: 'transparent', textAlign: 'left', whiteSpace: 'normal', _hover: { background: 'transparent', '& img': { transform: 'translateY(-6px)' } } }),
  paper: css({ display: 'grid', placeItems: 'start center', height: '210px', overflow: 'hidden', padding: '10px 0 0', borderRadius: 'md', background: 'mat', '& img': { width: '100%', maxHeight: 'none', background: 'paper', imageRendering: 'pixelated', transition: 'transform 180ms ease-out', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } } }),
  loading: css({ color: 'mat.line', fontSize: '13px' }),
  name: css({ fontFamily: 'ui', fontSize: '16px', fontWeight: '700' }),
  hint: css({ display: 'block', color: 'ink.soft', fontSize: '13px', fontWeight: '400' }),
  sub: css({ margin: '24px 0 8px', fontFamily: 'ui', fontSize: '18px', fontWeight: '800', letterSpacing: '-.02em' }),
  printed: css({ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px', margin: '12px 0 0', padding: '0', listStyle: 'none', '& li': { display: 'grid', gap: '2px' } }),
  shelf: css({ display: 'grid', gap: '6px', margin: '12px 0 0', padding: '0', listStyle: 'none', '& li': { display: 'flex', gap: '6px' }, '& li > button:first-child': { display: 'block', flex: '1', height: 'auto', minHeight: '44px', textAlign: 'left', whiteSpace: 'normal' } }),
  remove: css({ justifySelf: 'start', minHeight: '28px', padding: '0', border: '0', background: 'none', color: 'danger', textDecoration: 'underline' })
};
