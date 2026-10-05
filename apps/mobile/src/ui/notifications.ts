import * as Notifications from 'expo-notifications';
import { routeNotice, type NoticeData } from './navigation/notification-routing';
import { syncNow } from '../state/sync-status';

// Foreground presentation + tap routing, wired once at the root. A notice is only ever a wake signal:
// on arrival we refresh the inbox so the real item (fetched from the hub) is already there when the
// user opens it.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Subscribe to arrival + tap; returns an unsubscribe. Call once from App.tsx. */
export function startNotificationHandling(): () => void {
  const received = Notifications.addNotificationReceivedListener(() => {
    void syncNow();
  });

  const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
    void syncNow();
    routeNotice(response.notification.request.content.data as NoticeData | undefined);
  });

  return () => {
    received.remove();
    tapped.remove();
  };
}

/** Route a notice that launched the app from cold (no listener was mounted yet). */
export async function handleLaunchNotice(): Promise<void> {
  const initial = await Notifications.getLastNotificationResponseAsync();
  if (initial) routeNotice(initial.notification.request.content.data as NoticeData | undefined);
}
