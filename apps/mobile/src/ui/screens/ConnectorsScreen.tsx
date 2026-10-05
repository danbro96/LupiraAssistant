import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { useConnectors } from '../../state/settings';
import type { ConnectorStatusDto } from '../../data/api/generated/comms/models';
import { cardSurface, spacing, type Palette, useColors } from '../theme';

// Read-only capture status per source. Connectors are enrolled server-side (ops CLI), so there is
// nothing to toggle here — this answers "is my mail/Telegram still arriving?".

type Styles = ReturnType<typeof makeStyles>;

export function ConnectorsScreen() {
  const c = useColors();
  const styles = makeStyles(c);

  const { data: connectors = [], isFetching: loading, refetch } = useConnectors();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading && connectors.length > 0}
          onRefresh={() => void refetch()}
          tintColor={c.primary}
        />
      }
    >
      {connectors.length === 0 ? (
        loading ? (
          <ActivityIndicator style={styles.spinner} />
        ) : (
          <Text style={styles.hint}>Capture status is unavailable.</Text>
        )
      ) : (
        connectors.map((connector) => (
          <ConnectorCard key={connector.source} connector={connector} styles={styles} />
        ))
      )}

      <Text style={styles.footnote}>Sources are connected on the server; this view is read-only.</Text>
    </ScrollView>
  );
}

function ConnectorCard({
  connector,
  styles,
}: {
  connector: ConnectorStatusDto;
  styles: Styles;
}) {
  const connected = connector.connectors.length > 0;
  const last = connector.lastMessageAt ? new Date(connector.lastMessageAt).toLocaleString() : 'never';
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.source}>{connector.source}</Text>
        <Text style={[styles.badge, connected ? styles.connected : styles.idle]}>
          {connected ? 'connected' : 'not connected'}
        </Text>
      </View>
      <Text style={styles.hint}>
        {connector.messageCount.toLocaleString()} captured · last {last}
      </Text>
      {connected ? <Text style={styles.mono}>{connector.connectors.join(', ')}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: spacing.lg, gap: spacing.sm },
    card: cardSurface(c),
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    source: { fontSize: 16, color: c.text, fontWeight: '600' },
    badge: { fontSize: 11, color: c.textSubtle, fontWeight: '700' },
    connected: { color: c.success },
    idle: { color: c.textSubtle },
    hint: { fontSize: 13, color: c.textMuted },
    mono: { fontSize: 13, color: c.textMuted, fontVariant: ['tabular-nums'] },
    footnote: { fontSize: 11, color: c.textSubtle, textAlign: 'center', marginTop: spacing.md },
    spinner: { marginTop: spacing.lg },
  });
