import type { ExpoConfig } from 'expo/config';

// Native android/ios dirs are generated and git-ignored.

const config: ExpoConfig = {
  name: 'Lupira Assistant',
  slug: 'lupiraassistant',
  scheme: 'lupiraassistant',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  primaryColor: '#E76F51',
  // Fingerprint: a JS-only change keeps the runtime version and ships OTA; a native change needs a build.
  runtimeVersion: { policy: 'fingerprint' },
  experiments: { reactCompiler: true },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.lupira.assistant',
  },
  android: {
    package: 'com.lupira.assistant',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0F172A' },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-secure-store',
    'expo-sqlite',
    'expo-web-browser',
    'expo-notifications',
    'expo-task-manager',
    'expo-background-task',
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 180, resizeMode: 'contain', backgroundColor: '#0F172A' },
    ],
    'expo-status-bar',
    'expo-font',
  ],
  owner: 'danbro96',
  updates: { url: 'https://u.expo.dev/89b3a2d6-094e-4419-bbfd-b3af9b3c50c8' },
  extra: { eas: { projectId: '89b3a2d6-094e-4419-bbfd-b3af9b3c50c8' } },
};

export default config;
