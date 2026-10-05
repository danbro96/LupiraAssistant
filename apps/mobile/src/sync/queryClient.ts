import Constants from 'expo-constants';
import { createAppQueryClient } from '@danbro96/lupira-expo-query/queryClient';

export const { queryClient, persistOptions } = createAppQueryClient({
  persistRoots: ['assistant', 'comms'],
  buster: Constants.expoConfig?.version ?? '',
});
