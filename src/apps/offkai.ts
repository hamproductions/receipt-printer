import type { AppValues } from './types';

type ImportResponse = {
  event?: { eventName: string; venue: string; eventDatetime: string };
  attendeeNumber?: string | number | null;
  error?: string;
};

export const offkaiAvailable = import.meta.env.DEV || import.meta.env.VITE_STATIC_DEPLOY !== 'true';

export function formatEventDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}年${get('month')}月${get('day')}日（${get('weekday')}） ${get('hour')}:${get('minute')}`;
}

export async function importOffkai(url: string, includeAttendeeSerial: boolean): Promise<{ values: AppValues; serial: boolean }> {
  const response = await fetch(`${import.meta.env.BASE_URL}api/offkai-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, includeAttendeeSerial })
  });
  const payload = (await response.json().catch(() => ({ error: `Import failed with HTTP ${response.status}` }))) as ImportResponse;
  if (!response.ok || !payload.event) {
    throw new Error(payload.error || 'Could not read the event from Offkai.');
  }
  const values: AppValues = {
    subtitle: payload.event.eventName,
    dateVenue: `${formatEventDate(payload.event.eventDatetime)} ${payload.event.venue}`
  };
  const serial = includeAttendeeSerial && payload.attendeeNumber !== null && payload.attendeeNumber !== undefined;
  if (serial) {
    values.serial = String(payload.attendeeNumber);
  }
  return { values, serial };
}
