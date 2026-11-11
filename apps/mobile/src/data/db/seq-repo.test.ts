import { beforeEach, describe, expect, it } from 'vitest';
import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from './db';
import { SCHEMA_SQL } from './schema';
import { nextSeq } from './seq-repo';
import type { Stream } from '../../domain/seq';

let db: Db;

beforeEach(async () => {
  const node = openNodeDb();
  await node.exec(SCHEMA_SQL);
  db = { getFirstAsync: node.first } as unknown as Db;
});

describe('nextSeq', () => {
  it('advances by exactly one per call, per stream', async () => {
    expect(await nextSeq(db, 'ring')).toBe(1);
    expect(await nextSeq(db, 'ring')).toBe(2);
    expect(await nextSeq(db, 'summaries')).toBe(1);
    expect(await nextSeq(db, 'ring')).toBe(3);
    expect(await nextSeq(db, 'summaries')).toBe(2);
  });

  it('throws for a stream without a counter row', async () => {
    await expect(nextSeq(db, 'unknown' as Stream)).rejects.toThrow("seq_counter row missing for stream 'unknown'");
  });
});
