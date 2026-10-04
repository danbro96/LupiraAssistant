import type { Db } from '../data/db/db';
import { getIngestState } from '../data/api/generated/location-ingest/ingest/ingest';
import * as syncState from '../data/db/sync-state-repo';
import * as collectorMeta from '../data/db/collector-meta-repo';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

// Writes the paused flag to both sync_state (UI) and collector_meta (collector's cross-context read).

export async function pollTrackingState(db: Db, deviceId: string): Promise<boolean> {
  const res = await getIngestState();
  if (res.status !== 200) return false;   // mutator throws on non-2xx; this narrows off ProblemDetails
  const state = res.data;
  await syncState.setPaused(db, deviceId, 'location', state.paused, state.reason ?? null);
  await collectorMeta.setPausedCached(db, state.paused);
  logDebug('sync:state-poll', `paused=${state.paused}`);
  return state.paused;
}
