import { css } from '../../styled-system/css';

export const appPanelStyles = {
  app: css({ display: 'grid', gap: '10px', marginBottom: '16px', paddingBottom: '16px', borderBottomWidth: '2px', borderBottomStyle: 'solid', borderBottomColor: 'ink', '@media (max-width: 900px)': { '& button, & input:not([type=checkbox]):not([type=radio]), & summary': { minHeight: '44px' }, '& summary': { paddingBlock: '12px' } } }),
  appFields: css({ display: 'grid', gap: '12px' }),
  appField: css({ position: 'relative', '&[data-missing=true] input, &[data-missing=true] textarea': { borderColor: 'danger' }, '@media (max-width: 900px)': { display: 'grid', gap: '4px' } }),
  blankToggle: css({ position: 'absolute', top: '-4px', right: '0', minHeight: '24px', padding: '0 6px', border: '0', background: 'none', color: 'ink.soft', fontFamily: 'body', fontSize: '12px', fontWeight: '400', textDecoration: 'underline', '&[aria-pressed=true]': { color: 'ink', fontWeight: '600' }, '@media (max-width: 900px)': { position: 'static', justifySelf: 'start' } }),
  blankNote: css({ margin: '0', padding: '8px', borderWidth: '1px', borderStyle: 'dashed', borderColor: 'ink.soft', borderRadius: 'sm', color: 'ink.soft', fontSize: '13px' }),
  passwordRow: css({ display: 'flex', gap: '6px', '& > input': { flex: '1', minWidth: '0' } }),
  placeholder: css({ display: 'grid', gap: '6px', padding: '10px', borderWidth: '1px', borderStyle: 'dashed', borderColor: 'ink.soft', borderRadius: 'sm' }),
  placeholderText: css({ margin: '0', fontSize: '13px', wordBreak: 'break-word' }),
  editorRow: css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', padding: '8px 0', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'panel.line' }),
  editorCode: css({ gridColumn: '1 / -1', fontSize: '12px' }),
  appImport: css({ display: 'grid', gap: '8px', padding: '10px', borderWidth: '1px', borderStyle: 'solid', borderColor: 'panel.line', borderRadius: 'sm', background: 'paper' }),
  appList: css({ display: 'grid', gap: '6px', minWidth: '0', margin: '0', padding: '0', border: '0' }),
  appListRow: css({ display: 'grid', gap: '4px', alignItems: 'center' }),
  appListLabel: css({ color: 'ink.soft', fontSize: '12px' }),
  appListInput: css({ minWidth: '0', padding: '4px 6px' }),
  appActions: css({ display: 'flex', gap: '2px' }),
  appAction: css({ minWidth: '28px', padding: '2px 6px' })
};
