import { useState } from 'react';
import type { Transport } from 'escpos-web-print';
import { RadioGroup } from '@ark-ui/react/radio-group';
import { supported, SPEEDS, type Connection, type Speed } from '../printer';
import { Modal } from './Modal';
import { Button } from './ui/button';
import { Toggle } from './fields/controls';
import { css } from '../../styled-system/css';
import { panelStyles } from './panel.styles';

type Props = {
  open: boolean;
  onClose: () => void;
  printer: Transport | null;
  busy: boolean;
  status: { kind: string; message: string };
  speed: Speed;
  onSpeed: (speed: Speed) => void;
  onConnect: (connection: Connection, showAllDevices: boolean) => void;
  onDisconnect: () => void;
  onTest: () => void;
};

const CONNECTIONS: { value: Connection; label: string; detail: string }[] = [
  { value: 'bluetooth', label: 'Bluetooth', detail: 'No pairing needed. Turn the printer on and keep it close.' },
  { value: 'usb', label: 'USB cable', detail: 'For printers that show up as a USB printer.' },
  { value: 'serial', label: 'Serial port', detail: 'Printers paired with this computer, or USB serial adapters.' }
];

export function PrinterDialog({ open, onClose, printer, busy, status, speed, onSpeed, onConnect, onDisconnect, onTest }: Props) {
  const [showAllDevices, setShowAllDevices] = useState(false);

  return (
    <Modal open={open} onClose={onClose} title="Printer">
      {printer ? (
        <>
          <p>Connected to <strong>{printer.deviceName ?? printer.label}</strong>.</p>
          <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '6px' })}>
            <Button onClick={onTest} disabled={busy}>Print a text test page</Button>
            <Button className={css({ color: 'danger' })} onClick={onDisconnect}>Disconnect</Button>
          </div>
        </>
      ) : (
        <>
          <p className={panelStyles.note}>58 mm ESC/POS printers (PT-210 class and similar). Needs desktop or Android Chrome or Edge.</p>
          <ul className={css({ display: 'grid', gap: '8px', margin: '0 0 12px', padding: '0', listStyle: 'none' })}>
            {CONNECTIONS.map((option) => {
              const available = supported(option.value);
              return (
                <li key={option.value}>
                  <Button onClick={() => onConnect(option.value, showAllDevices)} disabled={!available || busy} className={css({ display: 'grid', gap: '2px', width: '100%', height: 'auto', padding: '12px', whiteSpace: 'normal', textAlign: 'left' })}>
                    <strong>{option.label}</strong>
                    <span className={css({ color: 'ink.soft', fontFamily: 'body', fontWeight: '400' })}>{available ? option.detail : 'This browser cannot use this connection.'}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
          <Toggle label="Printer missing from the Bluetooth list? Show every nearby device." value={showAllDevices} onChange={setShowAllDevices} />
        </>
      )}
      <RadioGroup.Root value={speed} onValueChange={({ value }) => onSpeed(value as Speed)} className={css({ display: 'grid', gap: '8px', marginTop: '16px' })}>
        <RadioGroup.Label className={css({ color: 'ink.soft', fontSize: '13px' })}>Sending speed</RadioGroup.Label>
        {(Object.keys(SPEEDS) as Speed[]).map((value) => (
          <RadioGroup.Item key={value} value={value} className={css({ display: 'flex', alignItems: 'start', gap: '8px', minHeight: '44px', cursor: 'pointer' })}>
            <RadioGroup.ItemControl className={css({ flex: 'none', width: '18px', height: '18px', marginTop: '2px', border: '1px solid {colors.ink.soft}', borderRadius: '50%', '&[data-state="checked"]': { borderWidth: '5px', borderColor: 'ink' }, '&[data-focus-visible]': { outline: '3px solid {colors.accent}', outlineOffset: '2px' } })} />
            <RadioGroup.ItemText><strong>{SPEEDS[value].label}</strong> {SPEEDS[value].detail}</RadioGroup.ItemText>
            <RadioGroup.ItemHiddenInput />
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      <p className={panelStyles.note}>If a print stops halfway, comes out garbled or skips lines, step down a speed.</p>
      {status.message && <p className={css({ margin: '12px 0 0', fontWeight: '600', '&[data-error]': { color: 'danger' } })} data-error={status.kind === 'error' || undefined}>{status.message}</p>}
    </Modal>
  );
}
