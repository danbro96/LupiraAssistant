import { describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const tasks = vi.hoisted(() => new Map<string, () => Promise<unknown>>());
vi.mock('expo-task-manager', () => ({ defineTask: (name: string, run: () => Promise<unknown>) => tasks.set(name, run) }));
vi.mock('expo-background-task', () => ({ BackgroundTaskResult: { Success: 1 } }));
vi.mock('react-native', () => ({ AppState: {} }));
vi.mock('@react-native-community/netinfo', () => ({ default: {} }));
vi.mock('../sync/engine', () => ({ engine: { sync: async () => calls.push('sync') } }));
vi.mock('./auth-store', () => {
  const state = { loaded: false, load: async () => { calls.push('load'); state.loaded = true; } };
  return { useAuth: { getState: () => state } };
});

const { SYNC_TASK } = await import('./background-sync-task');

describe('background sync task', () => {
  it('loads the session before syncing, once per JS context', async () => {
    await tasks.get(SYNC_TASK)!();
    await tasks.get(SYNC_TASK)!();
    expect(calls).toEqual(['load', 'sync', 'sync']);
  });
});
