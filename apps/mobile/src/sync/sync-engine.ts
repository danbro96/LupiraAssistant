import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { getDb } from '../data/db/db';
import { getDeviceId } from '../data/secure/device-credentials';
import { runLocationUpload } from './uploader';
import { runAckUpload } from './ack-uploader';
import { resumeFromCursor } from './cursor-resume';
import { pollTrackingState } from './pause-poll';
import { refreshSyncStatus, useSyncStatus } from './sync-status';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

// Single-flight lock: all triggers (reconnect, foreground, background task, explicit kicks) funnel through one cycle.

let running = false;

export interface KickOptions {
  /** Fetch the cursor and drop already-accepted rows first (launch / reconnect). */
  resume?: boolean;
  /** Poll the pause kill-switch first. */
  poll?: boolean;
}

export async function kickSync(opts: KickOptions = {}): Promise<void> {
  if (running) return; // single-flight: a concurrent kick no-ops
  running = true;
  const status = useSyncStatus.getState();
  try {
    const db = await getDb();
    const deviceId = await getDeviceId();
    if (!deviceId) return; // not registered yet

    if (opts.resume) {
      try {
        await resumeFromCursor(db, deviceId);
      } catch (e) {
        logDebug('sync:resume-error', e instanceof Error ? e.message : String(e));
      }
    }
    if (opts.poll) {
      try {
        await pollTrackingState(db, deviceId);
      } catch (e) {
        logDebug('sync:poll-error', e instanceof Error ? e.message : String(e));
      }
    }

    status.setUploading(true);
    for (;;) {
      const out = await runLocationUpload(db, deviceId);
      if (out.status === 'uploaded' && out.more) continue;
      break;
    }
    for (;;) {
      const out = await runAckUpload(db);
      if (out.status === 'uploaded' && out.more) continue;
      break;
    }
    await refreshSyncStatus(db, deviceId);
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
    if (online) void kickSync({ poll: true });
  });
  const appSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') void kickSync({ resume: true, poll: true });
  });
  return () => {
    netUnsub();
    appSub.remove();
  };
}
