import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_API_URL, DEFAULT_AUTH_MODE, type AuthMode } from '../config/env';
import { SECURE_KEYS } from '../config/secure-keys';
import { setOidcAuthPort, setDeviceKeyPort } from '../data/api/auth-ports';
import { createTokenRefresher, secureSessionStore } from '@danbro96/lupira-expo-oidc/tokenSession';
import { oidc } from '../data/auth/oidc';
import { dropPushRegistration } from '../data/push/push-session';
import { getApiKey } from '../data/secure/device-credentials';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { toast } from '@danbro96/lupira-expo-feedback/toast';

// OIDC session — every BFF call except device ingest, which uses the device key.

const sessionStore = secureSessionStore('lupira.assistant.oidc');

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
    const [authMode, apiUrl, session, userSub, userName] = await Promise.all([
      SecureStore.getItemAsync(SECURE_KEYS.authMode),
      SecureStore.getItemAsync(SECURE_KEYS.apiUrl),
      sessionStore.load(),
      SecureStore.getItemAsync(SECURE_KEYS.userSub),
      SecureStore.getItemAsync(SECURE_KEYS.userName),
    ]);
    set({
      loaded: true,
      authMode: (authMode as AuthMode | null) ?? DEFAULT_AUTH_MODE,
      apiUrl: apiUrl || DEFAULT_API_URL,
      token: session.token,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt || null,
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
        sessionStore.save({ token: session.accessToken, refreshToken: session.refreshToken ?? null, expiresAt: session.expiresAt }),
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
      sessionStore.clear(),
      SecureStore.deleteItemAsync(SECURE_KEYS.userSub),
      SecureStore.deleteItemAsync(SECURE_KEYS.userName),
    ]);
    set({ token: null, refreshToken: null, expiresAt: null, user: null });
  },

  refreshIfNeeded: (opts) => refresh(opts),

  isAuthenticated: () => !!get().token && !!get().user,
}));

const refresh = createTokenRefresher({
  read: () => {
    const { token, refreshToken, expiresAt, user } = useAuth.getState();
    return { token, refreshToken: user ? refreshToken : null, expiresAt: expiresAt ?? 0 };
  },
  refreshTokens: (refreshToken) => oidc.refreshTokens(refreshToken),
  apply: async (t, previous) => {
    const { user, setSession } = useAuth.getState();
    if (!user) return;
    await setSession({ accessToken: t.accessToken, refreshToken: t.refreshToken ?? previous, expiresAt: Date.now() + (t.expiresIn ?? 3600) * 1000 }, user);
  },
  signOut: () => useAuth.getState().clearSession({ reason: 'expired' }),
  log: logDebug,
});

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
