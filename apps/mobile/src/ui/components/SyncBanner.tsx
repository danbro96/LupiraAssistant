import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { bannerState } from '@danbro96/lupira-sync-engine/bannerState';
import { useOnline } from '@danbro96/lupira-expo-query/online';
import { StatusBanner } from '@danbro96/lupira-expo-paper/components/StatusBanner';
import { SYNC_LABELS, useSyncStatus } from '../../state/sync-status';
import type { RootStackParamList } from '../navigation/types';

export function SyncBanner() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const status = useSyncStatus();
  const online = useOnline();
  return <StatusBanner state={bannerState({ ...status, online }, SYNC_LABELS)} onPress={() => navigation.navigate('Sync')} />;
}
