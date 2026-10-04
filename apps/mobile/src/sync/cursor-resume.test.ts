import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../data/db/db';

vi.mock('@danbro96/lupira-expo-diagnostics/log', () => ({ logDebug: vi.fn() }));

const fixesRepo = { deleteUpTo: vi.fn() };
const seqRepo = { ensureAtLeast: vi.fn() };
const syncState = { setCursor: vi.fn(), setPaused: vi.fn() };
const collectorMeta = { setPausedCached: vi.fn() };
const getIngestCursor = vi.fn();
const getIngestState = vi.fn();

vi.mock('../data/db/pending-fixes-repo', () => fixesRepo);
vi.mock('../data/db/seq-repo', () => seqRepo);
vi.mock('../data/db/sync-state-repo', () => syncState);
vi.mock('../data/db/collector-meta-repo', () => collectorMeta);
vi.mock('../data/api/generated/location-ingest/ingest/ingest', () => ({
  getIngestCursor: () => getIngestCursor(),
  getIngestState: () => getIngestState(),
}));

const { resumeFromCursor } = await import('./cursor-resume');
const { pollTrackingState } = await import('./pause-poll');

const db = {} as Db;
const DEVICE = 'dev-1';

beforeEach(() => vi.clearAllMocks());

describe('resumeFromCursor', () => {
  it('does nothing when the cursor call fails', async () => {
    getIngestCursor.mockResolvedValue({ status: 500, data: {} });
    await resumeFromCursor(db, DEVICE);
    expect(fixesRepo.deleteUpTo).not.toHaveBeenCalled();
    expect(syncState.setCursor).not.toHaveBeenCalled();
  });

  it('drops accepted rows and lifts the local counter to the server high-water', async () => {
    getIngestCursor.mockResolvedValue({ status: 200, data: { lastSeq: 42 } });
    await resumeFromCursor(db, DEVICE);
    expect(fixesRepo.deleteUpTo).toHaveBeenCalledWith(db, 42);
    expect(seqRepo.ensureAtLeast).toHaveBeenCalledWith(db, 'location', 42);
    expect(syncState.setCursor).toHaveBeenCalledWith(db, DEVICE, 'location', 42);
  });

  it('records a null cursor on a fresh device without touching the queue', async () => {
    getIngestCursor.mockResolvedValue({ status: 200, data: { lastSeq: null } });
    await resumeFromCursor(db, DEVICE);
    expect(fixesRepo.deleteUpTo).not.toHaveBeenCalled();
    expect(syncState.setCursor).toHaveBeenCalledWith(db, DEVICE, 'location', null);
  });
});

describe('pollTrackingState', () => {
  it('reports not-paused and writes nothing when the call fails', async () => {
    getIngestState.mockResolvedValue({ status: 503, data: {} });
    await expect(pollTrackingState(db, DEVICE)).resolves.toBe(false);
    expect(syncState.setPaused).not.toHaveBeenCalled();
    expect(collectorMeta.setPausedCached).not.toHaveBeenCalled();
  });

  it('writes the paused flag to both the UI row and the collector cache', async () => {
    getIngestState.mockResolvedValue({ status: 200, data: { paused: true, reason: 'quota' } });
    await expect(pollTrackingState(db, DEVICE)).resolves.toBe(true);
    expect(syncState.setPaused).toHaveBeenCalledWith(db, DEVICE, 'location', true, 'quota');
    expect(collectorMeta.setPausedCached).toHaveBeenCalledWith(db, true);
  });
});
