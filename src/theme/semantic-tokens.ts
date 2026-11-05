import { defineSemanticTokens } from '@pandacss/dev';

export const semanticColors = defineSemanticTokens.colors({
  mat: {
    DEFAULT: { value: '#2d5546' },
    deep: { value: '#23463a' },
    line: { value: '#8cc2ab' },
    label: { value: '#a9dbc4' }
  },
  paper: { value: '#fbfcf8' },
  ink: {
    DEFAULT: { value: '#191a19' },
    soft: { value: '#4a514d' }
  },
  panel: {
    DEFAULT: { value: '#e8ede8' },
    line: { value: '#c9d3cc' }
  },
  accent: { value: '#ff4f86' },
  danger: { value: '#a3122f' },
  focus: { value: '{colors.ink}' },
  scrim: { value: 'rgba(25, 26, 25, 0.4)' }
});
