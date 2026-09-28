import { oidcAuthPort, deviceKeyPort } from './auth-ports';
import { coreFetch, joinUrl } from './http';
import { ApiError, DeviceKeyInvalidError } from '../../domain/api-error';
import { buildDeviceKeyHeader } from '../../domain/device-key-auth';
import { isRetriableRequest } from '../../domain/retry-policy';
import { DEV_USER } from '../../config/env';

// One mutator per auth scheme — every target shares the BFF origin, and the path carries its prefix.

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = oidcAuthPort();
  const apiUrl = auth.getApiUrl();
  if (!apiUrl) throw new ApiError(0, 'API base URL is not configured.');

  const method = init.method ?? 'GET';
  const retriable = isRetriableRequest(method, false);
  const fullUrl = joinUrl(apiUrl, path);

  let triedReauth = false;
  let token = auth.getToken();

  for (;;) {
    const headers = new Headers(init.headers ?? {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (auth.getAuthMode() === 'dev') headers.set('X-Dev-User', DEV_USER);
    else if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    try {
      return await envelope<T>(await coreFetch(fullUrl, { ...init, headers }, { retriable }));
    } catch (e) {
      // 401 → force a token refresh and retry once.
      if (e instanceof ApiError && e.status === 401 && !triedReauth) {
        triedReauth = true;
        const fresh = await auth.refresh(true, token ?? undefined);
        if (fresh && fresh !== token) {
          token = fresh;
          continue;
        }
      }
      throw e;
    }
  }
}

// Reads the live key each call so rotation/clear takes effect immediately; 401 = revoked key → re-register,
// not OIDC re-auth.
export async function deviceKeyFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const port = deviceKeyPort();
  const apiKey = await port.getApiKey();
  if (!apiKey) throw new ApiError(0, 'No device key — register this device first.');

  const headers = new Headers(init.headers ?? {});
  headers.set('Authorization', buildDeviceKeyHeader(apiKey));
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  try {
    const res = await coreFetch(
      joinUrl(port.getApiUrl(), path),
      { ...init, headers, body: rawBody(headers, init.body) },
      { retriable: true },
    );
    return await envelope<T>(res);
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

async function envelope<T>(res: Response): Promise<T> {
  let data: unknown;
  if (res.status === 204) {
    data = undefined;
  } else {
    const contentType = res.headers.get('content-type') ?? '';
    data = contentType.includes('json') ? await res.json() : await res.text();
  }
  return { status: res.status, data, headers: res.headers } as T;
}

