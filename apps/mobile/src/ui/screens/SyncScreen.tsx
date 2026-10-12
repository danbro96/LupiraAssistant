import { useOnline } from '@danbro96/lupira-expo-query/online';
import { SyncStatusView } from '@danbro96/lupira-expo-paper/components/SyncStatusView';
import { toast } from '@danbro96/lupira-expo-feedback/toast';
import type { OpBase } from '@danbro96/lupira-sync-engine/types';
import type { Ack } from '@lupira/assistant-domain/ack';
import { discardChange, retryChange, SYNC_LABELS, syncNow, useParkedChanges, useSyncStatus } from '../../state/sync-status';

const OP_LABELS: Record<Ack['kind'], string> = {
  resolve: 'Resolve proposal',
  answer: 'Answer question',
  read: 'Dismiss notice',
};

const labelOf = (op: OpBase) => OP_LABELS[(op as OpBase & Ack).kind];

export function SyncScreen() {
  const parked = useParkedChanges();
  const status = useSyncStatus();
  const online = useOnline();

  return (
    <SyncStatusView
      status={status}
      parked={parked}
      opLabel={labelOf}
      online={online}
      progressLabels={SYNC_LABELS}
      onSync={() => void syncNow()}
      onRetry={(commandId) => void retryChange(commandId)}
      onRetryAll={() => {
        for (const row of parked) void retryChange(row.op.commandId);
        toast('Retrying failed changes…');
      }}
      onDiscard={(commandId) => {
        void discardChange(commandId);
        toast('Change discarded');
      }}
    />
  );
}
