// Must be first: polyfill global `crypto` before any module that mints a uuid loads.
import '@danbro96/lupira-expo-oidc/crypto';

// Must be imported once in the entry file, before any react-native rendering.
import 'react-native-gesture-handler';

// defineTask() must run during cold start of the OS's bare JS context, so register at module top level.
import './src/sync/background-upload-task';

import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
