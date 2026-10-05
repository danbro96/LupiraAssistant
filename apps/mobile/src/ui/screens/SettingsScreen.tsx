import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { List, Switch } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useOnline } from '@danbro96/lupira-expo-query/online';
import { syncNow, useSyncStatus } from '../../state/sync-status';
import { useAuth } from '../../state/auth-store';
import { refreshGrant, useGrantStatus } from '../../state/inbox';
import { usePrefs } from '../../state/prefs-store';
import { launchConnect } from '../../data/auth/connect';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { IdentityHeader } from '@danbro96/lupira-expo-paper/components/IdentityHeader';
import { VersionLine } from '@danbro96/lupira-expo-diagnostics/VersionLine';
import { spacing, type Palette, useColors } from '../theme';
import { toast } from '@danbro96/lupira-expo-feedback/toast';

type Styles = ReturnType<typeof makeStyles>;

export function SettingsScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const debugEnabled = usePrefs((s) => s.debugEnabled);
  const user = useAuth((s) => s.user);

  const status = useSyncStatus();
  const online = useOnline();
  const apiUrl = useAuth((s) => s.apiUrl);
  const grantStatus = useGrantStatus();

  const [connecting, setConnecting] = useState(false);

  function onUploadNow() {
    void syncNow().then(() => toast('Upload triggered.'));
  }

  async function onConnect() {
    setConnecting(true);
    const res = await launchConnect(apiUrl);
    if (res === 'returned') {
      await refreshGrant();
      toast('Assistant connection updated.');
    }
    setConnecting(false);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <IdentityHeader name={user?.name ?? user?.sub ?? 'Not signed in'} sub={user?.name ? user.sub : undefined} />

      <List.Subheader>Assistant</List.Subheader>
      <Row label="Grant" value={grantStatus} styles={styles} />
      <View style={styles.action}>
        <Button
          title={grantStatus === 'connected' ? 'Reconnect assistant' : 'Connect assistant'}
          variant="secondary"
          onPress={() => void onConnect()}
          loading={connecting}
        />
      </View>
      <List.Item title="Notifications" onPress={() => navigation.navigate('Preferences')} />
      <List.Item title="Sources" onPress={() => navigation.navigate('Connectors')} />

      <List.Subheader>Upload status</List.Subheader>
      <Row label="Connectivity" value={online ? 'online' : 'offline'} styles={styles} />
      <Row label="Uploading" value={status.phase !== 'idle' ? 'yes' : 'no'} styles={styles} />
      <View style={styles.action}>
        <Button title="Upload now" onPress={onUploadNow} />
      </View>

      <List.Subheader>Developer</List.Subheader>
      <List.Item
        title="Enable debug"
        description="Show the developer tools and the on-device log"
        right={() => (
          <Switch value={debugEnabled} onValueChange={(v) => void usePrefs.getState().setDebugEnabled(v)} />
        )}
      />
      {debugEnabled ? <List.Item title="Developer options" onPress={() => navigation.navigate('Developer')} /> : null}

      <List.Subheader>About</List.Subheader>
      <VersionLine />
    </ScrollView>
  );
}

function Row({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: Styles;
}) {
  return (
    <List.Item
      title={label}
      titleStyle={styles.infoLabel}
      right={() => (
        <Text style={styles.infoValue} numberOfLines={1}>
          {value}
        </Text>
      )}
    />
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { paddingBottom: spacing.xxl },
    action: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    infoLabel: { fontSize: 13, color: c.textMuted },
    infoValue: { fontSize: 16, color: c.text, flexShrink: 1, textAlign: 'right', alignSelf: 'center' },
  });
