import { defineRecipe } from '@pandacss/dev';

export const input = defineRecipe({
  className: 'input',
  jsx: ['Input'],
  base: {
    width: '100%',
    minWidth: '0',
    minHeight: '34px',
    padding: '6px 8px',
    border: '1px solid {colors.panel.line}',
    borderRadius: 'sm',
    background: 'paper',
    color: 'ink',
    font: 'inherit',
    _placeholder: { color: 'ink.soft' },
    _disabled: { opacity: '0.45', cursor: 'not-allowed' },
    _invalid: { borderColor: 'danger' },
    _focusVisible: { outline: '2px solid {colors.focus}', outlineOffset: '2px' }
  }
});
