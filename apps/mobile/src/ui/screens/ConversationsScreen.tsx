import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useArchive } from '../../state/archive-store';
import { TextField } from '../components/TextField';
import { cardSurface, spacing, type Palette, useColors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

// The thread list: every captured conversation, newest activity first, cursor-paged.

export function ConversationsScreen() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const conversations = useArchive((s) => s.conversations);
  const loading = useArchive((s) => s.loadingConversations);
  const cursor = useArchive((s) => s.conversationsCursor);
  const [q, setQ] = useState('');

  useEffect(() => {
    void useArchive.getState().loadConversations();
  }, []);

  return (
    <View style={styles.screen}>
      <TextField
        style={styles.filter}
        label="Filter by title"
        value={q}
        onChangeText={setQ}
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={() => void useArchive.getState().loadConversations({ q: q.trim() || undefined })}
      />
      <FlatList
        data={conversations}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.list}
        refreshing={loading && conversations.length === 0}
        onRefresh={() => void useArchive.getState().loadConversations({ q: q.trim() || undefined })}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (cursor) void useArchive.getState().loadConversations({ more: true, q: q.trim() || undefined });
        }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.spinner} />
          ) : (
            <Text variant="bodySmall" style={styles.empty}>No conversations captured yet.</Text>
          )
        }
        ListFooterComponent={
          loading && conversations.length > 0 ? <ActivityIndicator style={styles.spinner} /> : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            accessibilityRole="button"
            onPress={() => navigation.navigate('Thread', { conversationId: item.id })}
          >
            <View style={styles.header}>
              <Text variant="bodyLarge" style={styles.title} numberOfLines={1}>
                {item.title ?? 'Untitled thread'}
              </Text>
              <Text variant="bodySmall" style={styles.when}>{new Date(item.lastMessageAt).toLocaleDateString()}</Text>
            </View>
            <Text variant="labelSmall" style={styles.meta}>
              {item.source} · {item.messageCount} message{item.messageCount === 1 ? '' : 's'}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    filter: { flex: 0, margin: spacing.lg, marginBottom: spacing.sm },
    list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
    card: cardSurface(c),
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
    title: { fontWeight: '600', flexShrink: 1 },
    when: { color: c.textMuted, fontVariant: ['tabular-nums'] },
    meta: { color: c.textSubtle },
    empty: { color: c.textMuted, textAlign: 'center', marginTop: spacing.lg },
    spinner: { marginVertical: spacing.md },
  });
