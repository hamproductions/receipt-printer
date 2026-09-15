import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';

const OFFKAI_ORIGIN = 'https://offkai.idolbu.moe';
const MAX_REQUEST_BYTES = 4_096;
const MAX_RESPONSE_BYTES = 1_048_576;
const OFFKAI_TIMEOUT_MS = 8_000;
const basePath = process.env.VITE_BASE_PATH || '/';
const BASE_PATH = basePath.endsWith('/') ? basePath : `${basePath}/`;

function offkaiImportPlugin(): Plugin {
  return {
    name: 'offkai-import',
    configureServer(server) {
      server.middlewares.use('/api/offkai-import', offkaiMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/offkai-import', offkaiMiddleware);
    }
  };
}

function offkaiMiddleware(request: IncomingMessage, response: ServerResponse) {
  void handleOffkaiRequest(request, response);
}

async function handleOffkaiRequest(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'POST only' });
    return;
  }

  try {
    const body = await readRequestBody(request, MAX_REQUEST_BYTES);
    const payload: unknown = JSON.parse(body);
    const input = readImportInput(payload);
    const offkaiUrl = normalizeOffkaiUrl(input.url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OFFKAI_TIMEOUT_MS);

    let upstream: Response;
    let upstreamBody: string;
    try {
      upstream = await fetch(offkaiUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'
        },
        redirect: 'error',
        signal: controller.signal
      });
      upstreamBody = await readResponseBody(upstream, MAX_RESPONSE_BYTES, controller.signal);
    } finally {
      clearTimeout(timeout);
    }

    if (!upstream.ok) {
      sendJson(response, 502, { error: `Offkai returned HTTP ${upstream.status}` });
      return;
    }

    const upstreamJson: unknown = JSON.parse(upstreamBody);
    const result = mapOffkaiResponse(upstreamJson, input.includeAttendeeSerial);
    sendJson(response, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Offkai import failed';
    const status = message === 'Request body too large' ? 413 : error instanceof Error && error.name === 'AbortError' ? 504 : 400;
    sendJson(response, status, { error: message });
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(value);
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(body);
}

function readRequestBody(request: IncomingMessage, limit: number) {
  return new Promise<string>((resolve, reject) => {
    let body = '';
    let size = 0;
    let rejected = false;
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      if (rejected) {
        return;
      }
      size += Buffer.byteLength(chunk);
      if (size > limit) {
        rejected = true;
        reject(new Error('Request body too large'));
        request.resume();
        return;
      }
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function readResponseBody(response: Response, limit: number, signal: AbortSignal) {
  if (!response.body) {
    const body = await response.text();
    if (Buffer.byteLength(body) > limit) {
      throw new Error('Offkai response too large');
    }
    return body;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = '';
  let size = 0;

  while (true) {
    const { done, value } = await readResponseChunk(reader, signal);
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error('Offkai response too large');
    }
    body += decoder.decode(value, { stream: true });
  }

  return body + decoder.decode();
}

function readResponseChunk(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal) {
  if (signal.aborted) {
    return Promise.reject(new DOMException('Offkai request timed out', 'AbortError'));
  }

  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      if (settled) {
        return;
      }
      settled = true;
      void reader.cancel().catch(() => undefined);
      cleanup();
      reject(new DOMException('Offkai request timed out', 'AbortError'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
    reader.read().then(
      (result) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(result);
      },
      (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      }
    );
    if (signal.aborted) {
      onAbort();
    }
  });
}

function readImportInput(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid request');
  }

  const value = payload as { url?: unknown; includeAttendeeSerial?: unknown };
  if (typeof value.url !== 'string' || value.url.length < 1 || value.url.length > 2_048) {
    throw new Error('Offkai URL is required');
  }

  return {
    url: value.url,
    includeAttendeeSerial: value.includeAttendeeSerial === true
  };
}

function normalizeOffkaiUrl(input: string) {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error('Enter a valid Offkai URL');
  }

  if (parsed.origin !== OFFKAI_ORIGIN) {
    throw new Error('Only offkai.idolbu.moe is allowed');
  }

  const token = parsed.searchParams.get('token');
  if (!token || token.length > 1_024) {
    throw new Error('The Offkai URL must include a token');
  }

  const endpoint = new URL('/api/attendee', OFFKAI_ORIGIN);
  endpoint.searchParams.set('token', token);
  return endpoint;
}

function mapOffkaiResponse(value: unknown, includeAttendeeSerial: boolean) {
  if (!value || typeof value !== 'object') {
    throw new Error('Offkai returned an invalid response');
  }

  const payload = value as { event?: unknown; attendee?: unknown };
  if (!payload.event || typeof payload.event !== 'object') {
    throw new Error('Offkai response did not include event data');
  }

  const event = payload.event as Record<string, unknown>;
  const requiredStrings = ['event_name', 'venue', 'address', 'google_maps_link', 'event_datetime', 'event_deadline'];
  for (const key of requiredStrings) {
    if (typeof event[key] !== 'string') {
      throw new Error(`Offkai event field ${key} is missing`);
    }
  }

  const result: {
    event: {
      eventName: string;
      venue: string;
      address: string;
      googleMapsLink: string;
      eventDatetime: string;
      eventDeadline: string;
      open: boolean | null;
      maxCapacity: number | null;
    };
    attendeeNumber?: string | number | null;
  } = {
    event: {
      eventName: event.event_name as string,
      venue: event.venue as string,
      address: event.address as string,
      googleMapsLink: event.google_maps_link as string,
      eventDatetime: event.event_datetime as string,
      eventDeadline: event.event_deadline as string,
      open: typeof event.open === 'boolean' ? event.open : null,
      maxCapacity: typeof event.max_capacity === 'number' ? event.max_capacity : null
    }
  };

  if (includeAttendeeSerial && payload.attendee && typeof payload.attendee === 'object') {
    const attendee = payload.attendee as Record<string, unknown>;
    const number = attendee.attendee_number;
    if (typeof number === 'string' || typeof number === 'number' || number === null) {
      result.attendeeNumber = number;
    }
  }

  return result;
}

export default defineConfig({
  base: BASE_PATH,
  plugins: [react(), offkaiImportPlugin()],
  resolve: {
    alias: {
      'styled-system': new URL('./styled-system/', import.meta.url).pathname
    }
  }
});
