import { defineSyncTask } from '@danbro96/lupira-sync-engine/expo/triggers';
import { engine } from '../sync/engine';
import { useAuth } from './auth-store';

// Defined at module top level: registered during the headless context's cold start, where nothing has loaded the session.

export const SYNC_TASK = 'lupira.assistant.upload';

defineSyncTask(SYNC_TASK, engine, async () => {
  if (!useAuth.getState().loaded) await useAuth.getState().load();
});
