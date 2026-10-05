import type { Db } from './db';
import { nextSeq } from './seq-repo';

// Phase 2. Server `kind` is an INTEGER (smallint); periods are camelCase on the wire.

export interface DeviceSummary {
  kind: number;
  periodStart: string;
  periodEnd: string;
  payload: Record<string, unknown>;
}

export interface PendingSummary extends DeviceSummary {
  seq: number;
}

export async function enqueueSummaries(db: Db, summaries: readonly DeviceSummary[], createdAtMs: number): Promise<number[]> {
  const seqs: number[] = [];
  await db.withTransactionAsync(async () => {
    for (const s of summaries) {
      const seq = await nextSeq(db, 'summaries');
      await db.runAsync(
        `INSERT OR IGNORE INTO pending_summaries
           (seq, kind, period_start, period_end, payload_json, status, reject_reason, created_at)
         VALUES (?, ?, ?, ?, ?, 0, NULL, ?)`,
        [seq, s.kind, s.periodStart, s.periodEnd, JSON.stringify(s.payload), createdAtMs],
      );
      seqs.push(seq);
    }
  });
  return seqs;
}

interface SummaryRow {
  seq: number;
  kind: number;
  period_start: string;
  period_end: string;
  payload_json: string;
}

export async function selectPending(db: Db, limit: number): Promise<PendingSummary[]> {
  const rows = await db.getAllAsync<SummaryRow>(
    `SELECT seq, kind, period_start, period_end, payload_json FROM pending_summaries
     WHERE status = 0 ORDER BY seq ASC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    seq: r.seq,
    kind: r.kind,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    payload: safeParse(r.payload_json),
  }));
}

export async function deleteSeqs(db: Db, seqs: readonly number[]): Promise<void> {
  if (seqs.length === 0) return;
  const placeholders = seqs.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM pending_summaries WHERE seq IN (${placeholders})`, [...seqs]);
}

export async function markRejected(db: Db, seqs: readonly number[], reason: string): Promise<void> {
  if (seqs.length === 0) return;
  const placeholders = seqs.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE pending_summaries SET status = 2, reject_reason = ? WHERE seq IN (${placeholders})`,
    [reason, ...seqs],
  );
}

export async function clearAll(db: Db): Promise<void> {
  await db.runAsync(`DELETE FROM pending_summaries`);
}

function safeParse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}
