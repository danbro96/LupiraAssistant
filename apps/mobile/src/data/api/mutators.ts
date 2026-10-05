import { oidcAuthPort, deviceKeyPort } from './auth-ports';
import { createBearerMutator } from '@danbro96/lupira-http/mutator';
import { ApiError } from '@danbro96/lupira-http/apiError';
import { DeviceKeyInvalidError, REQUEST_TIMEOUT_MS } from '../../domain/api-error';
import { buildDeviceKeyHeader } from '../../domain/device-key-auth';
import { DEV_USER } from '../../config/env';

// One mutator per auth scheme — every target shares the BFF origin, and the path carries its prefix.

export const apiFetch = createBearerMutator({
  auth: oidcAuthPort,
  timeoutMs: REQUEST_TIMEOUT_MS,
  decorate: (headers) => {
    if (oidcAuthPort().getAuthMode() === 'dev') headers.set('X-Dev-User', DEV_USER);
  },
});

// Reads the live key each call so rotation/clear takes effect immediately; 401 = revoked key → re-register,
// not OIDC re-auth.
export async function deviceKeyFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const port = deviceKeyPort();
  const apiKey = await port.getApiKey();
  if (!apiKey) throw new ApiError(0, 'No device key — register this device first.');

  const send = createBearerMutator({
    auth: { getApiUrl: port.getApiUrl, getToken: () => null, refresh: async () => null, onSignIn: () => () => {} },
    timeoutMs: REQUEST_TIMEOUT_MS,
    decorate: (headers) => headers.set('Authorization', buildDeviceKeyHeader(apiKey)),
  });
  try {
    return await send<T>(path, { ...init, body: rawBody(new Headers(init.headers), init.body) });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw new DeviceKeyInvalidError();
    throw e;
  }
}

/**
 * The ingest endpoints take NDJSON, but the generated client JSON-encodes every request body — which
 * would send the batch as one quoted, escaped string. Decode it back to the raw text it already was.
 */
function rawBody(headers: Headers, body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (typeof body !== 'string') return body;
  if (!(headers.get('Content-Type') ?? '').includes('x-ndjson')) return body;
  return JSON.parse(body) as string;
}
