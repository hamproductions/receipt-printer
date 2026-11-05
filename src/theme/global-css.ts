export const globalCss = {
  extend: {
    '*': {
      '--global-color-border': 'colors.panel.line',
      '--global-color-placeholder': 'colors.ink.soft',
      '--global-color-focus-ring': 'colors.focus'
    },
    html: {
      colorScheme: 'light',
      WebkitTapHighlightColor: 'transparent',
      fontFamily: 'sans',
      fontSize: 'md',
      lineHeight: 'body'
    },
    'html, body, #root': { margin: '0', height: '100%', background: 'panel', color: 'ink' },
    '*, *::before, *::after': { boxSizing: 'border-box' },
    'button, input, select, textarea': { font: 'inherit', color: 'inherit' },
    button: { cursor: 'pointer' },
    'button:disabled, input:disabled, select:disabled, textarea:disabled': { cursor: 'not-allowed' },
    textarea: { resize: 'vertical' },
    ':focus-visible': { outline: '2px solid {colors.focus}', outlineOffset: '2px' },
    kbd: { padding: '0 4px', border: '1px solid {colors.panel.line}', borderRadius: 'sm', fontFamily: 'inherit', fontSize: 'xs' },
    "[hidden]:where(:not([hidden='until-found']))": { display: 'none' }
  }
};
