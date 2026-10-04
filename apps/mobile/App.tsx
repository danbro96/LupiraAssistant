import { useEffect } from 'react';
import { Text, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { RootStack } from './src/ui/navigation/RootStack';
import { useAutoUpdate } from './src/ui/hooks/useAutoUpdate';
import { navigationRef } from './src/ui/navigation/notification-routing';
import { startNotificationHandling, handleLaunchNotice } from './src/ui/notifications';
import { registerPushToken } from './src/data/push/push-registration';
import { ToastHost } from './src/ui/components/ToastHost';
import { ConfirmDialogHost } from './src/ui/components/ConfirmDialog';
import { useAuth } from './src/state/auth-store';
import { useDevice } from './src/state/device-store';
import { useInbox } from './src/state/inbox-store';
import { useCollector } from './src/state/collector-store';
import { usePrefs } from './src/state/prefs-store';
import { startSyncTriggers, kickSync } from './src/sync/sync-engine';
import { registerUploadTask } from './src/sync/background-upload-task';
import { SENTRY_DSN } from './src/config/env';
import { UPDATE_CHANNEL, UPDATE_ID } from './src/ui/buildInfo';
import { lightColors, darkColors, navDark, navLight, paperDark, paperLight, type Palette } from './src/ui/theme';
import { paperSettings } from './src/ui/theme/paperSettings';

// SENTRY_DSN is a public client key; Sentry no-ops when empty.
Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  tracesSampleRate: 0.2,
  sendDefaultPii: false,
  environment: __DEV__ ? 'development' : 'production',
});
Sentry.setTag('update_id', UPDATE_ID ?? 'none');
Sentry.setTag('update_channel', UPDATE_CHANNEL ?? 'none');

function ErrorFallback({ palette }: { palette: Palette }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: palette.bg }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: palette.text, marginBottom: 8 }}>Something went wrong</Text>
      <Text style={{ color: palette.textMuted, textAlign: 'center' }}>
        The app hit an unexpected error. Please reopen it — your buffered fixes are saved on this device.
      </Text>
    </View>
  );
}

function App() {
  useAutoUpdate();
  const authLoaded = useAuth((s) => s.loaded);
  const deviceLoaded = useDevice((s) => s.loaded);
  const scheme = useColorScheme();

  useEffect(() => {
    void (async () => {
      await Promise.all([
        useAuth.getState().load(),
        useDevice.getState().load(),
        useInbox.getState().loadFromCache(),
        usePrefs.getState().init(),
      ]);
      await useAuth.getState().refreshIfNeeded();
      await useCollector.getState().hydrate();
      await registerUploadTask();
      void kickSync({ resume: true, poll: true });
      // Signed in → keep the hub's push registry current, then honor a cold-start notice tap.
      if (useAuth.getState().isAuthenticated()) void registerPushToken();
      void handleLaunchNotice();
    })();
    const stopTriggers = startSyncTriggers();
    const stopNotifications = startNotificationHandling();
    return () => {
      stopTriggers();
      stopNotifications();
    };
  }, []);

  if (!authLoaded || !deviceLoaded) return null;

  const palette = scheme === 'dark' ? darkColors : lightColors;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={scheme === 'dark' ? paperDark : paperLight} settings={paperSettings}>
          <Sentry.ErrorBoundary fallback={<ErrorFallback palette={palette} />}>
            <ConfirmDialogHost>
              <NavigationContainer ref={navigationRef} theme={scheme === 'dark' ? navDark : navLight}>
                <RootStack />
              </NavigationContainer>
            </ConfirmDialogHost>
          </Sentry.ErrorBoundary>
          <ToastHost />
          <StatusBar style="auto" />
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);
