import { defineSlotRecipe } from '@pandacss/dev';

export const segmentGroup = defineSlotRecipe({
  className: 'segment-group',
  slots: ['root', 'item', 'itemText'],
  base: {
    root: { display: 'flex', flexWrap: 'wrap', gap: '1' },
    item: {
      display: 'inline-flex',
      flex: '1 1 auto',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '32px',
      padding: '4px 8px',
      border: '1px solid {colors.panel.line}',
      borderRadius: 'sm',
      background: 'paper',
      color: 'ink',
      fontSize: 'sm',
      cursor: 'pointer',
      userSelect: 'none',
      _hover: { borderColor: 'ink.soft' },
      _checked: { borderColor: 'ink', background: 'ink', color: 'paper' },
      _disabled: { opacity: '0.45', cursor: 'not-allowed' },
      '&:has(input:focus-visible)': { outline: '2px solid {colors.focus}', outlineOffset: '2px' },
      '@media (pointer: coarse)': { minHeight: '44px' }
    },
    itemText: {}
  }
});
