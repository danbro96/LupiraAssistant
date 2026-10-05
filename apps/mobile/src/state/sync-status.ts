import { useSyncExternalStore } from 'react';
import type { SyncStatus } from '@danbro96/lupira-sync-engine/status';
import { engine } from '../sync/engine';

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(engine.status.subscribe, engine.status.getSnapshot);
}

export const syncNow = (): Promise<void> => engine.sync();
