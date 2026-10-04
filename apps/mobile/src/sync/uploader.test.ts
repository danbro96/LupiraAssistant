import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../data/db/db';

vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '0.0.0' } } }));
vi.mock('@danbro96/lupira-expo-diagnostics/log', () => ({ logDebug: vi.fn() }));

const fixesRepo = {
  selectPending: vi.fn(),
  deleteSeqs: vi.fn(),
  markRejected: vi.fn(),
};
const syncState = { setError: vi.fn(), applyUploadResult: vi.fn(), setPaused: vi.fn() };
const collectorMeta = { isPausedCached: vi.fn(), setPausedCached: vi.fn() };
const ingestLocation = vi.fn();

vi.mock('../data/db/pending-fixes-repo', () => fixesRepo);
vi.mock('../data/db/sync-state-repo', () => syncState);
vi.mock('../data/db/collector-meta-repo', () => collectorMeta);
vi.mock('../data/api/generated/location-ingest/ingest/ingest', () => ({
  ingestLocation: (...args: unknown[]) => ingestLocation(...args),
}));

const { runLocationUpload } = await import('./uploader');
const { DeviceKeyInvalidError } = await import('../domain/api-error');

const db = {} as Db;
const DEVICE = 'dev-1';

function fix(seq: number) {
  return { seq, ts: `2026-01-01T00:00:0${seq}Z`, lat: 1, lon: 2 };
}
/** Nothing rejected = everything sent is server-confirmed. */
const accepted = (highWaterSeq: number) => ({ status: 202, data: { rejects: [], highWaterSeq } });

beforeEach(() => {
  vi.clearAllMocks();
  collectorMeta.isPausedCached.mockResolvedValue(false);
  fixesRepo.selectPending.mockResolvedValue([]);
  fixesRepo.deleteSeqs.mockResolvedValue(undefined);
  fixesRepo.markRejected.mockResolvedValue(undefined);
  syncState.setError.mockResolvedValue(undefined);
  syncState.applyUploadResult.mockResolvedValue(undefined);
  syncState.setPaused.mockResolvedValue(undefined);
  collectorMeta.setPausedCached.mockResolvedValue(undefined);
});

describe('runLocationUpload', () => {
  it('short-circuits while the collector is paused, without reading the queue', async () => {
    collectorMeta.isPausedCached.mockResolvedValue(true);
    await expect(runLocationUpload(db, DEVICE)).resolves.toEqual({ status: 'paused' });
    expect(fixesRepo.selectPending).not.toHaveBeenCalled();
    expect(ingestLocation).not.toHaveBeenCalled();
  });

  it('is idle with nothing pending', async () => {
    await expect(runLocationUpload(db, DEVICE)).resolves.toEqual({ status: 'idle' });
    expect(ingestLocation).not.toHaveBeenCalled();
  });

  it('posts newline-delimited JSON and deletes what the receipt accepted', async () => {
    fixesRepo.selectPending.mockResolvedValue([fix(1), fix(2)]);
    ingestLocation.mockResolvedValue(accepted(2));

    const out = await runLocationUpload(db, DEVICE);

    expect(ingestLocation.mock.calls[0][0].split('\n')).toHaveLength(2);
    expect(fixesRepo.deleteSeqs).toHaveBeenCalledWith(db, [1, 2]);
    expect(out).toMatchObject({ status: 'uploaded', uploaded: 2, more: false });
  });

  it('reports `more` when the queue outruns one batch', async () => {
    // 12k rows exceeds MAX_BATCH_LINES (9k), so selectBatch truncates and the caller must loop.
    fixesRepo.selectPending.mockResolvedValue(Array.from({ length: 12_000 }, (_, i) => fix(i + 1)));
    ingestLocation.mockImplementation((body: string) => {
      const seqs = body.split('\n').map((l) => JSON.parse(l).seq as number);
      return Promise.resolve(accepted(Math.max(...seqs)));
    });

    const out = await runLocationUpload(db, DEVICE);

    expect(out.status).toBe('uploaded');
    expect(out.more).toBe(true);
    expect(out.remaining).toBeGreaterThan(0);
  });

  it('records the error and keeps the rows when the post fails', async () => {
    fixesRepo.selectPending.mockResolvedValue([fix(1)]);
    ingestLocation.mockRejectedValue(new Error('network down'));

    const out = await runLocationUpload(db, DEVICE);

    expect(out).toMatchObject({ status: 'error', error: 'network down' });
    expect(syncState.setError).toHaveBeenCalledWith(db, DEVICE, 'location', 'network down');
    expect(fixesRepo.deleteSeqs).not.toHaveBeenCalled();
  });

  it('surfaces an invalid device key as unregistered so the caller can re-register', async () => {
    fixesRepo.selectPending.mockResolvedValue([fix(1)]);
    ingestLocation.mockRejectedValue(new DeviceKeyInvalidError('key rejected'));

    const out = await runLocationUpload(db, DEVICE);

    expect(out.status).toBe('unregistered');
    expect(fixesRepo.deleteSeqs).not.toHaveBeenCalled();
  });

  it('caches the paused flag when the server pauses mid-receipt', async () => {
    fixesRepo.selectPending.mockResolvedValue([fix(1)]);
    ingestLocation.mockResolvedValue({ status: 202, data: { rejects: [], paused: true, highWaterSeq: 1 } });

    const out = await runLocationUpload(db, DEVICE);

    expect(out.status).toBe('paused');
    expect(collectorMeta.setPausedCached).toHaveBeenCalledWith(db, true);
    expect(syncState.setPaused).toHaveBeenCalledWith(db, DEVICE, 'location', true, null);
  });

  it('drops permanently rejected rows instead of retrying them forever', async () => {
    fixesRepo.selectPending.mockResolvedValue([fix(1), fix(2)]);
    ingestLocation.mockResolvedValue({
      status: 202,
      data: { rejects: [{ seq: 2, reason: 'invalid_latlon' }], highWaterSeq: 2 },
    });

    await runLocationUpload(db, DEVICE);

    expect(fixesRepo.markRejected).toHaveBeenCalled();
    expect(fixesRepo.markRejected.mock.calls[0][1]).toContain(2);
  });
});
