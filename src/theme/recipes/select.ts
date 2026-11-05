import { defineSlotRecipe } from '@pandacss/dev';

export const select = defineSlotRecipe({
  className: 'select',
  slots: ['root', 'content', 'control', 'item', 'itemText', 'label', 'positioner', 'trigger', 'valueText', 'indicator', 'itemIndicator'],
  base: {
    root: { display: 'flex', flexDirection: 'column', gap: '1', width: '100%', minWidth: '0' },
    label: { color: 'ink.soft', fontSize: 'sm' },
    control: { minWidth: '0' },
    trigger: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '2',
      width: '100%',
      minWidth: '0',
      minHeight: '34px',
      padding: '6px 8px',
      border: '1px solid {colors.panel.line}',
      borderRadius: 'sm',
      background: 'paper',
      color: 'ink',
      textAlign: 'start',
      cursor: 'pointer',
      _hover: { borderColor: 'ink.soft' },
      _disabled: { opacity: '0.45', cursor: 'not-allowed' },
      _focusVisible: { outline: '2px solid {colors.focus}', outlineOffset: '2px' },
      '@media (pointer: coarse)': { minHeight: '44px' }
    },
    valueText: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    indicator: { display: 'flex', flexShrink: '0', alignItems: 'center', color: 'ink.soft' },
    positioner: { zIndex: 'dropdown' },
    content: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5',
      minWidth: 'var(--reference-width)',
      maxWidth: 'var(--available-width)',
      maxHeight: 'min(var(--available-height), 384px)',
      overflowY: 'auto',
      padding: '1',
      border: '1px solid {colors.ink}',
      borderRadius: 'md',
      background: 'paper',
      color: 'ink',
      fontFamily: 'sans',
      fontSize: 'sm',
      boxShadow: 'md',
      outline: '0'
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '2',
      minHeight: '32px',
      padding: '4px 8px',
      borderRadius: 'sm',
      cursor: 'pointer',
      _highlighted: { background: 'panel' },
      _disabled: { opacity: '0.45', cursor: 'not-allowed' },
      '@media (pointer: coarse)': { minHeight: '44px' }
    },
    itemText: {},
    itemIndicator: { display: 'flex', color: 'ink' }
  }
});
