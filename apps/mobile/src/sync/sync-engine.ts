import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { getDb } from '../data/db/db';
import { runAckUpload } from './ack-uploader';
import { useSyncStatus } from './sync-status';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

// Single-flight lock: all triggers (reconnect, foreground, background task, explicit kicks) funnel through one cycle.

let running = false;

export async function kickSync(): Promise<void> {
  if (running) return; // single-flight: a concurrent kick no-ops
  running = true;
  const status = useSyncStatus.getState();
  try {
    const db = await getDb();
    status.setUploading(true);
    for (;;) {
      const out = await runAckUpload(db);
      if (out.status === 'uploaded' && out.more) continue;
      break;
    }
  } catch (e) {
    logDebug('sync:kick-error', e instanceof Error ? e.message : String(e));
  } finally {
    status.setUploading(false);
    running = false;
  }
}

/** Wire connectivity + foreground triggers; returns an unsubscribe. Call once from App.tsx. */
export function startSyncTriggers(): () => void {
  const netUnsub = NetInfo.addEventListener((state) => {
    const online = !!state.isConnected && state.isInternetReachable !== false;
    useSyncStatus.getState().setOnline(online);
    if (online) void kickSync();
  });
  const appSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') void kickSync();
  });
  return () => {
    netUnsub();
    appSub.remove();
  };
}
