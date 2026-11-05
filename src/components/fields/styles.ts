import { css } from '../../../styled-system/css';

export const fieldStyles = {
  field: css({ display: 'grid', gap: '4px', minWidth: '0', margin: '0', padding: '0', border: '0' }),
  label: css({ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '0', color: 'ink.soft', fontSize: '13px' }),
  error: css({ margin: '0', color: 'danger', fontSize: '13px' }),
  output: css({ color: 'ink', fontVariantNumeric: 'tabular-nums' }),
  textarea: css({ width: '100%', minHeight: '34px', padding: '6px 8px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'panel.line', borderRadius: 'sm', background: 'paper', font: 'inherit', color: 'inherit', resize: 'vertical' })
};
