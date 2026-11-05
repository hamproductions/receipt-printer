import { defineSlotRecipe } from '@pandacss/dev';

export const dialog = defineSlotRecipe({
  className: 'dialog',
  slots: ['backdrop', 'positioner', 'content', 'title', 'closeTrigger'],
  base: {
    backdrop: { position: 'fixed', inset: '0', background: 'scrim', zIndex: 'modal' },
    positioner: {
      position: 'fixed',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4',
      overscrollBehaviorY: 'none',
      zIndex: 'modal'
    },
    content: {
      position: 'relative',
      width: 'min(480px, 100%)',
      maxHeight: '100%',
      overflowY: 'auto',
      padding: '5',
      border: '2px solid {colors.ink}',
      borderRadius: 'md',
      background: 'panel',
      color: 'ink',
      boxShadow: 'lg',
      outline: '0'
    },
    title: { margin: '0', fontFamily: 'ui', fontSize: 'xl', fontWeight: '800', lineHeight: 'tight' },
    closeTrigger: {}
  }
});
