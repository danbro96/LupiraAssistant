import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setDeviceKeyPort } from './auth-ports';
import { ingestLocation } from './generated/location-ingest/ingest/ingest';

vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '0.0.0' } } }));

// The NDJSON path is the one Orval can't express: it JSON-encodes every request body, so the mutator
// has to undo that for x-ndjson or the server receives one quoted, escaped line.

const originalFetch = globalThis.fetch;
let seen: { url: string; init: RequestInit } | null = null;

beforeEach(() => {
  seen = null;
  setDeviceKeyPort({
    getApiUrl: () => 'https://location-api.test',
    getApiKey: async () => 'kid.secret',
  });
  globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    seen = { url: String(url), init: init ?? {} };
    return new Response(JSON.stringify({ rejects: [], paused: false }), {
      status: 202,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('deviceKeyFetch over the generated ingest client', () => {
  it('sends the NDJSON batch verbatim, not JSON-encoded', async () => {
    const body = '{"seq":1}\n{"seq":2}';
    await ingestLocation(body);

    expect(seen?.init.body).toBe(body);
  });

  it('targets the real route with no /api prefix and a device-key header', async () => {
    await ingestLocation('{"seq":1}');

    expect(seen?.url).toBe('https://location-api.test/ingest/location');
    const headers = new Headers(seen?.init.headers);
    expect(headers.get('Content-Type')).toBe('application/x-ndjson');
    expect(headers.get('Authorization')).toContain('kid.secret');
  });

  it('returns the parsed receipt in the envelope', async () => {
    const res = await ingestLocation('{"seq":1}');

    expect(res.status).toBe(202);
    expect(res.data).toEqual({ rejects: [], paused: false });
  });
});
