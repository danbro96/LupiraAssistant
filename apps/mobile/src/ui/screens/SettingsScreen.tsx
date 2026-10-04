import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { List, Switch } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useDevice } from '../../state/device-store';
import { useCollector } from '../../state/collector-store';
import { useSyncStatus, refreshSyncStatus } from '../../sync/sync-status';
import { kickSync } from '../../sync/sync-engine';
import { useAuth } from '../../state/auth-store';
import { APP_VERSION } from '../../config/env';
import { UPDATE_LABEL } from '../buildInfo';
import { useInbox } from '../../state/inbox-store';
import { usePrefs } from '../../state/prefs-store';
import { launchConnect } from '../../data/auth/connect';
import { getDb } from '../../data/db/db';
import { Button } from '../components/Button';
import { useConfirm } from '../components/ConfirmDialog';
import { spacing, type Palette, useColors } from '../theme';
import { toast } from '../../feedback/toast';

type Styles = ReturnType<typeof makeStyles>;

export function SettingsScreen() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const debugEnabled = usePrefs((s) => s.debugEnabled);
  const confirm = useConfirm();

  const device = useDevice();
  const collector = useCollector();
  const status = useSyncStatus();
  const apiUrl = useAuth((s) => s.apiUrl);
  const grantStatus = useInbox((s) => s.grantStatus);
  const mirror = useSyncStatus((s) => s.mirror);

  const [connecting, setConnecting] = useState(false);

  const refresh = useCallback(async () => {
    if (!device.deviceId) return;
    const db = await getDb();
    await refreshSyncStatus(db, device.deviceId);
  }, [device.deviceId]);

  useEffect(() => {
    void collector.hydrate();
    void collector.refreshPermissions();
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refresh();
  }, [mirror, refresh]);

  async function onToggleCollecting(next: boolean) {
    if (next) {
      const res = await useCollector.getState().start();
      if (!res.ok) {
        toast(
          res.stage === 'foreground'
            ? 'Enable "Always" location in Settings to record in the background.'
            : 'Location permission is required to collect.',
        );
      }
    } else {
      await useCollector.getState().stop();
    }
    await refresh();
  }

  function onUploadNow() {
    void (async () => {
      await kickSync({ resume: true, poll: true });
      await refresh();
      toast('Upload triggered.');
    })();
  }


  async function onConnect() {
    setConnecting(true);
    const res = await launchConnect(apiUrl);
    if (res === 'returned') {
      await useInbox.getState().refreshGrant();
      toast('Assistant connection updated.');
    }
    setConnecting(false);
  }

  async function onReRegister() {
    const ok = await confirm({
      title: 'Re-register device?',
      message: 'This clears the local key and buffered fixes. You will register again.',
      confirmLabel: 'Re-register',
      destructive: true,
    });
    if (!ok) return;
    await useCollector.getState().stop();
    await useDevice.getState().clear();
    await useAuth.getState().clearSession();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <List.Subheader>Device</List.Subheader>
      <Row label="Label" value={device.label ?? '—'} styles={styles} />
      <Row label="Kind" value={device.kind ?? '—'} styles={styles} />
      <Row label="Record" value={device.recordSlug ?? '—'} styles={styles} />
      <Row label="Key id" value={device.keyId ?? '—'} styles={styles} mono />
      <Row label="Version" value={`${APP_VERSION} · ${UPDATE_LABEL}`} styles={styles} />

      <List.Subheader>Collection</List.Subheader>
      <List.Item
        title="Record location"
        right={() => (
          <Switch value={collector.collecting} onValueChange={(v) => void onToggleCollecting(v)} disabled={collector.starting} />
        )}
      />
      <Row label="Permission" value={collector.permissionStage} styles={styles} />
      {collector.permissionStage !== 'background' ? (
        <Text style={styles.warn}>Background ("Always") location is required to record while the app is closed.</Text>
      ) : null}
      {status.paused ? (
        <Text style={styles.warn}>Tracking is paused on the server{status.pausedReason ? ` (${status.pausedReason})` : ''}. Fixes are discarded until it resumes.</Text>
      ) : null}

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
      <Row label="Connectivity" value={status.online ? 'online' : 'offline'} styles={styles} />
      <Row label="Uploading" value={status.uploading ? 'yes' : 'no'} styles={styles} />
      <Row label="Buffered fixes" value={String(status.pendingCount)} styles={styles} mono />
      <Row label="Last uploaded seq" value={String(status.lastUploadedSeq)} styles={styles} mono />
      <Row label="Server high-water" value={status.highWaterSeq === null ? '—' : String(status.highWaterSeq)} styles={styles} mono />
      <Row label="Last upload" value={status.lastUploadAt ? new Date(status.lastUploadAt).toLocaleString() : 'never'} styles={styles} />
      {status.lastError ? <Text style={styles.error}>Last error: {status.lastError}</Text> : null}
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

      <View style={styles.action}>
        <Button title="Re-register device" variant="destructive" onPress={() => void onReRegister()} />
      </View>
    </ScrollView>
  );
}

const Row = memo(function Row({
  label,
  value,
  styles,
  mono,
}: {
  label: string;
  value: string;
  styles: Styles;
  mono?: boolean;
}) {
  return (
    <List.Item
      title={label}
      titleStyle={styles.infoLabel}
      right={() => (
        <Text style={mono ? styles.infoValueMono : styles.infoValue} numberOfLines={1}>
          {value}
        </Text>
      )}
    />
  );
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { paddingBottom: spacing.xxl },
    action: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
    infoLabel: { fontSize: 13, color: c.textMuted },
    infoValue: { fontSize: 16, color: c.text, flexShrink: 1, textAlign: 'right', alignSelf: 'center' },
    infoValueMono: { fontSize: 13, color: c.textMuted, fontVariant: ['tabular-nums'], flexShrink: 1, textAlign: 'right', alignSelf: 'center' },
    warn: { fontSize: 13, color: c.warning, paddingHorizontal: spacing.lg },
    error: { fontSize: 13, color: c.danger, paddingHorizontal: spacing.lg },
  });
