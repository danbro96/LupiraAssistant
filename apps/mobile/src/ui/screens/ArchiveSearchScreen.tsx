import { memo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useArchive } from '../../state/archive-store';
import type { ArchiveSearchHitDto } from '../../data/api/generated/comms/models';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { cardSurface, spacing, type Palette, useColors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

// Research entry point: hybrid search over the whole corpus. A hit deep-links into its thread,
// centred on the matched message.

type Styles = ReturnType<typeof makeStyles>;

export function ArchiveSearchScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const hits = useArchive((s) => s.hits);
  const searching = useArchive((s) => s.searching);
  const searchError = useArchive((s) => s.searchError);
  const [q, setQ] = useState('');
  const [participant, setParticipant] = useState('');

  function onSearch() {
    void useArchive.getState().search({ q, participant: participant.trim() || undefined });
  }

  const onOpenHit = (hit: ArchiveSearchHitDto) => {
    navigation.navigate('Thread', { conversationId: hit.conversationId, aroundMessageId: hit.messageId });
  };

  const renderItem = ({ item }: { item: ArchiveSearchHitDto }) => (
    <HitRow hit={item} onPress={onOpenHit} styles={styles} />
  );

  return (
    <View style={styles.screen}>
      <View style={styles.controls}>
        <TextField
          label="Search messages"
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={onSearch}
        />
        <TextField
          label="From"
          placeholder="sender name, optional"
          value={participant}
          onChangeText={setParticipant}
          autoCapitalize="none"
        />
        <View style={styles.row}>
          <Button title="Search" onPress={onSearch} loading={searching} style={styles.grow} />
          <Button
            title="Threads"
            variant="secondary"
            onPress={() => navigation.navigate('Conversations')}
            style={styles.grow}
          />
        </View>
      </View>

      {searchError ? <Text style={styles.error}>{searchError}</Text> : null}

      <FlatList
        data={hits}
        keyExtractor={(h) => h.messageId}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          searching ? (
            <ActivityIndicator style={styles.spinner} />
          ) : (
            <Text style={styles.empty}>
              {q.trim() ? 'No matches.' : 'Search your captured messages by meaning or keywords.'}
            </Text>
          )
        }
        renderItem={renderItem}
      />
    </View>
  );
}

interface HitRowProps {
  hit: ArchiveSearchHitDto;
  onPress: (hit: ArchiveSearchHitDto) => void;
  styles: Styles;
}

const HitRow = memo(function HitRow({ hit, onPress, styles }: HitRowProps) {
  return (
    <Pressable onPress={() => onPress(hit)} style={styles.card} accessibilityRole="button">
      <View style={styles.hitHeader}>
        <Text style={styles.sender}>{hit.sender ?? 'Unknown'}</Text>
        <Text style={styles.when}>{new Date(hit.timestamp).toLocaleString()}</Text>
      </View>
      {hit.conversationTitle ? <Text style={styles.thread}>{hit.conversationTitle}</Text> : null}
      <Text style={styles.text} numberOfLines={4}>
        {hit.text}
      </Text>
    </Pressable>
  );
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    controls: { padding: spacing.lg, gap: spacing.sm },
    row: { flexDirection: 'row', gap: spacing.sm },
    grow: { flex: 1 },
    list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
    card: cardSurface(c),
    hitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sender: { fontSize: 16, color: c.text, fontWeight: '600' },
    when: { fontSize: 13, color: c.textMuted, fontVariant: ['tabular-nums'] },
    thread: { fontSize: 11, color: c.textSubtle },
    text: { fontSize: 13, color: c.text },
    empty: { fontSize: 13, color: c.textMuted, textAlign: 'center', marginTop: spacing.lg },
    error: { fontSize: 13, color: c.danger, textAlign: 'center' },
    spinner: { marginTop: spacing.lg },
  });
