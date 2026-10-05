import type { Db } from './db';
import type { Stream } from '../../domain/seq';

// SQLite is the single source of truth: a JS counter would collide across the foreground + background JS contexts.

/** Run inside the insert transaction so a seq is never burned without a durable row. */
export async function nextSeq(db: Db, stream: Stream): Promise<number> {
  const row = await db.getFirstAsync<{ last_seq: number }>(
    `UPDATE seq_counter SET last_seq = last_seq + 1 WHERE stream = ? RETURNING last_seq`,
    [stream],
  );
  if (!row) throw new Error(`seq_counter row missing for stream '${stream}'`);
  return row.last_seq;
}
