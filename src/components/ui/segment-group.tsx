import { SegmentGroup } from '@ark-ui/react/segment-group';
import type { ReactNode } from 'react';
import { createSlotRecipeContext } from 'styled-system/jsx';
import { segmentGroup } from 'styled-system/recipes';

const { withProvider, withContext } = createSlotRecipeContext(segmentGroup);

export const Root = withProvider(SegmentGroup.Root, 'root');
const Item = withContext(SegmentGroup.Item, 'item');
const ItemText = withContext(SegmentGroup.ItemText, 'itemText');

type Option = { value: string; label: ReactNode; disabled?: boolean };

export function Items({ items }: { items: Option[] }) {
  return items.map((item) => (
    <Item key={item.value} value={item.value} disabled={item.disabled}>
      <ItemText>{item.label}</ItemText>
      <SegmentGroup.ItemHiddenInput />
    </Item>
  ));
}
