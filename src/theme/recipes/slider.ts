import { defineSlotRecipe } from '@pandacss/dev';

export const slider = defineSlotRecipe({
  className: 'slider',
  slots: ['root', 'label', 'control', 'track', 'range', 'thumb'],
  base: {
    root: { display: 'flex', flexDirection: 'column', gap: '1', width: '100%', position: 'relative', touchAction: 'none' },
    label: { color: 'ink.soft', fontSize: 'sm' },
    control: { position: 'relative', display: 'flex', alignItems: 'center', width: '100%', minHeight: '24px' },
    track: { height: '6px', overflow: 'hidden', flex: '1', borderRadius: 'full', background: 'panel.line' },
    range: { height: 'inherit', background: 'ink' },
    thumb: {
      top: '50%',
      translate: '0 -50%',
      width: '20px',
      height: '20px',
      border: '2px solid {colors.ink}',
      borderRadius: 'full',
      background: 'paper',
      cursor: 'grab',
      _focusVisible: { outline: '2px solid {colors.focus}', outlineOffset: '2px' }
    }
  }
});
