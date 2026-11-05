import { css } from '../../styled-system/css';

export const paletteStyles = {
  blocks: css({
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px',
    margin: '0',
    padding: '0',
    listStyle: 'none',
    '@media (max-width: 900px)': { gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }
  }),
  block: css({ display: 'grid', justifyItems: 'start', gap: '2px', width: '100%', minHeight: '64px', padding: '8px', border: '1px solid {colors.panel.line}', borderRadius: 'sm', background: 'paper', fontSize: '14px', fontWeight: '600', lineHeight: '1.45', textAlign: 'left', cursor: 'grab', _active: { cursor: 'grabbing' } }),
  glyph: css({ fontFamily: "'DotGothic16', 'IBM Plex Sans JP', system-ui, sans-serif", fontSize: '20px', lineHeight: '1' }),
  subtitle: css({ marginTop: '20px' }),
  sections: css({ display: 'grid', gap: '8px', margin: '0', padding: '0', listStyle: 'none' }),
  section: css({ display: 'grid', gap: '6px', width: '100%', padding: '8px', border: '1px solid {colors.panel.line}', borderRadius: 'sm', background: 'paper', fontSize: '14px', fontWeight: '600', lineHeight: '1.45', textAlign: 'left' }),
  sectionHead: css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }),
  sectionAdd: css({ padding: '1px 8px', borderRadius: 'sm', background: 'ink', color: 'paper', fontSize: '12px' }),
  preview: css({ display: 'block', maxHeight: '120px', overflow: 'hidden', background: 'paper', boxShadow: 'inset 0 0 0 1px {colors.panel.line}' }),
  image: css({ display: 'block', width: '100%', imageRendering: 'auto' }),
  loading: css({ color: 'ink.soft', fontSize: '13px' })
};
