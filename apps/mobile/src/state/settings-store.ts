import { create } from 'zustand';
import { getPreferences, setPreferences } from '../data/api/generated/assistant/profile/profile';
import { listConnectors } from '../data/api/generated/comms/archive/archive';
import type { PreferencesResponse, PreferencesUpdateRequest } from '../data/api/generated/assistant/models';
import type { ConnectorStatusDto } from '../data/api/generated/comms/models';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

// Delivery preferences (hub) + capture status (comms). Both are online reads; preferences write
// straight through — they're the user's own config, so there's no consent gate and no ack queue.

const ok = <T,>(res: { data: unknown }): T => res.data as T;

interface SettingsState {
  preferences: PreferencesResponse | null;
  savingPreferences: boolean;
  connectors: ConnectorStatusDto[];
  loadingConnectors: boolean;
}

interface SettingsActions {
  loadPreferences: () => Promise<void>;
  savePreferences: (update: PreferencesUpdateRequest) => Promise<boolean>;
  loadConnectors: () => Promise<void>;
}

export const useSettings = create<SettingsState & SettingsActions>((set) => ({
  preferences: null,
  savingPreferences: false,
  connectors: [],
  loadingConnectors: false,

  loadPreferences: async () => {
    try {
      set({ preferences: ok<PreferencesResponse>(await getPreferences()) });
    } catch (e) {
      logDebug('settings:preferences-error', e instanceof Error ? e.message : String(e));
    }
  },

  savePreferences: async (update) => {
    set({ savingPreferences: true });
    try {
      set({ preferences: ok<PreferencesResponse>(await setPreferences(update)) });
      return true;
    } catch (e) {
      logDebug('settings:preferences-save-error', e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      set({ savingPreferences: false });
    }
  },

  loadConnectors: async () => {
    set({ loadingConnectors: true });
    try {
      set({ connectors: ok<ConnectorStatusDto[]>(await listConnectors()), loadingConnectors: false });
    } catch (e) {
      logDebug('settings:connectors-error', e instanceof Error ? e.message : String(e));
      set({ loadingConnectors: false });
    }
  },
}));
