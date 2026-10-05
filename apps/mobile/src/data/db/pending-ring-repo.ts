import type { Db } from './db';
import { nextSeq } from './seq-repo';

// Phase 2 — populated when Health Connect / HealthKit is wired. Same store-and-forward shape as pending-fixes.

export type RingKind = 'hr' | 'hrv' | 'spo2' | 'skin_temp' | 'steps' | 'activity';

export interface RingSample {
  kind: RingKind;
  ts: string;
  value: number;
}

export interface PendingRingSample extends RingSample {
  seq: number;
}

export async function enqueueRingSamples(db: Db, samples: readonly RingSample[], createdAtMs: number): Promise<number[]> {
  const seqs: number[] = [];
  await db.withTransactionAsync(async () => {
    for (const s of samples) {
      const seq = await nextSeq(db, 'ring');
      await db.runAsync(
        `INSERT OR IGNORE INTO pending_ring (seq, kind, ts, value, status, reject_reason, created_at)
         VALUES (?, ?, ?, ?, 0, NULL, ?)`,
        [seq, s.kind, s.ts, s.value, createdAtMs],
      );
      seqs.push(seq);
    }
  });
  return seqs;
}

interface RingRow {
  seq: number;
  kind: string;
  ts: string;
  value: number;
}

export async function selectPending(db: Db, limit: number): Promise<PendingRingSample[]> {
  const rows = await db.getAllAsync<RingRow>(
    `SELECT seq, kind, ts, value FROM pending_ring WHERE status = 0 ORDER BY seq ASC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({ seq: r.seq, kind: r.kind as RingKind, ts: r.ts, value: r.value }));
}

export async function deleteSeqs(db: Db, seqs: readonly number[]): Promise<void> {
  if (seqs.length === 0) return;
  const placeholders = seqs.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM pending_ring WHERE seq IN (${placeholders})`, [...seqs]);
}

export async function markRejected(db: Db, seqs: readonly number[], reason: string): Promise<void> {
  if (seqs.length === 0) return;
  const placeholders = seqs.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE pending_ring SET status = 2, reject_reason = ? WHERE seq IN (${placeholders})`,
    [reason, ...seqs],
  );
}

export async function clearAll(db: Db): Promise<void> {
  await db.runAsync(`DELETE FROM pending_ring`);
}
