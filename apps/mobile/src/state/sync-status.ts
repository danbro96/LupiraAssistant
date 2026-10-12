import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import type { SyncStatus } from '@danbro96/lupira-sync-engine/status';
import type { ParkedOp } from '@danbro96/lupira-sync-engine/types';
import { engine } from '../sync/engine';
import { INBOX } from '../sync/inbox-module';
import { queryClient } from '../sync/queryClient';

export const SYNC_LABELS: Record<string, string> = { [INBOX]: 'inbox' };

const PARKED_KEY = [INBOX, 'parked'];
const NO_PARKED: ParkedOp[] = [];

// A park or an ack moves the queue without changing the inbox doc, so the parked list follows the counts.
let counts = '';
engine.status.subscribe(() => {
  const { pending, parked } = engine.status.getSnapshot();
  const next = `${pending}/${parked}`;
  if (next === counts) return;
  counts = next;
  void queryClient.invalidateQueries({ queryKey: PARKED_KEY });
});

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(engine.status.subscribe, engine.status.getSnapshot);
}

export function useParkedChanges(): ParkedOp[] {
  return useQuery(mirrorQuery(PARKED_KEY, () => engine.parked())).data ?? NO_PARKED;
}

export const syncNow = (): Promise<void> => engine.sync();
export const retryChange = (commandId: string): Promise<void> => engine.retry(commandId);
export const discardChange = (commandId: string): Promise<void> => engine.discard(commandId);
