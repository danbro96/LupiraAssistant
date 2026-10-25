import { DeveloperScreen as DiagnosticsScreen } from '@danbro96/lupira-expo-diagnostics/DeveloperScreen';
import { API_PRESETS, DIAGNOSTIC_ROUTES } from '../../config/env';
import { useAuth } from '../../state/auth-store';
import { useSyncStatus } from '../../state/sync-status';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';

/** Reachable from Settings and from the login screen (switching backends must not require signing in first). */
export function DeveloperScreen() {
  const { apiUrl, authMode } = useAuth();
  const sync = useSyncStatus();
  return (
    <DiagnosticsScreen
      presets={API_PRESETS}
      diagnosticRoutes={DIAGNOSTIC_ROUTES}
      apiUrl={apiUrl}
      authMode={authMode}
      onSelectBackend={(urls, mode) => {
        useAuth.getState().setBackend(urls, mode).catch(() => toastError('Could not switch backend'));
      }}
      customUrlPlaceholder="http://host:5183"
      syncState={sync}
    />
  );
}
