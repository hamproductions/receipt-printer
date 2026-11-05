import { Dialog } from '@ark-ui/react/dialog';
import { createSlotRecipeContext } from 'styled-system/jsx';
import { dialog } from 'styled-system/recipes';

const { withRootProvider, withContext } = createSlotRecipeContext(dialog);

export const Root = withRootProvider(Dialog.Root, {
  defaultProps: { unmountOnExit: true, lazyMount: true }
});
export const Backdrop = withContext(Dialog.Backdrop, 'backdrop');
export const CloseTrigger = withContext(Dialog.CloseTrigger, 'closeTrigger');
export const Content = withContext(Dialog.Content, 'content');
export const Positioner = withContext(Dialog.Positioner, 'positioner');
export const Title = withContext(Dialog.Title, 'title');
