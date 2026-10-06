import { createSyncEngine } from '@danbro96/lupira-sync-engine/engine';
import { expoDb } from '@danbro96/lupira-expo-sqlite/expoDb';
import { invalidateOnChange } from '@danbro96/lupira-expo-query/invalidateOnChange';
import type { InboxItemView } from '@lupira/assistant-domain/inbox-item';
import { DB_NAME } from '../data/db/db';
import { INBOX, INBOX_ID, inboxModule } from './inbox-module';
import { queryClient } from './queryClient';

export const engine = createSyncEngine({
  openDb: expoDb(DB_NAME, { serializeStatements: true }),
  modules: [inboxModule],
  cacheVersion: 1,
  onChange: invalidateOnChange(queryClient),
});

export async function readInbox(): Promise<InboxItemView[]> {
  return (await engine.doc<InboxItemView[], null>(INBOX, INBOX_ID))?.doc ?? [];
}
