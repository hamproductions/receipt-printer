import { createListCollection } from '@ark-ui/react/select';
import { Portal } from '@ark-ui/react/portal';
import { Input } from '../ui/input';
import * as Checkbox from '../ui/checkbox';
import * as Slider from '../ui/slider';
import * as SelectControl from '../ui/select';
import * as SegmentGroup from '../ui/segment-group';
import { fieldStyles as styles } from './styles';

export type Field<T> = { label: string; value: T; onChange: (value: T) => void };

export function Range({ label, value, onChange, min, max, step = 1, unit = '' }: Field<number> & { min: number; max: number; step?: number; unit?: string }) {
  return (
    <Slider.Root min={min} max={max} step={step} value={[value]} onValueChange={(details) => onChange(details.value[0])}>
      <Slider.Label className={styles.label}>
        {label}
        <output className={styles.output}>{value}{unit}</output>
      </Slider.Label>
      <Slider.Control>
        <Slider.Track><Slider.Range /></Slider.Track>
        <Slider.Thumb index={0}><Slider.HiddenInput /></Slider.Thumb>
      </Slider.Control>
    </Slider.Root>
  );
}

export function NumberInput({ label, value, onChange, min, max }: Field<number> & { min?: number; max?: number }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        value={Math.round(value)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) {
            onChange(next);
          }
        }}
      />
    </label>
  );
}

export function Choice<T extends string>({ label, value, onChange, options }: Field<T> & { options: { value: T; label: string }[] }) {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <SegmentGroup.Root aria-label={label} value={value} onValueChange={(details) => details.value !== null && onChange(details.value as T)}>
        <SegmentGroup.Items items={options} />
      </SegmentGroup.Root>
    </div>
  );
}

export function Select<T extends string>({ label, value, onChange, options, disabled = false }: Field<T> & { options: { value: T; label: string }[]; disabled?: boolean }) {
  const collection = createListCollection({ items: options });
  return (
    <SelectControl.Root collection={collection} value={[value]} disabled={disabled} onValueChange={(details) => details.value[0] !== undefined && onChange(details.value[0] as T)} lazyMount unmountOnExit>
      <SelectControl.Label className={styles.label}>{label}</SelectControl.Label>
      <SelectControl.Control>
        <SelectControl.Trigger><SelectControl.ValueText /><SelectControl.Indicator /></SelectControl.Trigger>
      </SelectControl.Control>
      <Portal>
        <SelectControl.Positioner>
          <SelectControl.Content>
            {options.map((option) => (
              <SelectControl.Item key={option.value} item={option}>
                <SelectControl.ItemText>{option.label}</SelectControl.ItemText>
                <SelectControl.ItemIndicator />
              </SelectControl.Item>
            ))}
          </SelectControl.Content>
        </SelectControl.Positioner>
      </Portal>
      <SelectControl.HiddenSelect />
    </SelectControl.Root>
  );
}

export function Toggle({ label, value, onChange, disabled = false }: Field<boolean> & { disabled?: boolean }) {
  return (
    <Checkbox.Root checked={value} disabled={disabled} onCheckedChange={(details) => onChange(details.checked === true)}>
      <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
      <Checkbox.Label>{label}</Checkbox.Label>
      <Checkbox.HiddenInput />
    </Checkbox.Root>
  );
}
