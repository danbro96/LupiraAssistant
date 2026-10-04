import type { Db } from '../data/db/db';
import { getIngestCursor } from '../data/api/generated/location-ingest/ingest/ingest';
import * as fixesRepo from '../data/db/pending-fixes-repo';
import * as seqRepo from '../data/db/seq-repo';
import * as syncState from '../data/db/sync-state-repo';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

// Drop already-accepted fixes (seq <= lastSeq) and keep the local seq counter at/above server high-water (reinstall).

export async function resumeFromCursor(db: Db, deviceId: string): Promise<void> {
  const res = await getIngestCursor();
  if (res.status !== 200) return;   // mutator throws on non-2xx; this narrows off ProblemDetails
  const cursor = res.data;
  const lastSeq = cursor.lastSeq ?? 0;
  if (lastSeq > 0) {
    await fixesRepo.deleteUpTo(db, lastSeq);
    await seqRepo.ensureAtLeast(db, 'location', lastSeq);
  }
  await syncState.setCursor(db, deviceId, 'location', cursor.lastSeq ?? null);
  logDebug('sync:cursor-resume', `lastSeq=${cursor.lastSeq ?? 'null'}`);
}
