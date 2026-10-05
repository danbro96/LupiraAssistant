import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { kickSync } from './sync-engine';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

// Defined at module top level: registered during the headless context's cold start.

export const UPLOAD_TASK = 'lupira.assistant.upload';

TaskManager.defineTask(UPLOAD_TASK, async () => {
  try {
    await kickSync();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    logDebug('bg-upload:error', e instanceof Error ? e.message : String(e));
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Register the periodic upload task (idempotent). Call once from App.tsx. */
export async function registerUploadTask(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      logDebug('bg-upload:restricted');
      return;
    }
    const registered = await TaskManager.isTaskRegisteredAsync(UPLOAD_TASK);
    if (!registered) {
      await BackgroundTask.registerTaskAsync(UPLOAD_TASK, { minimumInterval: 15 }); // minutes
      logDebug('bg-upload:registered');
    }
  } catch (e) {
    logDebug('bg-upload:register-error', e instanceof Error ? e.message : String(e));
  }
}
