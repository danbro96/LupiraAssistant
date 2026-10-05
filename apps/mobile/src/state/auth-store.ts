import * as SecureStore from 'expo-secure-store';
import { createAuthStore, toAuthPort } from '@danbro96/lupira-expo-oidc/authStore';
import { DEFAULT_API_URL, DEFAULT_AUTH_MODE } from '../config/env';
import { SECURE_KEYS } from '../config/secure-keys';
import { setOidcAuthPort, setDeviceKeyPort } from '../data/api/auth-ports';
import { oidc } from '../data/auth/oidc';
import { dropPushRegistration } from '../data/push/push-session';
import { engine } from '../sync/engine';
import { queryClient } from '../sync/queryClient';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { toast } from '@danbro96/lupira-expo-feedback/toast';

// OIDC session for every BFF call except device ingest, which uses the device key.

export const useAuth = createAuthStore({
  keyPrefix: 'lupira.assistant.oidc',
  storageKeys: { apiUrl: SECURE_KEYS.apiUrl, authMode: SECURE_KEYS.authMode },
  defaultApiUrl: DEFAULT_API_URL,
  defaultAuthMode: DEFAULT_AUTH_MODE,
  oidc,
  log: logDebug,
  onAccountChange: async () => {
    await engine.wipe();
    queryClient.clear();
  },
  beforeSignOut: async (reason) => {
    if (reason === 'expired') toast('Session expired — please sign in again.');
    // Drop the push token before the bearer goes: the hub call needs it, and a stale registry row
    // would otherwise keep waking a signed-out device.
    await dropPushRegistration();
  },
});

// Runs at module load (App.tsx imports the store during bootstrap, before any request fires).
setOidcAuthPort({ ...toAuthPort(useAuth.getState), getAuthMode: () => useAuth.getState().authMode });

setDeviceKeyPort({
  getApiUrl: () => useAuth.getState().apiUrl,
  getApiKey: () => SecureStore.getItemAsync(SECURE_KEYS.apiKey),
});
