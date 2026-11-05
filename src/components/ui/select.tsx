import type { Assign, SelectRootProps } from '@ark-ui/react';
import { Select } from '@ark-ui/react/select';
import type { RefAttributes } from 'react';
import { createSlotRecipeContext } from 'styled-system/jsx';
import { select } from 'styled-system/recipes';
import type { HTMLStyledProps } from 'styled-system/types';

const { withProvider, withContext } = createSlotRecipeContext(select);

type StyleProps = HTMLStyledProps<'div'>;
export type RootProps<T> = Assign<SelectRootProps<T>, StyleProps> & RefAttributes<HTMLDivElement>;

export const Root = withProvider(Select.Root, 'root') as Select.RootComponent<StyleProps>;
export const Content = withContext(Select.Content, 'content');
export const Control = withContext(Select.Control, 'control');
export const Item = withContext(Select.Item, 'item');
export const ItemText = withContext(Select.ItemText, 'itemText');
export const Label = withContext(Select.Label, 'label');
export const Positioner = withContext(Select.Positioner, 'positioner');
export const Trigger = withContext(Select.Trigger, 'trigger');
export const ValueText = withContext(Select.ValueText, 'valueText');
export const Indicator = withContext(Select.Indicator, 'indicator', {
  defaultProps: {
    children: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
  }
});
export const ItemIndicator = withContext(Select.ItemIndicator, 'itemIndicator', {
  defaultProps: {
    children: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
  }
});
export const HiddenSelect = Select.HiddenSelect;
