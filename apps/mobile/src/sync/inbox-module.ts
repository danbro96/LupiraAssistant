import type { AggregateModule, OpBase } from '@danbro96/lupira-sync-engine/types';
import { answerCheckIn, getInbox, markNoticeRead, resolveProposal } from '../data/api/generated/assistant/inbox/inbox';
import type { InboxResponse, ResolveProposalRequest } from '../data/api/generated/assistant/models';
import { mapInboxResponse, type InboxItemView } from '@lupira/assistant-domain/inbox-item';
import type { Ack } from '@lupira/assistant-domain/ack';

// The whole feed is one doc, so a queued gesture keeps its item hidden across refetches until the hub has the ack.

export const INBOX = 'assistant.inbox';
export const INBOX_ID = 'inbox';

export type AckOp = OpBase & Ack;

export function ackOp(ack: Ack): AckOp {
  return { ...ack, commandId: crypto.randomUUID(), occurredAt: new Date().toISOString(), aggregate: INBOX, aggregateId: INBOX_ID };
}

export const inboxModule: AggregateModule<InboxItemView[], null, AckOp, InboxResponse> = {
  aggregate: INBOX,
  feed: {
    fetch: async () => ({ cursor: '', hasMore: false, reset: true, changed: [await getInbox()], deleted: [] }),
    fromWire: (res) => ({ id: INBOX_ID, state: { doc: mapInboxResponse(res), guards: null } }),
  },
  reduce: (state, op) => state && { doc: state.doc.filter((i) => i.id !== op.targetId), guards: null },
  replay: async (op) => {
    const clientActionId = op.commandId;
    const options = { headers: { 'Idempotency-Key': clientActionId } };
    switch (op.kind) {
      case 'resolve':
        await resolveProposal(
          op.targetId,
          { action: op.payload.action, edits: op.payload.edits as ResolveProposalRequest['edits'], clientActionId },
          options,
        );
        return;
      case 'answer':
        await answerCheckIn(op.targetId, { answer: op.payload.answer, skip: op.payload.skip ?? false, clientActionId }, options);
        return;
      case 'read':
        await markNoticeRead(op.targetId, { clientActionId }, options);
    }
  },
  holdKeyOf: (op) => op.targetId,
};
