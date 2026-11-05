import type { ReactNode } from 'react';
import { Menu as ArkMenu } from '@ark-ui/react/menu';
import { Portal } from '@ark-ui/react/portal';
import { Button } from './ui/button';
import { menuStyles as styles } from './menu.styles';

export type MenuItem = { label: string; hint?: string; checked?: boolean; disabled?: boolean; onSelect: () => void } | 'divider';

export function Menu({ label, title, items }: { label: ReactNode; title: string; items: MenuItem[] }) {
  return (
    <ArkMenu.Root
      lazyMount
      unmountOnExit
      positioning={{ placement: 'bottom-start', gutter: 4 }}
      onSelect={({ value }) => {
        const item = items[Number(value)];
        if (item && item !== 'divider' && !item.disabled) {
          item.onSelect();
        }
      }}
    >
      <ArkMenu.Trigger asChild>
        <Button type="button" title={title} className={styles.trigger}>
          {label}
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1.5 3.5L5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </Button>
      </ArkMenu.Trigger>
      <Portal>
        <ArkMenu.Positioner className={styles.positioner}>
          <ArkMenu.Content className={styles.content}>
            {items.map((item, index) => {
              if (item === 'divider') {
                return <ArkMenu.Separator key={index} className={styles.separator} />;
              }
              const content = (
                <>
                  <span className={styles.check} aria-hidden="true">{item.checked ? '✓' : ''}</span>
                  <span>{item.label}{item.hint && <small className={styles.hint}>{item.hint}</small>}</span>
                </>
              );
              return item.checked === undefined ? (
                <ArkMenu.Item key={item.label} value={String(index)} disabled={item.disabled} className={styles.item}>{content}</ArkMenu.Item>
              ) : (
                <ArkMenu.CheckboxItem key={item.label} value={String(index)} checked={item.checked} disabled={item.disabled} className={styles.item}>{content}</ArkMenu.CheckboxItem>
              );
            })}
          </ArkMenu.Content>
        </ArkMenu.Positioner>
      </Portal>
    </ArkMenu.Root>
  );
}
