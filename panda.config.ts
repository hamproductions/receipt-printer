import { defineConfig } from '@pandacss/dev';
import { createPreset } from '@park-ui/panda-preset';
import pink from '@park-ui/panda-preset/colors/pink';
import mauve from '@park-ui/panda-preset/colors/mauve';
import { theme } from './src/theme';

export default defineConfig({
  preflight: true,
  hash: { className: true, cssVar: true },
  presets: [
    '@pandacss/preset-base',
    createPreset({ accentColor: pink, grayColor: mauve, radius: 'lg' })
  ],
  include: ['./src/**/*.{js,jsx,ts,tsx}'],
  exclude: [],
  staticCss: {
    css: [
      {
        properties: {
          fontWeight: ['bold'],
          fontSize: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl']
        }
      }
    ]
  },
  theme: { extend: theme },
  jsxFramework: 'react',
  outdir: './styled-system',
  importMap: {
    css: 'styled-system/css',
    recipes: 'styled-system/recipes',
    patterns: 'styled-system/patterns',
    jsx: 'styled-system/jsx'
  }
});
