import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { resolveItem, useInboxItems } from '../../state/inbox';
import {
  applyEdit,
  editSpecFor,
  fieldToInput,
  getField,
  inputToField,
  payloadSlotFor,
  visibleFields,
  type FieldSpec,
} from '@lupira/assistant-domain/edit-spec';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { spacing, useColors, type Palette } from '../theme';
import { toast } from '@danbro96/lupira-expo-feedback/toast';
import type { RootStackParamList } from '../navigation/types';

// Schema-driven editor: the field specs live in the domain package; this screen renders text inputs
// (booleans get a switch) over the proposal payload and submits the whole edited payload as an Edit
// resolution on the acks stream.

export function EditProposalScreen() {
  const c = useColors();
  const styles = makeStyles(c);
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'EditProposal'>>();

  const item = useInboxItems().find((i) => i.id === route.params.itemId);
  const slot = item?.proposal ? payloadSlotFor(item.proposal.actionKind) : null;
  const spec = item?.proposal ? editSpecFor(item.proposal.actionKind) : null;
  const initial = (slot && item?.proposal?.[slot]) || null;

  const [payload, setPayload] = useState<Record<string, unknown>>(() => ({ ...(initial ?? {}) }));
  // Raw text per field while typing; committed into the payload on save (after validation).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!item || !spec || !initial) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text variant="bodyLarge">This proposal is no longer editable.</Text>
      </View>
    );
  }

  const fields = visibleFields(spec, payload);
  const key = (f: FieldSpec) => f.path.join('.');

  function draftFor(f: FieldSpec): string {
    const k = key(f);
    return k in drafts ? drafts[k] : fieldToInput(f.type, getField(payload, f.path));
  }

  function onSave() {
    let next = payload;
    const errs: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === 'boolean') continue;
      const k = key(f);
      if (!(k in drafts)) continue;
      const parsed = inputToField(f.type, drafts[k]);
      if (!parsed.ok) {
        errs[k] = parsed.error;
        continue;
      }
      next = applyEdit(next, f.path, parsed.value);
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0 || !slot) return;

    void resolveItem(item!.id, { action: 'Edit', edits: { [slot]: next } });
    toast('Edit queued.');
    navigation.goBack();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text variant="bodyLarge" style={styles.title}>{item.title}</Text>
      {fields.map((f) => {
        const k = key(f);
        return (
          <View key={k} style={styles.field}>
            {f.type === 'boolean' ? (
              <>
                <Text variant="labelMedium" style={styles.label}>{f.label}</Text>
                <Switch
                  value={getField(payload, f.path) === true}
                  onValueChange={(v) => setPayload((p) => applyEdit(p, f.path, v))}
                />
              </>
            ) : (
              <TextField
                label={f.label}
                value={draftFor(f)}
                onChangeText={(t) => setDrafts((d) => ({ ...d, [k]: t }))}
                multiline={f.type === 'multiline'}
                autoCapitalize="none"
                error={!!errors[k]}
              />
            )}
            {errors[k] ? <Text variant="bodySmall" style={styles.error}>{errors[k]}</Text> : null}
          </View>
        );
      })}
      <Button title="Save & approve" onPress={onSave} style={styles.save} />
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    content: { padding: spacing.lg, gap: spacing.sm },
    title: { fontWeight: '600', marginBottom: spacing.xs },
    field: { gap: spacing.xs },
    label: { color: c.textSubtle },
    error: { color: c.danger },
    save: { marginTop: spacing.md },
  });
