import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { API_PRESETS, DEFAULT_API_URL, DEFAULT_AUTH_MODE, type AuthMode } from '../config/env';
import { SECURE_KEYS } from '../config/secure-keys';
import { setOidcAuthPort, setDeviceKeyPort } from '../data/api/auth-ports';
import { refreshTokens, RefreshError } from '../data/auth/oidc';
import { dropPushRegistration } from '../data/push/push-session';
import { getApiKey } from '../data/secure/device-credentials';
import { logDebug } from '../debug/log';
import { toast } from '../feedback/toast';

// OIDC session — every BFF call except device ingest, which uses the device key.

let refreshing: Promise<string | null> | null = null;

export interface AuthUser {
  sub: string; // email / OIDC subject
  displayName?: string;
}

export interface Session {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: number; // epoch ms
}

interface AuthState {
  loaded: boolean;
  authMode: AuthMode;
  apiUrl: string;
  token: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  user: AuthUser | null;
}

interface AuthActions {
  load: () => Promise<void>;
  /** Clears the session: a token minted for one backend is meaningless against another. */
  setBackend: (urls: Record<string, string>, authMode: AuthMode) => Promise<void>;
  setSession: (session: Session, user: AuthUser) => Promise<void>;
  clearSession: (opts?: { reason?: 'expired' }) => Promise<void>;
  refreshIfNeeded: (opts?: { force?: boolean; sentToken?: string }) => Promise<string | null>;
  isAuthenticated: () => boolean;
}

export const useAuth = create<AuthState & AuthActions>((set, get) => ({
  loaded: false,
  authMode: DEFAULT_AUTH_MODE,
  apiUrl: DEFAULT_API_URL,
  token: null,
  refreshToken: null,
  expiresAt: null,
  user: null,

  load: async () => {
    const [authMode, apiUrl, token, refreshToken, expiresAt, userSub, userName] = await Promise.all([
      SecureStore.getItemAsync(SECURE_KEYS.authMode),
      SecureStore.getItemAsync(SECURE_KEYS.apiUrl),
      SecureStore.getItemAsync(SECURE_KEYS.oidcToken),
      SecureStore.getItemAsync(SECURE_KEYS.oidcRefresh),
      SecureStore.getItemAsync(SECURE_KEYS.oidcExpires),
      SecureStore.getItemAsync(SECURE_KEYS.userSub),
      SecureStore.getItemAsync(SECURE_KEYS.userName),
    ]);
    set({
      loaded: true,
      authMode: (authMode as AuthMode | null) ?? DEFAULT_AUTH_MODE,
      apiUrl: apiUrl || DEFAULT_API_URL,
      token: token ?? null,
      refreshToken: refreshToken ?? null,
      expiresAt: expiresAt ? Number(expiresAt) : null,
      user: userSub ? { sub: userSub, displayName: userName ?? undefined } : null,
    });
  },

  setBackend: async (urls, authMode) => {
    await get().clearSession();
    const apiUrl = urls.api ?? get().apiUrl;
    set({ apiUrl, authMode });
    await Promise.all([
      SecureStore.setItemAsync(SECURE_KEYS.apiUrl, apiUrl),
      SecureStore.setItemAsync(SECURE_KEYS.authMode, authMode),
    ]);
    logDebug('auth', `backend → ${apiUrl} (${authMode})`);
  },

  setSession: async (session, user) => {
    // in-memory first: a rotated refresh token must survive a persistence failure
    set({
      token: session.accessToken,
      refreshToken: session.refreshToken ?? null,
      expiresAt: session.expiresAt,
      user,
    });
    try {
      await Promise.all([
        SecureStore.setItemAsync(SECURE_KEYS.oidcToken, session.accessToken),
        session.refreshToken
          ? SecureStore.setItemAsync(SECURE_KEYS.oidcRefresh, session.refreshToken)
          : SecureStore.deleteItemAsync(SECURE_KEYS.oidcRefresh),
        SecureStore.setItemAsync(SECURE_KEYS.oidcExpires, String(session.expiresAt)),
        SecureStore.setItemAsync(SECURE_KEYS.userSub, user.sub),
        user.displayName
          ? SecureStore.setItemAsync(SECURE_KEYS.userName, user.displayName)
          : SecureStore.deleteItemAsync(SECURE_KEYS.userName),
      ]);
    } catch (e) {
      logDebug('auth:persist-error', e instanceof Error ? e.message : String(e));
    }
  },

  clearSession: async (opts) => {
    if (opts?.reason === 'expired') toast('Session expired — please sign in again.');
    // Drop the push token before the bearer goes: the hub call needs it, and a stale registry row
    // would otherwise keep waking a signed-out device.
    await dropPushRegistration();
    await Promise.all([
      SecureStore.deleteItemAsync(SECURE_KEYS.oidcToken),
      SecureStore.deleteItemAsync(SECURE_KEYS.oidcRefresh),
      SecureStore.deleteItemAsync(SECURE_KEYS.oidcExpires),
      SecureStore.deleteItemAsync(SECURE_KEYS.userSub),
      SecureStore.deleteItemAsync(SECURE_KEYS.userName),
    ]);
    set({ token: null, refreshToken: null, expiresAt: null, user: null });
  },

  refreshIfNeeded: async (opts) => {
    const { token, refreshToken, expiresAt, user } = get();
    if (!token) return null;
    const force = opts?.force ?? false;
    if (force && opts?.sentToken && opts.sentToken !== token) return token;
    const fresh = expiresAt ? Date.now() < expiresAt - 60_000 : false;
    if (!force && fresh) return token;
    if (!refreshToken || !user) {
      if (force) {
        await get().clearSession({ reason: 'expired' });
        return null;
      }
      return token;
    }
    if (refreshing) return refreshing;
    refreshing = (async (): Promise<string | null> => {
      try {
        const t = await refreshTokens(refreshToken);
        if (!t.accessToken) return token;
        const next: Session = {
          accessToken: t.accessToken,
          refreshToken: t.refreshToken ?? refreshToken,
          expiresAt: Date.now() + (t.expiresIn ?? 3600) * 1000,
        };
        await get().setSession(next, user);
        return next.accessToken;
      } catch (e) {
        if (e instanceof RefreshError && e.definitive) {
          logDebug('auth:logout', `definitive: ${e.message}`);
          await get().clearSession({ reason: 'expired' });
          return null;
        }
        logDebug('auth:refresh:transient', e instanceof Error ? e.message : String(e));
        return token;
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  },

  isAuthenticated: () => !!get().token && !!get().user,
}));

// Runs at module load (App.tsx imports the store during bootstrap, before any request fires).
const apiUrl = (): string => useAuth.getState().apiUrl;

setOidcAuthPort({
  getApiUrl: apiUrl,
  getAuthMode: () => useAuth.getState().authMode,
  getToken: () => useAuth.getState().token,
  refresh: (force, sentToken) => useAuth.getState().refreshIfNeeded({ force, sentToken }),
});

setDeviceKeyPort({
  getApiUrl: apiUrl,
  getApiKey: () => getApiKey(),
});

/** Which preset the current backend matches, or 'custom'. */
export function presetFor(url: string, authMode: AuthMode): string {
  return API_PRESETS.find((p) => p.urls.api === url && p.authMode === authMode)?.key ?? 'custom';
}
