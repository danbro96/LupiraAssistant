import type { ExpoConfig } from 'expo/config';

// Native android/ios dirs are generated and git-ignored. The plugin + permission blocks below are load-bearing for background telemetry.

const LOCATION_ALWAYS_RATIONALE =
  'Lupira Assistant keeps recording your location in the background — even when the app is closed — '
  + 'so your trips are captured without you having to open it.';
const LOCATION_WHEN_IN_USE_RATIONALE =
  'Lupira Assistant records your location to track trips and the time you spend at places.';
const MOTION_RATIONALE =
  'Lupira Assistant uses motion and step data to tell walking, running, cycling and driving apart so '
  + 'it can sample less often when you are still and save battery.';

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
    infoPlist: {
      // Only 'location'; expo-background-task appends its own 'processing' mode + BGTaskScheduler ids.
      UIBackgroundModes: ['location'],
      NSLocationWhenInUseUsageDescription: LOCATION_WHEN_IN_USE_RATIONALE,
      NSLocationAlwaysAndWhenInUseUsageDescription: LOCATION_ALWAYS_RATIONALE,
      NSMotionUsageDescription: MOTION_RATIONALE,
    },
  },
  android: {
    package: 'com.lupira.assistant',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0F172A' },
    predictiveBackGestureEnabled: false,
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'ACTIVITY_RECOGNITION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
    ],
  },
  plugins: [
    'expo-secure-store',
    'expo-sqlite',
    'expo-web-browser',
    'expo-notifications',
    [
      'expo-location',
      {
        // Lets startLocationUpdatesAsync run with the app backgrounded/killed.
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        locationAlwaysAndWhenInUsePermission: LOCATION_ALWAYS_RATIONALE,
        locationWhenInUsePermission: LOCATION_WHEN_IN_USE_RATIONALE,
      },
    ],
    'expo-task-manager',
    [
      'expo-sensors',
      { motionPermission: MOTION_RATIONALE },
    ],
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
