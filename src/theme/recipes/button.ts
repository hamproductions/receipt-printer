import { defineRecipe } from '@pandacss/dev';

export const button = defineRecipe({
  className: 'button',
  jsx: ['Button'],
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2',
    minHeight: '32px',
    padding: '4px 12px',
    border: '1px solid {colors.panel.line}',
    borderRadius: 'sm',
    background: 'paper',
    color: 'ink',
    fontFamily: 'ui',
    fontSize: 'md',
    fontWeight: '600',
    lineHeight: 'tight',
    cursor: 'pointer',
    userSelect: 'none',
    _hover: { borderColor: 'ink.soft' },
    _disabled: { cursor: 'not-allowed', opacity: '0.45' },
    _focusVisible: { outline: '2px solid {colors.focus}', outlineOffset: '2px' },
    '@media (pointer: coarse)': { minHeight: '44px' }
  }
});
