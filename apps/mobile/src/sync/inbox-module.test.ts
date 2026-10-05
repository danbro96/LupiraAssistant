import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { createSyncEngine } from '@danbro96/lupira-sync-engine/engine';
import { ApiError } from '@danbro96/lupira-http/apiError';
import type { InboxItemView } from '@lupira/assistant-domain/inbox-item';

const api = vi.hoisted(() => ({
  getInbox: vi.fn(),
  resolveProposal: vi.fn(),
  answerCheckIn: vi.fn(),
  markNoticeRead: vi.fn(),
}));
vi.mock('../data/api/generated/assistant/inbox/inbox', () => api);

const { INBOX, INBOX_ID, ackOp, inboxModule } = await import('./inbox-module');

const wire = (...ids: string[]) => ({
  items: ids.map((id) => ({ id, kind: 'Proposal', title: id, createdAt: '2026-10-05T10:00:00Z' })),
});

let db: Db;
let clock: number;
const engineOver = (d: Db) =>
  createSyncEngine({ openDb: async () => d, modules: [inboxModule], cacheVersion: 1, onChange: () => {}, now: () => clock });
let engine: ReturnType<typeof engineOver>;

const visible = async () =>
  ((await engine.doc<InboxItemView[], null>(INBOX, INBOX_ID))?.doc ?? []).map((i) => i.id);
const outbox = () => db.all<{ status: string; last_status: number | null }>('SELECT status, last_status FROM outbox ORDER BY seq');

beforeEach(async () => {
  vi.resetAllMocks();
  api.getInbox.mockResolvedValue(wire('a', 'b'));
  db = openNodeDb();
  clock = Date.parse('2026-10-05T12:00:00Z');
  engine = engineOver(db);
  await engine.sync();
});

describe('a gesture', () => {
  it('hides its item at once and through a refetch that still lists it', async () => {
    api.resolveProposal.mockRejectedValue(new ApiError(0, 'offline'));
    await engine.enqueue(ackOp({ kind: 'resolve', targetId: 'a', payload: { action: 'Approve' } }));
    expect(await visible()).toEqual(['b']);

    await engine.sync();
    expect(await visible()).toEqual(['b']);
  });

  it('posts with the client action id as body field and Idempotency-Key', async () => {
    const op = ackOp({ kind: 'resolve', targetId: 'a', payload: { action: 'Edit', edits: { event: { title: 'x' } } } });
    await engine.enqueue(op);
    await engine.push();

    expect(api.resolveProposal).toHaveBeenCalledWith(
      'a',
      { action: 'Edit', edits: { event: { title: 'x' } }, clientActionId: op.commandId },
      { headers: { 'Idempotency-Key': op.commandId } },
    );
    expect(await outbox()).toEqual([]);
  });

  it('routes answers and reads to their endpoints', async () => {
    await engine.enqueue(ackOp({ kind: 'answer', targetId: 'a', payload: { skip: true } }));
    await engine.enqueue(ackOp({ kind: 'read', targetId: 'b', payload: {} }));
    await engine.push();

    expect(api.answerCheckIn).toHaveBeenCalledWith('a', expect.objectContaining({ skip: true }), expect.anything());
    expect(api.markNoticeRead).toHaveBeenCalledWith('b', { clientActionId: expect.any(String) }, expect.anything());
  });

  it('stays gone once acknowledged, before the next fetch', async () => {
    await engine.enqueue(ackOp({ kind: 'read', targetId: 'a', payload: {} }));
    await engine.push();
    expect(await visible()).toEqual(['b']);
  });
});

describe('failures', () => {
  it('keeps a transient failure queued and replays it after the backoff', async () => {
    api.resolveProposal.mockRejectedValueOnce(new ApiError(503, 'down'));
    await engine.enqueue(ackOp({ kind: 'resolve', targetId: 'a', payload: { action: 'Approve' } }));
    await engine.push();
    expect(await outbox()).toEqual([{ status: 'pending', last_status: 503 }]);

    clock += 60 * 60_000;
    await engine.push();
    expect(api.resolveProposal).toHaveBeenCalledTimes(2);
    expect(await outbox()).toEqual([]);
  });

  it('parks a rejected gesture, keeps its item hidden, and lets other items through', async () => {
    api.resolveProposal.mockRejectedValueOnce(new ApiError(409, 'resolved elsewhere'));
    await engine.enqueue(ackOp({ kind: 'resolve', targetId: 'a', payload: { action: 'Approve' } }));
    await engine.enqueue(ackOp({ kind: 'read', targetId: 'b', payload: {} }));
    await engine.push();

    expect(await outbox()).toEqual([{ status: 'parked', last_status: 409 }]);
    expect(api.markNoticeRead).toHaveBeenCalledOnce();
    expect(await engine.parked()).toMatchObject([{ op: { kind: 'resolve', targetId: 'a' }, lastStatus: 409 }]);
    expect(await visible()).toEqual([]);
  });

  it('survives a restart with the gesture still queued', async () => {
    api.resolveProposal.mockRejectedValueOnce(new ApiError(0, 'offline'));
    await engine.enqueue(ackOp({ kind: 'resolve', targetId: 'a', payload: { action: 'Dismiss' } }));
    await engine.push();

    engine = engineOver(db);
    expect(await visible()).toEqual(['b']);
    clock += 60 * 60_000;
    await engine.sync();
    expect(api.resolveProposal).toHaveBeenCalledTimes(2);
    expect(await outbox()).toEqual([]);
  });
});
