import { memo, useEffect } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useArchive } from '../../state/archive-store';
import type { ConversationMessageDto } from '../../data/api/generated/comms/models';
import { dayBreakLabel } from '@lupira/assistant-domain/thread-page';
import { radii, spacing, useColors, type Palette } from '../theme';
import type { RootStackParamList } from '../navigation/types';

// Chat-style reader. Rendered oldest→newest with `inverted` so paging older messages (the natural
// direction here) doesn't jump the scroll position; the highlighted row is the search hit we jumped to.

type Styles = ReturnType<typeof makeStyles>;

export function ThreadScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const route = useRoute<RouteProp<RootStackParamList, 'Thread'>>();
  const { conversationId, aroundMessageId } = route.params;

  const messages = useArchive((s) => s.threadMessages);
  const loading = useArchive((s) => s.loadingThread);

  useEffect(() => {
    void useArchive.getState().openThread(conversationId, aroundMessageId);
    return () => useArchive.getState().closeThread();
  }, [conversationId, aroundMessageId]);

  // `inverted` needs newest-first data; the store keeps the window chronological.
  const data = [...messages].reverse();

  const renderItem = ({ item, index }: { item: ConversationMessageDto; index: number }) => (
    <MessageRow
      message={item}
      // In inverted order the visually-preceding row is the next index.
      previous={data[index + 1]}
      highlighted={item.id === aroundMessageId}
      styles={styles}
    />
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={data}
        inverted
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        onEndReachedThreshold={0.3}
        onEndReached={() => void useArchive.getState().loadOlder()}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.spinner} />
          ) : (
            <Text style={styles.empty}>No messages in this thread.</Text>
          )
        }
        ListFooterComponent={
          loading && data.length > 0 ? <ActivityIndicator style={styles.spinner} /> : null
        }
        renderItem={renderItem}
      />
    </View>
  );
}

interface MessageRowProps {
  message: ConversationMessageDto;
  previous: ConversationMessageDto | undefined;
  highlighted: boolean;
  styles: Styles;
}

const MessageRow = memo(function MessageRow({ message, previous, highlighted, styles }: MessageRowProps) {
  const dayLabel = dayBreakLabel(message, previous);
  return (
    <>
      {dayLabel ? <Text style={styles.dayBreak}>{dayLabel}</Text> : null}
      <View
        style={[
          styles.bubble,
          message.fromPrincipal ? styles.mine : styles.theirs,
          highlighted && styles.highlighted,
        ]}
      >
        {!message.fromPrincipal && message.sender ? <Text style={styles.sender}>{message.sender}</Text> : null}
        <Text style={[styles.text, message.fromPrincipal && styles.onPrimary]}>{message.text}</Text>
        <Text style={[styles.when, message.fromPrincipal && styles.onPrimary]}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </Text>
      </View>
    </>
  );
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    list: { padding: spacing.lg, gap: spacing.sm },
    bubble: { maxWidth: '85%', borderRadius: radii.lg, padding: spacing.sm, gap: 2 },
    mine: { alignSelf: 'flex-end', backgroundColor: c.primary },
    theirs: { alignSelf: 'flex-start', backgroundColor: c.surface },
    highlighted: { borderWidth: 2, borderColor: c.pending },
    sender: { fontSize: 11, color: c.textSubtle, fontWeight: '700' },
    text: { fontSize: 16, color: c.text },
    onPrimary: { color: c.onPrimary },
    when: { fontSize: 11, color: c.textSubtle, alignSelf: 'flex-end' },
    dayBreak: { fontSize: 11, color: c.textSubtle, textAlign: 'center', marginTop: spacing.sm },
    empty: { fontSize: 13, color: c.textMuted, textAlign: 'center', marginTop: spacing.lg },
    spinner: { marginVertical: spacing.md },
  });
