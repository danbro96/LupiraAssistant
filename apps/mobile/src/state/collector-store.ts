import { create } from 'zustand';
import * as registration from '../collector/task-registration';
import { ensureBackgroundPermissions, getStage, type PermissionStage } from '../collector/permissions';
import { getDb } from '../data/db/db';
import * as collectorMeta from '../data/db/collector-meta-repo';
import { MotionState } from '../domain/motion-state';
import { useSyncStatus } from '../sync/sync-status';
import { kickSync } from '../sync/sync-engine';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

// `collectingDesired` in collector_meta is authoritative so launch reconciliation knows the user's intent.

interface CollectorState {
  loaded: boolean;
  collecting: boolean;
  starting: boolean;
  permissionStage: PermissionStage;
}

interface CollectorActions {
  hydrate: () => Promise<void>;
  start: () => Promise<{ ok: boolean; stage: PermissionStage }>;
  stop: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
}

function reflectStatus(collecting: boolean, paused: boolean): void {
  useSyncStatus.getState().setCollector(collecting ? (paused ? 'paused' : 'collecting') : 'off');
}

export const useCollector = create<CollectorState & CollectorActions>((set) => ({
  loaded: false,
  collecting: false,
  starting: false,
  permissionStage: 'denied',

  hydrate: async () => {
    const db = await getDb();
    const [desired, running, stage, paused] = await Promise.all([
      collectorMeta.isCollectingDesired(db),
      registration.isCollecting(),
      getStage(),
      collectorMeta.isPausedCached(db),
    ]);
    let collecting = running;
    // OS may not restore the task after a kill: re-register if desired and we still hold background permission
    if (desired && stage === 'background' && !running) {
      try {
        await registration.startCollecting(MotionState.Unknown);
        collecting = true;
      } catch (e) {
        logDebug('collector:hydrate-start-error', e instanceof Error ? e.message : String(e));
      }
    }
    set({ loaded: true, collecting, permissionStage: stage });
    reflectStatus(collecting, paused);
  },

  start: async () => {
    set({ starting: true });
    const stage = await ensureBackgroundPermissions();
    set({ permissionStage: stage });
    if (stage !== 'background') {
      set({ starting: false });
      logDebug('collector:start-denied', stage);
      return { ok: false, stage };
    }
    const db = await getDb();
    await collectorMeta.setCollectingDesired(db, true);
    try {
      await registration.startCollecting(MotionState.Unknown);
    } catch (e) {
      set({ starting: false });
      logDebug('collector:start-error', e instanceof Error ? e.message : String(e));
      return { ok: false, stage };
    }
    set({ collecting: true, starting: false });
    reflectStatus(true, false);
    void kickSync({ resume: true, poll: true });
    logDebug('collector:started');
    return { ok: true, stage };
  },

  stop: async () => {
    const db = await getDb();
    await collectorMeta.setCollectingDesired(db, false);
    await registration.stopCollecting();
    set({ collecting: false });
    useSyncStatus.getState().setCollector('off');
    logDebug('collector:stopped');
  },

  refreshPermissions: async () => {
    set({ permissionStage: await getStage() });
  },
}));
