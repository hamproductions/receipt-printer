import { Slider } from '@ark-ui/react/slider';
import { createSlotRecipeContext } from 'styled-system/jsx';
import { slider } from 'styled-system/recipes';

const { withProvider, withContext } = createSlotRecipeContext(slider);

export const Root = withProvider(Slider.Root, 'root');
export const Control = withContext(Slider.Control, 'control');
export const Label = withContext(Slider.Label, 'label');
export const Range = withContext(Slider.Range, 'range');
export const Thumb = withContext(Slider.Thumb, 'thumb');
export const Track = withContext(Slider.Track, 'track');
export const HiddenInput = Slider.HiddenInput;
