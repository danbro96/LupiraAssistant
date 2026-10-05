import { oidcAuthPort } from './auth-ports';
import { coreFetch, joinUrl } from './http';
import { ApiError } from '@danbro96/lupira-http/apiError';
import { isRetriableRequest } from '@danbro96/lupira-http/retryPolicy';
import { DEV_USER } from '../../config/env';

// Every target shares the BFF origin, and the path carries its prefix.

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

