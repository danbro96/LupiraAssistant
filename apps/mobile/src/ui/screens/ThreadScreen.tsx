import { memo, useEffect, useLayoutEffect } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator } from 'react-native-paper';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useArchive } from '../../state/archive-store';
import type { ConversationMessageDto } from '../../data/api/generated/comms/models';
import { dayBreakLabel } from '@lupira/assistant-domain/thread-page';
import { radii, spacing, useColors, type Palette } from '../theme';
import type { RootStackParamList } from '../navigation/types';

// The list mounts only once data is in: FlashList applies its initial position (the hit, else the bottom) once.

type Styles = ReturnType<typeof makeStyles>;

export function ThreadScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const { height } = useWindowDimensions();
  const route = useRoute<RouteProp<RootStackParamList, 'Thread'>>();
  const navigation = useNavigation();
  const { conversationId, aroundMessageId } = route.params;

  const data = useArchive((s) => s.threadMessages);
  const loading = useArchive((s) => s.loadingThread);
  const loadingOlder = useArchive((s) => s.loadingOlder);
  const loadingNewer = useArchive((s) => s.loadingNewer);
  const threadTitle = useArchive((s) => s.threadTitle);

  useLayoutEffect(() => {
    navigation.setOptions({ title: threadTitle ?? 'Thread' });
  }, [navigation, threadTitle]);

  useEffect(() => {
    void useArchive.getState().openThread(conversationId, aroundMessageId);
    return () => useArchive.getState().closeThread();
  }, [conversationId, aroundMessageId]);

  if (data.length === 0) {
    return (
      <View style={styles.screen}>
        {loading ? (
          <ActivityIndicator style={styles.spinner} />
        ) : (
          <Text style={styles.empty}>No messages in this thread.</Text>
        )}
      </View>
    );
  }

  const hitIndex = aroundMessageId ? data.findIndex((m) => m.id === aroundMessageId) : -1;

  const renderItem = ({ item, index }: { item: ConversationMessageDto; index: number }) => (
    <MessageRow
      message={item}
      previous={data[index - 1]}
      highlighted={item.id === aroundMessageId}
      styles={styles}
    />
  );

  return (
    <View style={styles.screen}>
      <FlashList
        data={data}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        initialScrollIndex={hitIndex >= 0 ? hitIndex : undefined}
        initialScrollIndexParams={hitIndex >= 0 ? { viewOffset: -height / 3 } : undefined}
        maintainVisibleContentPosition={{ startRenderingFromBottom: true }}
        onStartReachedThreshold={0.5}
        onStartReached={() => void useArchive.getState().loadOlder()}
        onEndReachedThreshold={0.5}
        onEndReached={() => void useArchive.getState().loadNewer()}
        ListHeaderComponent={loadingOlder ? <ActivityIndicator style={styles.spinner} /> : null}
        ListFooterComponent={loadingNewer ? <ActivityIndicator style={styles.spinner} /> : null}
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
    <View style={previous && styles.spaced}>
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
    </View>
  );
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    list: { padding: spacing.lg },
    spaced: { paddingTop: spacing.sm },
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
