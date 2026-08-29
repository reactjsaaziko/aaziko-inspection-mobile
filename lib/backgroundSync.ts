import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { processQueue } from '@/lib/uploadQueue';

/**
 * Best-effort background sync: the OS wakes the app periodically (min ~15 min,
 * OS-controlled) and drains the offline upload queue even when the app is closed.
 * Foreground sync (connectivity watcher) does the heavy lifting; this is the
 * belt-and-suspenders for the app-fully-closed case.
 *
 * The task MUST be defined at module scope so expo-task-manager can invoke it on
 * a cold background launch — hence this module is imported from the root layout.
 * Background tasks don't run in Expo Go; they need a dev/standalone build.
 */
export const BACKGROUND_SYNC_TASK = 'inspection-upload-sync';

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    await processQueue();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    // Only register when the OS reports background tasks are available.
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;
    const already = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (already) return;
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: 15 });
  } catch {
    // Unavailable (Expo Go / restricted device) — foreground sync still works.
  }
}
