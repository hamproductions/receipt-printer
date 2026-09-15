import { forwardRef } from 'react';
import { styled } from 'styled-system/jsx';
import { Spinner as StyledSpinner, type SpinnerProps as StyledSpinnerProps } from './styled/spinner';

export interface SpinnerProps extends StyledSpinnerProps {
  label?: string;
}

export const Spinner = forwardRef<HTMLDivElement, SpinnerProps>((props, ref) => {
  const { label = 'Loading...', ...rest } = props;
  return (
    <StyledSpinner ref={ref} borderLeftColor="transparent" borderBottomColor="transparent" {...rest}>
      {label && <styled.span srOnly>{label}</styled.span>}
    </StyledSpinner>
  );
});

Spinner.displayName = 'Spinner';
