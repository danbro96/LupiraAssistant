import * as WebBrowser from 'expo-web-browser';
import { OIDC_SCHEME } from './oidc-config';
import { joinUrl } from '../api/http';
import { logDebug } from '../../debug/log';

// Launches assistant-api's hosted offline-grant enrollment. The hub (a confidential Authentik client)
// runs the server-side auth-code consent and stores the per-user refresh token; the app only opens the
// page and waits for the return deep link. openAuthSessionAsync resolves on that redirect with no
// global listener and auto-dismisses the browser — the same primitive expo-auth-session uses for login.

/** Return deep link the hub redirects to when enrollment completes. */
export const CONNECT_RETURN_URL = `${OIDC_SCHEME}://connected`;

// The hub's hosted enrollment, reached through the BFF. return_uri must be on the hub's allowlist
// (Auth:Offline:AllowedReturnUris); /auth/done 302s back to it when the grant is captured.
function connectUrl(apiUrl: string): string {
  const ret = encodeURIComponent(CONNECT_RETURN_URL);
  return `${joinUrl(apiUrl, '/api/auth/login')}?return_uri=${ret}`;
}

export type ConnectResult = 'returned' | 'dismissed';

export async function launchConnect(apiUrl: string): Promise<ConnectResult> {
  try {
    const res = await WebBrowser.openAuthSessionAsync(connectUrl(apiUrl), CONNECT_RETURN_URL);
    return res.type === 'success' ? 'returned' : 'dismissed';
  } catch (e) {
    logDebug('connect:launch-error', e instanceof Error ? e.message : String(e));
    return 'dismissed';
  }
}
