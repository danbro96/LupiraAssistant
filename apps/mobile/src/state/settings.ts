import { useMutation, useQuery } from '@tanstack/react-query';
import { onlineQuery } from '@danbro96/lupira-expo-query/onlineQuery';
import { getPreferences, setPreferences } from '../data/api/generated/assistant/profile/profile';
import { listConnectors } from '../data/api/generated/comms/archive/archive';
import type { PreferencesResponse, PreferencesUpdateRequest } from '../data/api/generated/assistant/models';
import { queryClient } from '../sync/queryClient';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

// Delivery preferences (hub) + capture status (comms). Both are online reads; preferences write
// straight through — they're the user's own config, so there's no consent gate and no ack queue.

const PREFERENCES_KEY = ['assistant', 'preferences'];

export function usePreferences(): PreferencesResponse | null {
  return useQuery(onlineQuery(PREFERENCES_KEY, () => getPreferences())).data ?? null;
}

export function useSavePreferences() {
  const mutation = useMutation({
    mutationFn: (update: PreferencesUpdateRequest) => setPreferences(update),
    onSuccess: (saved) => queryClient.setQueryData(PREFERENCES_KEY, saved),
  });
  return {
    saving: mutation.isPending,
    save: (update: PreferencesUpdateRequest): Promise<boolean> =>
      mutation.mutateAsync(update).then(
        () => true,
        (e: unknown) => {
          logDebug('settings:preferences-save-error', e instanceof Error ? e.message : String(e));
          return false;
        },
      ),
  };
}

export const useConnectors = () => useQuery(onlineQuery(['comms', 'connectors'], () => listConnectors()));
