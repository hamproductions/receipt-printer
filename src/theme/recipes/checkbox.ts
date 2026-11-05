import { defineSlotRecipe } from '@pandacss/dev';

export const checkbox = defineSlotRecipe({
  className: 'checkbox',
  slots: ['root', 'control', 'label'],
  base: {
    root: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '2',
      position: 'relative',
      _disabled: { opacity: '0.45', cursor: 'not-allowed' }
    },
    control: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: '0',
      width: '20px',
      height: '20px',
      border: '1px solid {colors.ink.soft}',
      borderRadius: 'sm',
      background: 'paper',
      cursor: 'pointer',
      '& svg': { width: '16px', height: '16px' },
      _checked: { background: 'ink', borderColor: 'ink', color: 'paper' },
      _invalid: { borderColor: 'danger' },
      _focusVisible: { outline: '2px solid {colors.focus}', outlineOffset: '2px' }
    },
    label: { fontSize: 'md', userSelect: 'none' }
  }
});
