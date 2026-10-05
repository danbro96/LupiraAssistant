import { memo, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  answerItem,
  markItemRead,
  refreshGrant,
  resolveItem,
  useGrantStatus,
  useInboxItems,
  type GrantStatus,
} from '../../state/inbox';
import { syncNow } from '../../state/sync-status';
import { useAuth } from '../../state/auth-store';
import { launchConnect } from '../../data/auth/connect';
import type { InboxItemView } from '@lupira/assistant-domain/inbox-item';
import { payloadSlotFor } from '@lupira/assistant-domain/edit-spec';
import type { RootStackParamList } from '../navigation/types';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { cardSurface, spacing, type Palette, useColors } from '../theme';
import { toast } from '@danbro96/lupira-expo-feedback/toast';

const GRANT_TEXT: Record<GrantStatus, string> = {
  connected: 'Assistant connected.',
  'reauth-needed': 'Reconnect the assistant to keep it acting on your behalf.',
  unknown: 'Connect the assistant so it can act on your behalf.',
};

type Styles = ReturnType<typeof makeStyles>;

export function InboxScreen() {
  const c = useColors();
  const styles = makeStyles(c);

  const items = useInboxItems();
  const grantStatus = useGrantStatus();
  const apiUrl = useAuth((s) => s.apiUrl);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  // Drafts live here, not in the card: the list virtualizes, and an unmounted card would lose them.
  const [answers, setAnswers] = useState<Record<string, string>>({});

  async function onRefresh() {
    setRefreshing(true);
    await syncNow();
    setRefreshing(false);
  }

  // Pull-on-open freshness (until push lands): the cached feed renders instantly, then updates.
  useEffect(() => {
    void syncNow();
  }, []);

  async function onConnect() {
    setConnecting(true);
    const res = await launchConnect(apiUrl);
    if (res === 'returned') {
      await refreshGrant();
      toast('Assistant connection updated.');
    }
    setConnecting(false);
  }

  const onAnswerChange = (id: string, text: string) => {
    setAnswers((prev) => ({ ...prev, [id]: text }));
  };

  const renderItem = ({ item }: { item: InboxItemView }) => {
    if (item.kind === 'question') {
      return (
        <QuestionCard item={item} answer={answers[item.id] ?? ''} onAnswerChange={onAnswerChange} styles={styles} />
      );
    }
    if (item.kind === 'notice') return <NoticeCard item={item} styles={styles} />;
    return <ProposalCard item={item} styles={styles} />;
  };

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.primary} />}
      ListHeaderComponent={
        <View style={[styles.card, styles.grantCard]}>
          <Text style={styles.grantText}>{GRANT_TEXT[grantStatus]}</Text>
          {grantStatus !== 'connected' ? (
            <Button
              title="Connect assistant"
              onPress={() => void onConnect()}
              loading={connecting}
              style={styles.btn}
            />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.card}>
          <Text style={styles.empty}>No suggestions yet.</Text>
          <Text style={styles.emptyHint}>When the assistant has something for you, it shows up here.</Text>
        </View>
      }
      ListFooterComponent={<Text style={styles.footnote}>Gestures queue offline and sync when connected.</Text>}
    />
  );
}

function ItemHeader({ item, styles }: { item: InboxItemView; styles: Styles }) {
  return (
    <>
      <View style={styles.itemHeader}>
        <Text style={styles.kind}>{item.kind.toUpperCase()}</Text>
        <Text style={styles.when}>{new Date(item.createdAt).toLocaleString()}</Text>
      </View>
      <Text style={styles.title}>{item.title}</Text>
      {item.summary ? <Text style={styles.summary}>{item.summary}</Text> : null}
    </>
  );
}

const ProposalCard = memo(function ProposalCard({ item, styles }: { item: InboxItemView; styles: Styles }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const editable = item.proposal != null && payloadSlotFor(item.proposal.actionKind) !== null;
  return (
    <View style={styles.card}>
      <ItemHeader item={item} styles={styles} />
      <View style={styles.actions}>
        <Button
          title="Approve"
          onPress={() => void resolveItem(item.id, { action: 'Approve' })}
          style={styles.actionBtn}
        />
        {editable ? (
          <Button
            title="Edit"
            variant="secondary"
            onPress={() => navigation.navigate('EditProposal', { itemId: item.id })}
            style={styles.actionBtn}
          />
        ) : null}
        <Button
          title="Dismiss"
          variant="destructive"
          onPress={() => void resolveItem(item.id, { action: 'Dismiss' })}
          style={styles.actionBtn}
        />
      </View>
    </View>
  );
});

const NoticeCard = memo(function NoticeCard({ item, styles }: { item: InboxItemView; styles: Styles }) {
  return (
    <View style={styles.card}>
      <ItemHeader item={item} styles={styles} />
      <View style={styles.actions}>
        <Button
          title="Got it"
          variant="secondary"
          onPress={() => void markItemRead(item.id)}
          style={styles.actionBtn}
        />
      </View>
    </View>
  );
});

interface QuestionCardProps {
  item: InboxItemView;
  answer: string;
  onAnswerChange: (id: string, text: string) => void;
  styles: Styles;
}

const QuestionCard = memo(function QuestionCard({ item, answer, onAnswerChange, styles }: QuestionCardProps) {
  return (
    <View style={styles.card}>
      <ItemHeader item={item} styles={styles} />
      <TextField
        label="Your answer"
        value={answer}
        onChangeText={(text) => onAnswerChange(item.id, text)}
        multiline
      />
      <View style={styles.actions}>
        <Button
          title="Answer"
          disabled={answer.trim().length === 0}
          onPress={() => void answerItem(item.id, { answer: answer.trim() })}
          style={styles.actionBtn}
        />
        <Button
          title="Skip"
          variant="secondary"
          onPress={() => void answerItem(item.id, { skip: true })}
          style={styles.actionBtn}
        />
      </View>
    </View>
  );
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: spacing.lg, gap: spacing.sm },
    card: cardSurface(c),
    grantCard: { gap: spacing.sm },
    grantText: { fontSize: 16, color: c.text },
    btn: { marginTop: spacing.xs },
    empty: { fontSize: 17, color: c.text },
    emptyHint: { fontSize: 13, color: c.textMuted },
    itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    kind: { fontSize: 12, fontWeight: '700', color: c.primary },
    when: { fontSize: 13, color: c.textMuted, fontVariant: ['tabular-nums'] },
    title: { fontSize: 16, color: c.text, fontWeight: '600' },
    summary: { fontSize: 13, color: c.textMuted },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
    actionBtn: { flex: 1 },
    footnote: { fontSize: 11, color: c.textSubtle, textAlign: 'center', marginTop: spacing.md },
  });
