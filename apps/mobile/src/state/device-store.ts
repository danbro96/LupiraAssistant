import { create } from 'zustand';
import { bootstrapMe } from '../data/api/generated/health/me/me';
import { registerDevice } from '../data/api/generated/location/devices/devices';
import {
  loadCredentials,
  saveCredentials,
  clearCredentials,
} from '../data/secure/device-credentials';
import { getDb } from '../data/db/db';
import { resetSeq } from '../data/db/seq-repo';
import * as fixesRepo from '../data/db/pending-fixes-repo';
import * as ringRepo from '../data/db/pending-ring-repo';
import * as summariesRepo from '../data/db/pending-summaries-repo';
import * as syncState from '../data/db/sync-state-repo';
import type { DeviceKind, RegisterDeviceResponse } from '../data/api/generated/location/models';
import type { HealthRecordDto } from '../data/api/generated/health/models';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

// Non-secret mirror of the registered device; the apiKey lives ONLY in secure-store.

interface DeviceState {
  loaded: boolean;
  registered: boolean;
  deviceId: string | null;
  keyId: string | null;
  healthRecordId: string | null;
  recordSlug: string | null;
  label: string | null;
  kind: DeviceKind | null;
}

interface DeviceActions {
  load: () => Promise<void>;
  /** bootstrap record → register Phone → persist key → reset local buffers */
  register: (label: string) => Promise<{ ok: boolean; error?: string }>;
  clear: () => Promise<void>;
}

export const useDevice = create<DeviceState & DeviceActions>((set) => ({
  loaded: false,
  registered: false,
  deviceId: null,
  keyId: null,
  healthRecordId: null,
  recordSlug: null,
  label: null,
  kind: null,

  load: async () => {
    const creds = await loadCredentials();
    set({
      loaded: true,
      registered: !!creds,
      deviceId: creds?.deviceId ?? null,
      keyId: creds?.keyId ?? null,
      healthRecordId: creds?.healthRecordId ?? null,
      recordSlug: creds?.recordSlug ?? null,
      label: creds?.label ?? null,
      kind: creds ? 'Phone' : null,
    });
  },

  register: async (label) => {
    try {
      // The mutator throws on non-2xx, so the generated error/void response branches are unreachable.
      const { data: record } = (await bootstrapMe()) as { data: HealthRecordDto };
      const { data: resp } = (await registerDevice({ kind: 'Phone', label })) as { data: RegisterDeviceResponse };
      await saveCredentials(resp, record);

      // fresh device: reset local streams, clear stale buffers, seed sync state
      const db = await getDb();
      await resetSeq(db, 'location');
      await resetSeq(db, 'ring');
      await resetSeq(db, 'summaries');
      await fixesRepo.clearAll(db);
      await ringRepo.clearAll(db);
      await summariesRepo.clearAll(db);
      await syncState.clearForDevice(db, resp.device.id);
      await syncState.setCursor(db, resp.device.id, 'location', null);

      set({
        registered: true,
        deviceId: resp.device.id,
        keyId: resp.keyId,
        healthRecordId: record.id,
        recordSlug: record.slug,
        label: resp.device.label,
        kind: 'Phone',
      });
      logDebug('device:registered', `kind=Phone record=${record.slug}`);
      return { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      logDebug('device:register-error', error);
      return { ok: false, error };
    }
  },

  clear: async () => {
    const db = await getDb();
    await fixesRepo.clearAll(db);
    await ringRepo.clearAll(db);
    await summariesRepo.clearAll(db);
    await resetSeq(db, 'location');
    await resetSeq(db, 'ring');
    await resetSeq(db, 'summaries');
    await clearCredentials();
    set({
      registered: false,
      deviceId: null,
      keyId: null,
      healthRecordId: null,
      recordSlug: null,
      label: null,
      kind: null,
    });
  },
}));
