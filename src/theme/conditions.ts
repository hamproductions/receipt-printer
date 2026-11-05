export const conditions = {
  extend: {
    invalid: '&:is(:user-invalid, [data-invalid], [aria-invalid=true])',
    hover: '&:not(:disabled):hover',
    active: '&:not(:disabled):active',
    checked: '&:is(:checked, [data-checked], [data-state=checked], [aria-checked=true], [data-state=indeterminate])'
  }
} as const;
