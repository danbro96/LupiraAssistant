import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { createPushToken, deletePushToken } from '../api/generated/assistant/push/push';
import { getDeviceId } from '../secure/device-credentials';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

// Expo push registration. The token is a routing address, not a secret — it lives in the hub's
// registry, and the notices it carries are content-minimal (a generic title plus the item id).

/** Ask for permission and mint an Expo push token; null when denied or unavailable (simulator). */
export async function obtainPushToken(): Promise<string | null> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    const granted =
      existing.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return null;

    // EAS projectId is required for a token in a bare/dev-client build.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data;
  } catch (e) {
    logDebug('push:token-error', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Register this device's token with the hub. Safe to call on every launch (idempotent server-side). */
export async function registerPushToken(): Promise<string | null> {
  const token = await obtainPushToken();
  if (!token) return null;
  try {
    await createPushToken({
      token,
      deviceId: await getDeviceId(),
      platform: Platform.OS === 'ios' ? 'Ios' : 'Android',
    });
    return token;
  } catch (e) {
    logDebug('push:register-error', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Drop the token server-side (logout / re-registration). */
export async function unregisterPushToken(token: string): Promise<void> {
  try {
    await deletePushToken(token);
  } catch (e) {
    logDebug('push:unregister-error', e instanceof Error ? e.message : String(e));
  }
}
