import { defineConfig } from '@pandacss/dev';
import { semanticColors } from './src/theme/semantic-tokens';
import { conditions } from './src/theme/conditions';
import { globalCss } from './src/theme/global-css';
import { recipes, slotRecipes } from './src/theme/recipes';

export default defineConfig({
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
  preflight: false,
  minify: process.env.NODE_ENV === 'production',
  hash: process.env.PANDA_HASH === '1',
  optimize: { removeUnusedTokens: true, removeUnusedKeyframes: true, smartCompoundVariants: true },
  jsxFramework: 'react',
  jsxStyleProps: 'all',
  include: ['./src/**/*.{ts,tsx}'],
  outdir: 'styled-system',
  importMap: 'styled-system',
  staticCss: {
    recipes: { button: ['*'], input: ['*'], dialog: ['*'], segmentGroup: ['*'], select: ['*'], checkbox: ['*'], slider: ['*'] }
  },
  globalCss,
  conditions,
  theme: {
    extend: {
      recipes,
      slotRecipes,
      tokens: {
        fonts: {
          sans: { value: "'IBM Plex Sans JP', system-ui, sans-serif" },
          body: { value: "'IBM Plex Sans JP', system-ui, sans-serif" },
          ui: { value: "'Bricolage Grotesque', 'IBM Plex Sans JP', system-ui, sans-serif" }
        },
        fontSizes: {
          xs: { value: '12px' },
          sm: { value: '13px' },
          md: { value: '14px' },
          xl: { value: '20px' }
        },
        lineHeights: { tight: { value: '1.25' }, body: { value: '1.45' } },
        radii: { sm: { value: '4px' }, md: { value: '8px' } },
        zIndex: { modal: { value: 30 }, dropdown: { value: 40 } },
        shadows: {
          md: { value: '0 8px 24px rgba(25, 26, 25, 0.18)' },
          lg: { value: '0 24px 64px rgba(25, 26, 25, 0.24)' }
        }
      },
      semanticTokens: { colors: semanticColors }
    }
  }
});
