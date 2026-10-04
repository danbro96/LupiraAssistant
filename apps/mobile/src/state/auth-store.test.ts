import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '0.0.0' } } }));
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
vi.mock('@danbro96/lupira-expo-diagnostics/log', () => ({ logDebug: vi.fn() }));
// expo-auth-session / expo-haptics reach react-native, which the node env cannot parse.
vi.mock('../data/auth/oidc', () => ({ oidc: { refreshTokens: vi.fn() } }));
vi.mock('@danbro96/lupira-expo-oidc/oidc', () => ({
  RefreshError: class extends Error {
    constructor(
      readonly definitive: boolean,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock('../data/push/push-session', () => ({ dropPushRegistration: vi.fn() }));
vi.mock('../data/secure/device-credentials', () => ({ getApiKey: vi.fn() }));
vi.mock('@danbro96/lupira-expo-feedback/toast', () => ({ toast: vi.fn() }));

const { useAuth } = await import('./auth-store');
const { oidc } = await import('../data/auth/oidc');
const { RefreshError } = await import('@danbro96/lupira-expo-oidc/oidc');
const { SECURE_KEYS } = await import('../config/secure-keys');
const { API_PRESETS } = await import('../config/env');

const emulator = API_PRESETS.find((p) => p.key === 'emulator')!;

beforeEach(() => {
  store.clear();
  useAuth.setState({ authMode: 'oidc', token: 'live-token', refreshToken: 'r', user: { sub: 'me@x' } });
});

describe('setBackend', () => {
  it('applies the preset origin and mode', async () => {
    await useAuth.getState().setBackend(emulator.urls, 'dev');
    const s = useAuth.getState();
    expect(s.apiUrl).toBe(emulator.urls.api);
    expect(s.authMode).toBe('dev');
  });

  it('clears the session — a token minted for one backend is meaningless against another', async () => {
    await useAuth.getState().setBackend(emulator.urls, 'dev');
    expect(useAuth.getState().token).toBeNull();
  });

  it('persists the mode so a relaunch does not fall back to OIDC against a dev backend', async () => {
    await useAuth.getState().setBackend(emulator.urls, 'dev');
    expect(store.get(SECURE_KEYS.authMode)).toBe('dev');

    useAuth.setState({ authMode: 'oidc' });
    await useAuth.getState().load();
    expect(useAuth.getState().authMode).toBe('dev');
  });
});

describe('load', () => {
  it('defaults to OIDC on a fresh install', async () => {
    await useAuth.getState().load();
    expect(useAuth.getState().authMode).toBe('oidc');
    expect(useAuth.getState().loaded).toBe(true);
  });
});

describe('session persistence', () => {
  it('stores the session under the keys earlier installs already hold', async () => {
    await useAuth.getState().setSession({ accessToken: 'tok', refreshToken: 'ref', expiresAt: 123 }, { sub: 'me@x', displayName: 'Me' });
    expect(Object.fromEntries(store)).toMatchObject({
      'lupira.assistant.oidc.token': 'tok',
      'lupira.assistant.oidc.refreshToken': 'ref',
      'lupira.assistant.oidc.expiresAt': '123',
      [SECURE_KEYS.userSub]: 'me@x',
    });
  });

  it('restores a stored session on load', async () => {
    store.set('lupira.assistant.oidc.token', 'tok');
    store.set('lupira.assistant.oidc.refreshToken', 'ref');
    store.set('lupira.assistant.oidc.expiresAt', '456');
    store.set(SECURE_KEYS.userSub, 'me@x');
    useAuth.setState({ token: null, refreshToken: null, expiresAt: null, user: null });
    await useAuth.getState().load();
    expect(useAuth.getState()).toMatchObject({ token: 'tok', refreshToken: 'ref', expiresAt: 456, user: { sub: 'me@x' } });
  });

  it('clears the stored tokens on sign-out', async () => {
    await useAuth.getState().setSession({ accessToken: 'tok', refreshToken: 'ref', expiresAt: 123 }, { sub: 'me@x' });
    await useAuth.getState().clearSession();
    expect([...store.keys()].filter((k) => k.startsWith('lupira.assistant.oidc.token') || k.endsWith('refreshToken'))).toEqual([]);
  });
});

describe('refreshIfNeeded', () => {
  const refreshTokens = vi.mocked(oidc.refreshTokens);

  beforeEach(() => {
    refreshTokens.mockReset();
    useAuth.setState({ expiresAt: Date.now() + 3_600_000 });
  });

  it('stands pat on a fresh token', async () => {
    expect(await useAuth.getState().refreshIfNeeded()).toBe('live-token');
    expect(refreshTokens).not.toHaveBeenCalled();
  });

  it('coalesces concurrent forced refreshes into one token-endpoint call and adopts the result', async () => {
    refreshTokens.mockResolvedValue({ accessToken: 'tok-2', refreshToken: 'r-2', expiresIn: 3600 });
    const [a, b] = await Promise.all([
      useAuth.getState().refreshIfNeeded({ force: true, sentToken: 'live-token' }),
      useAuth.getState().refreshIfNeeded({ force: true, sentToken: 'live-token' }),
    ]);
    expect([a, b]).toEqual(['tok-2', 'tok-2']);
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(useAuth.getState()).toMatchObject({ token: 'tok-2', refreshToken: 'r-2' });
    expect(store.get('lupira.assistant.oidc.token')).toBe('tok-2');
  });

  it('a definitive failure signs out', async () => {
    refreshTokens.mockRejectedValue(new RefreshError(true, 'invalid_grant'));
    expect(await useAuth.getState().refreshIfNeeded({ force: true })).toBeNull();
    expect(useAuth.getState().token).toBeNull();
  });

  it('a transient failure keeps the session', async () => {
    refreshTokens.mockRejectedValue(new RefreshError(false, '503'));
    expect(await useAuth.getState().refreshIfNeeded({ force: true })).toBe('live-token');
    expect(useAuth.getState().user).not.toBeNull();
  });
});
