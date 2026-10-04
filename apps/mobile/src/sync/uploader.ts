import type { Db } from '../data/db/db';
import * as fixesRepo from '../data/db/pending-fixes-repo';
import * as syncState from '../data/db/sync-state-repo';
import * as collectorMeta from '../data/db/collector-meta-repo';
import { ingestLocation } from '../data/api/generated/location-ingest/ingest/ingest';
import { applyReceipt } from '../domain/receipt-apply';
import { selectBatch, type BatchItem } from '../domain/batcher';
import { utf8ByteLength } from '../domain/ndjson';
import { DeviceKeyInvalidError } from '../domain/api-error';
import { MAX_BATCH_LINES, MAX_BATCH_BYTES, UPLOAD_FETCH_LIMIT } from '../config/env';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

// Server is idempotent, so a failed POST is retried next cycle (no data loss).

export type UploadStatus = 'idle' | 'uploaded' | 'paused' | 'error' | 'unregistered';

export interface UploadOutcome {
  status: UploadStatus;
  uploaded?: number;
  remaining?: number;
  /** True if more pending rows are waiting beyond this batch (caller should loop). */
  more?: boolean;
  error?: string;
}

export async function runLocationUpload(db: Db, deviceId: string): Promise<UploadOutcome> {
  if (await collectorMeta.isPausedCached(db)) return { status: 'paused' };

  const pending = await fixesRepo.selectPending(db, UPLOAD_FETCH_LIMIT);
  if (pending.length === 0) return { status: 'idle' };

  // PendingFix is already the wire shape; serialize directly.
  const items: BatchItem[] = pending.map((f) => {
    const json = JSON.stringify(f);
    return { seq: f.seq, json, bytes: utf8ByteLength(json) };
  });
  const batch = selectBatch(items, { maxLines: MAX_BATCH_LINES, maxBytes: MAX_BATCH_BYTES });
  const body = batch.map((b) => b.json).join('\n');
  const sentSeqs = batch.map((b) => b.seq);

  let receipt;
  try {
    const res = await ingestLocation(body);
    // The mutator throws on non-2xx; this narrows the envelope off its ProblemDetails branch.
    if (res.status !== 202) throw new Error(`ingest returned ${res.status}`);
    receipt = res.data;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await syncState.setError(db, deviceId, 'location', error);
    if (e instanceof DeviceKeyInvalidError) {
      logDebug('upload:device-key-invalid');
      return { status: 'unregistered', error };
    }
    logDebug('upload:error', error);
    return { status: 'error', error };
  }

  const plan = applyReceipt(receipt, sentSeqs);

  if (plan.deleteSeqs.length) await fixesRepo.deleteSeqs(db, plan.deleteSeqs);
  if (plan.dropRejectSeqs.length) await fixesRepo.markRejected(db, plan.dropRejectSeqs, 'permanent_reject');
  if (plan.batchTooLarge) logDebug('upload:batch-too-large', `sent=${sentSeqs.length}`);

  await syncState.applyUploadResult(db, deviceId, 'location', {
    advanceTo: plan.advanceTo,
    highWaterSeq: receipt.highWaterSeq ?? null,
    receiptJson: JSON.stringify(receipt),
    at: new Date().toISOString(),
  });

  if (plan.paused) {
    await collectorMeta.setPausedCached(db, true);
    await syncState.setPaused(db, deviceId, 'location', true, null);
    logDebug('upload:paused-by-server');
    return { status: 'paused' };
  }

  const more = pending.length > batch.length;
  logDebug('upload:cycle', `sent=${sentSeqs.length} deleted=${plan.deleteSeqs.length} dropped=${plan.dropRejectSeqs.length} more=${more}`);
  return { status: 'uploaded', uploaded: plan.deleteSeqs.length, remaining: pending.length - batch.length, more };
}
