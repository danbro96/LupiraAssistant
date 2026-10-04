import { ApiError } from '@danbro96/lupira-http/apiError';
import { REQUEST_TIMEOUT_MS } from '../../domain/api-error';
import { MAX_RETRIES, isTransientStatus, retryDelayMs } from '@danbro96/lupira-http/retryPolicy';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(fullUrl: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(fullUrl, { ...init, signal: controller.signal });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(
      0,
      aborted
        ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
        : `Network unreachable: ${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

export interface CoreFetchOptions {
  retriable: boolean;
}

export async function coreFetch(fullUrl: string, init: RequestInit, opts: CoreFetchOptions): Promise<Response> {
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetchWithTimeout(fullUrl, init);
    } catch (e) {
      if (opts.retriable && attempt < MAX_RETRIES) {
        await sleep(retryDelayMs(attempt, null));
        continue;
      }
      throw e;
    }

    if (res.ok) return res;

    if (opts.retriable && isTransientStatus(res.status) && attempt < MAX_RETRIES) {
      await sleep(retryDelayMs(attempt, res.headers.get('retry-after')));
      continue;
    }

    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || res.statusText || `HTTP ${res.status}`);
  }
}

export function joinUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/$/, '') + path;
}
