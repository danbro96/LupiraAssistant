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
vi.mock('../debug/log', () => ({ logDebug: vi.fn() }));
// expo-auth-session / expo-haptics reach react-native, which the node env cannot parse.
vi.mock('../data/auth/oidc', () => ({ refreshTokens: vi.fn(), RefreshError: class extends Error {} }));
vi.mock('../data/push/push-session', () => ({ dropPushRegistration: vi.fn() }));
vi.mock('../data/secure/device-credentials', () => ({ getApiKey: vi.fn() }));
vi.mock('../feedback/toast', () => ({ toast: vi.fn() }));

const { useAuth } = await import('./auth-store');
const { SECURE_KEYS } = await import('../config/secure-keys');
const { API_PRESETS } = await import('../config/env');

const emulator = API_PRESETS.find((p) => p.key === 'emulator')!;

beforeEach(() => {
  store.clear();
  useAuth.setState({ authMode: 'oidc', token: 'live-token', refreshToken: 'r', user: { sub: 'me@x' } });
});

describe('setBackend', () => {
  it('applies every origin the preset carries, not just the primary', async () => {
    await useAuth.getState().setBackend(emulator.urls, 'dev');
    const s = useAuth.getState();
    expect(s.apiUrl).toBe(emulator.urls.api);
    expect(s.locationApiUrl).toBe(emulator.urls.location);
    expect(s.healthApiUrl).toBe(emulator.urls.health);
    expect(s.authMode).toBe('dev');
  });

  it('clears the session — a token minted for one backend is meaningless against another', async () => {
    await useAuth.getState().setBackend(emulator.urls, 'dev');
    expect(useAuth.getState().token).toBeNull();
  });

  it('keeps origins the preset omits', async () => {
    const before = useAuth.getState().healthApiUrl;
    await useAuth.getState().setBackend({ api: 'http://localhost:9999' }, 'dev');
    expect(useAuth.getState().apiUrl).toBe('http://localhost:9999');
    expect(useAuth.getState().healthApiUrl).toBe(before);
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
