import type { Field } from './apps/types';
import { createElement, type Element, type IconName, type ShapeElement, type TextElement } from './doc';

export type SectionId = 'welcome' | 'stay' | 'wifi' | 'room' | 'rules' | 'appliances' | 'checklist';

export type Section = { id: SectionId; label: string; fields: Field[]; rows: Element[][] };

const HEADING = { font: 'Archivo Black', size: 28, weight: 400, lineHeight: 1.2 };
const BODY = { font: 'Zen Kaku Gothic New', size: 22, weight: 500, lineHeight: 1.4 };

function text(value: string, patch: Partial<TextElement> = {}): TextElement {
  return { ...(createElement('text', { x: 0, y: 0 }) as TextElement), w: 384, text: value, align: 'left', ...BODY, role: 'body', ...patch };
}

function heading(value: string, icon: IconName): Element[] {
  const glyph = { ...(createElement('shape', { x: 0, y: 0 }) as ShapeElement), shape: 'icon' as const, icon, w: 36, h: 36, stroke: 2, fill: 'none' as const };
  return [glyph, text(value, { x: 48, w: 336, ...HEADING, role: 'heading' })];
}

function divider(): Element[] {
  return [{ ...(createElement('shape', { x: 0, y: 0 }) as ShapeElement), shape: 'dashes', w: 384, h: 8, stroke: 2 }];
}

const LIBRARY: Record<SectionId, () => Section> = {
  welcome: () => ({
    id: 'welcome',
    label: 'Welcome',
    fields: [
      { key: 'guest_name', label: 'Guest name', type: 'text', default: '', required: true, perGuest: true },
      { key: 'welcome_message', label: 'Welcome message', type: 'longtext', default: 'We are so glad you are here. Make yourself at home.' }
    ],
    rows: [heading('Welcome', 'heart'), [text('{{guest_name}}', { size: 40, weight: 900, lineHeight: 1.2, role: 'heading' })], [text('{{welcome_message}}')], divider()]
  }),
  stay: () => ({
    id: 'stay',
    label: 'Stay details',
    fields: [
      { key: 'arrival_date', label: 'Arrival date', type: 'date', default: '', required: true, perGuest: true },
      { key: 'departure_date', label: 'Departure date', type: 'date', default: '', required: true, perGuest: true },
      { key: 'checkin_time', label: 'Check-in from', type: 'time', default: '15:00' },
      { key: 'checkout_time', label: 'Check-out by', type: 'time', default: '10:00' }
    ],
    rows: [heading('Your stay', 'calendar'), [text('Check-in: {{arrival_date}} from {{checkin_time}}\nCheck-out: {{departure_date}} by {{checkout_time}}')], divider()]
  }),
  wifi: () => ({
    id: 'wifi',
    label: 'Wi-Fi',
    fields: [
      { key: 'wifi_name', label: 'Wi-Fi network', type: 'text', default: '', required: true },
      { key: 'wifi_password', label: 'Wi-Fi password', type: 'password', default: '', required: true }
    ],
    rows: [
      heading('Wi-Fi', 'wifi'),
      [text('Network: {{wifi_name}}\nPassword: {{wifi_password}}')],
      [{ ...createElement('qr', { x: 102, y: 0 }), w: 180, h: 180, data: 'WIFI:T:WPA;S:{{wifi:wifi_name}};P:{{wifi:wifi_password}};;' }],
      [text('Scan with your phone camera to join', { size: 18, align: 'center' })],
      divider()
    ]
  }),
  room: () => ({
    id: 'room',
    label: 'Room access',
    fields: [
      { key: 'room_number', label: 'Room', type: 'text', default: '' },
      { key: 'door_pin', label: 'Door code', type: 'password', default: '', required: true, perGuest: true },
      { key: 'access_notes', label: 'Access notes', type: 'longtext', default: 'The door locks by itself when it closes.' }
    ],
    rows: [heading('Room access', 'key'), [text('Room {{room_number}}\nDoor code: {{door_pin}}')], [text('{{access_notes}}', { size: 18 })], divider()]
  }),
  rules: () => ({
    id: 'rules',
    label: 'House rules',
    fields: [{ key: 'house_rules', label: 'House rules', type: 'longtext', default: 'Quiet hours 22:00 to 8:00\nNo smoking indoors\nShoes off at the entrance\nPlease sort your rubbish' }],
    rows: [heading('House rules', 'rules'), [text('{{house_rules}}')], divider()]
  }),
  appliances: () => ({
    id: 'appliances',
    label: 'Appliances',
    fields: [
      {
        key: 'appliances',
        label: 'Appliances',
        type: 'longtext',
        default: 'Air conditioner: remote on the wall by the bed\nWashing machine: detergent under the sink\nHot water: switch next to the bathroom door'
      }
    ],
    rows: [heading('Appliances', 'plug'), [text('{{appliances}}')], divider()]
  }),
  checklist: () => ({
    id: 'checklist',
    label: 'Departure checklist',
    fields: [
      {
        key: 'checklist',
        label: 'Before you leave',
        type: 'list',
        columns: [{ key: 'item', label: 'Task', type: 'text' }],
        format: '□ {item}',
        default: [{ item: 'Take the rubbish out' }, { item: 'Turn off the air conditioner' }, { item: 'Close the windows' }, { item: 'Leave the key on the table' }]
      }
    ],
    rows: [heading('Before you leave', 'check'), [text('{{checklist}}')], divider()]
  })
};

export const SECTIONS: { id: SectionId; label: string }[] = (Object.keys(LIBRARY) as SectionId[]).map((id) => ({ id, label: LIBRARY[id]().label }));

export function buildSection(id: SectionId) {
  return LIBRARY[id]();
}

export const SECTION_GAP = 10;

export function stackRows(rows: Element[][], top: number, measure: (element: Element) => number, gap = SECTION_GAP, group?: string) {
  const out: Element[] = [];
  let cursor = top;
  for (const row of rows) {
    const heights = row.map((element) => measure(element));
    const rowHeight = Math.max(...heights);
    row.forEach((element, index) => {
      out.push({ ...element, y: Math.round(cursor + (rowHeight - heights[index]) / 2), ...(group ? { group } : {}) } as Element);
    });
    cursor += rowHeight + gap;
  }
  return { elements: out, bottom: cursor - gap };
}
