import type { ReactNode } from 'react';
import { Portal } from '@ark-ui/react/portal';
import { css } from '../../styled-system/css';
import * as Dialog from './ui/dialog';
import { Button } from './ui/button';

export function Modal({ open, onClose, title, wide = false, children }: { open: boolean; onClose: () => void; title: string; wide?: boolean; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={({ open }) => !open && onClose()}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content className={css({ '&[data-wide]': { width: 'min(960px, 100%)' } })} data-wide={wide || undefined}>
            <div className={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' })}>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.CloseTrigger asChild><Button type="button">Close</Button></Dialog.CloseTrigger>
            </div>
            {children}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
