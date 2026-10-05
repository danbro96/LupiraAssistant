import { useEffect } from 'react';
import { Text, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { connectOnlineManager } from '@danbro96/lupira-expo-query/online';
import { connectFocusManager } from '@danbro96/lupira-expo-query/focus';
import { startSyncTriggers } from '@danbro96/lupira-sync-engine/expo/triggers';
import { RootStack } from './src/ui/navigation/RootStack';
import { useAutoUpdate } from '@danbro96/lupira-expo-diagnostics/useAutoUpdate';
import { navigationRef } from './src/ui/navigation/notification-routing';
import { startNotificationHandling, handleLaunchNotice } from './src/ui/notifications';
import { registerPushToken } from './src/data/push/push-registration';
import { ToastHost } from '@danbro96/lupira-expo-paper/components/ToastHost';
import { ConfirmDialogHost } from '@danbro96/lupira-expo-paper/components/ConfirmDialog';
import { useAuth } from './src/state/auth-store';
import { usePrefs } from './src/state/prefs-store';
import { engine } from './src/sync/engine';
import { SYNC_TASK } from './src/state/background-sync-task';
import { queryClient, persistOptions } from './src/sync/queryClient';
import { SENTRY_DSN } from './src/config/env';
import { initSentry } from '@danbro96/lupira-expo-diagnostics/initSentry';
import { lightColors, darkColors, navDark, navLight, paperDark, paperLight, type Palette } from './src/ui/theme';
import { paperSettings } from '@danbro96/lupira-expo-paper/theme/paperSettings';

// SENTRY_DSN is a public client key; Sentry no-ops when empty.
initSentry(SENTRY_DSN);
connectOnlineManager();
connectFocusManager();

function ErrorFallback({ palette }: { palette: Palette }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: palette.bg }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: palette.text, marginBottom: 8 }}>Something went wrong</Text>
      <Text style={{ color: palette.textMuted, textAlign: 'center' }}>
        The app hit an unexpected error. Please reopen it.
      </Text>
    </View>
  );
}

function App() {
  useAutoUpdate();
  const authLoaded = useAuth((s) => s.loaded);
  const scheme = useColorScheme();

  useEffect(() => {
    let stopTriggers = () => {};
    void (async () => {
      await Promise.all([useAuth.getState().load(), usePrefs.getState().init()]);
      await useAuth.getState().refreshIfNeeded();
      stopTriggers = startSyncTriggers(engine, { backgroundTaskName: SYNC_TASK, registerBackgroundTask: !__DEV__ });
      // Signed in → keep the hub's push registry current, then honor a cold-start notice tap.
      if (useAuth.getState().isAuthenticated()) void registerPushToken();
      void handleLaunchNotice();
    })();
    const stopNotifications = startNotificationHandling();
    return () => {
      stopTriggers();
      stopNotifications();
    };
  }, []);

  if (!authLoaded) return null;

  const palette = scheme === 'dark' ? darkColors : lightColors;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
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
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);
