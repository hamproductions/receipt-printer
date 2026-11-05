import { Checkbox, useCheckboxContext } from '@ark-ui/react/checkbox';
import { forwardRef } from 'react';
import { createSlotRecipeContext, styled } from 'styled-system/jsx';
import { checkbox } from 'styled-system/recipes';
import type { HTMLStyledProps } from 'styled-system/types';

const { withProvider, withContext } = createSlotRecipeContext(checkbox);

export const Root = withProvider(Checkbox.Root, 'root');
export const Control = withContext(Checkbox.Control, 'control');
export const Label = withContext(Checkbox.Label, 'label');
export const HiddenInput = Checkbox.HiddenInput;

export const Indicator = forwardRef<SVGSVGElement, HTMLStyledProps<'svg'>>(function Indicator(props, ref) {
  const { indeterminate, checked } = useCheckboxContext();

  return (
    <Checkbox.Indicator indeterminate={indeterminate} asChild>
      <styled.svg ref={ref} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3px" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        {indeterminate ? <path d="M5 12h14" /> : checked ? <path d="M20 6 9 17l-5-5" /> : null}
      </styled.svg>
    </Checkbox.Indicator>
  );
});
