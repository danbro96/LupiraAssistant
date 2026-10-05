import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
  setItemAsync: vi.fn((k: string, v: string) => {
    store.set(k, v);
    return Promise.resolve();
  }),
  deleteItemAsync: vi.fn((k: string) => {
    store.delete(k);
    return Promise.resolve();
  }),
}));
vi.mock('expo-auth-session', () => ({ fetchDiscoveryAsync: vi.fn() }));
vi.mock('@danbro96/lupira-expo-diagnostics/log', () => ({ logDebug: vi.fn() }));
vi.mock('@danbro96/lupira-expo-feedback/toast', () => ({ toast: vi.fn() }));
vi.mock('../data/auth/oidc', () => ({ oidc: { refreshTokens: vi.fn() } }));
vi.mock('../data/push/push-session', () => ({ dropPushRegistration: vi.fn() }));
vi.mock('../sync/engine', () => ({ engine: { wipe: vi.fn() } }));
vi.mock('../sync/queryClient', () => ({ queryClient: { clear: vi.fn() } }));

const { useAuth } = await import('./auth-store');
const { oidcAuthPort } = await import('../data/api/auth-ports');
const { SECURE_KEYS } = await import('../config/secure-keys');
const { API_PRESETS } = await import('../config/env');
const { engine } = await import('../sync/engine');
const { queryClient } = await import('../sync/queryClient');
const { dropPushRegistration } = await import('../data/push/push-session');
const { toast } = await import('@danbro96/lupira-expo-feedback/toast');

const emulator = API_PRESETS.find((p) => p.key === 'emulator')!;
const jwt = (claims: Record<string, unknown>) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  useAuth.setState({ authMode: 'oidc', token: null, refreshToken: null, user: null });
});

describe('storage keys', () => {
  it('keeps the backend under the keys earlier installs already hold', async () => {
    await useAuth.getState().setBackend(emulator.urls, 'dev');
    expect(store.get(SECURE_KEYS.apiUrl)).toBe(emulator.urls.api);
    expect(store.get(SECURE_KEYS.authMode)).toBe('dev');
  });

  it('keeps the session under the keys earlier installs already hold', async () => {
    await useAuth.getState().setSession({ accessToken: jwt({ email: 'me@x' }), refreshToken: 'ref' });
    expect(store.get('lupira.assistant.oidc.refreshToken')).toBe('ref');
    expect(store.get('lupira.assistant.oidc.userSub')).toBe('me@x');
  });
});

describe('account change', () => {
  it('wipes the queued gestures, the inbox and the query cache before another account lands', async () => {
    await useAuth.getState().setSession({ accessToken: jwt({ email: 'a@x' }) });
    await useAuth.getState().clearSession();
    vi.clearAllMocks();

    await useAuth.getState().setSession({ accessToken: jwt({ email: 'b@x' }) });

    expect(engine.wipe).toHaveBeenCalledOnce();
    expect(queryClient.clear).toHaveBeenCalledOnce();
  });
});

describe('sign-out', () => {
  it('drops the push registration while the session is still live', async () => {
    await useAuth.getState().setSession({ accessToken: jwt({ email: 'me@x' }) });
    vi.mocked(dropPushRegistration).mockImplementationOnce(async () => {
      expect(useAuth.getState().token).not.toBeNull();
    });

    await useAuth.getState().clearSession();

    expect(dropPushRegistration).toHaveBeenCalledOnce();
    expect(toast).not.toHaveBeenCalled();
  });

  it('tells the user when the session expired', async () => {
    await useAuth.getState().clearSession({ reason: 'expired' });
    expect(toast).toHaveBeenCalledOnce();
  });
});

describe('OIDC port', () => {
  it('exposes the auth mode and sends no bearer in dev mode', async () => {
    await useAuth.getState().setSession({ accessToken: jwt({ email: 'me@x' }) });
    useAuth.setState({ authMode: 'dev' });

    expect(oidcAuthPort().getAuthMode()).toBe('dev');
    expect(oidcAuthPort().getToken()).toBeNull();
  });
});
