import { css } from '../../styled-system/css';

export const inspectorStyles = {
  fontList: css({ maxHeight: '280px', overflowY: 'auto', borderWidth: '1px', borderStyle: 'solid', borderColor: 'panel.line', borderRadius: 'sm', background: 'paper' }),
  fontCategory: css({ position: 'sticky', top: '0', display: 'block', padding: '4px 8px', background: 'panel', color: 'ink.soft', fontFamily: 'ui', fontSize: '12px', fontWeight: '700' }),
  fontOption: css({ display: 'flex', justifyContent: 'space-between', gap: '8px', width: '100%', border: '0', borderRadius: '0', background: 'transparent', fontWeight: '400', textAlign: 'left', '&[aria-pressed=true]': { background: 'ink', color: 'paper' } }),
  fontSample: css({ flex: 'none', fontSize: '17px' }),
  tokenList: css({ display: 'grid', gap: '4px', margin: '8px 0 0', padding: '0', listStyle: 'none' }),
  tokenRow: css({ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }),
  token: css({ minHeight: '26px', padding: '2px 6px', fontFamily: "'VT323', monospace", fontSize: '16px', fontWeight: '400' }),
  crop: css({ display: 'grid', gap: '8px' }),
  pressed: css({ '&[aria-pressed=true]': { borderColor: 'ink', background: 'ink', color: 'paper' } }),
  dither: css({ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }),
  ditherTile: css({ display: 'grid', gap: '4px', padding: '4px', fontSize: '12px', '&[aria-pressed=true]': { borderColor: 'ink', background: 'ink', color: 'paper' } }),
  ditherImage: css({ display: 'block', width: '100%', aspectRatio: '1', background: 'panel', imageRendering: 'pixelated' }),
  issues: css({ display: 'grid', gap: '6px', margin: '0', padding: '0', listStyle: 'none' }),
  issue: css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', color: 'danger', fontSize: '13px' }),
  issueButton: css({ flex: 'none', minHeight: '26px', padding: '2px 8px', fontSize: '12px' }),
  shortcuts: css({ margin: '0', paddingLeft: '18px', color: 'ink.soft', fontSize: '13px' })
};
