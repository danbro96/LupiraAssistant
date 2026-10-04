import type { Db } from '../data/db/db';
import { deleteAck, fetchPendingAcks } from '../data/db/pending-acks-repo';
import {
  resolveProposal,
  answerCheckIn,
  markNoticeRead,
} from '../data/api/generated/assistant/inbox/inbox';
import type { ResolveProposalRequest, AnswerCheckInRequest } from '../data/api/generated/assistant/models';
import { classifyAckStatus, parseAckPayload, type AnswerPayload, type ResolvePayload } from '@lupira/assistant-domain/ack';
import { ApiError } from '@danbro96/lupira-http/apiError';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

const BATCH = 20;

export interface AckUploadOutcome {
  status: 'uploaded' | 'empty' | 'error';
  /** More rows may remain (a full batch was drained). */
  more?: boolean;
}

/**
 * Drain the acks queue in seq order, one POST per gesture (the hub dedups on clientActionId).
 * Accepted and permanently-rejected rows are deleted; the first transient failure stops the drain —
 * the next sync kick retries from the same row, preserving order.
 */
export async function runAckUpload(db: Db): Promise<AckUploadOutcome> {
  const rows = await fetchPendingAcks(db, BATCH);
  if (rows.length === 0) return { status: 'empty' };

  for (const row of rows) {
    const payload = parseAckPayload(row.kind, row.payloadJson);
    if (payload === null) {
      logDebug('acks:drop-unreadable', `seq=${row.seq}`);
      await deleteAck(db, row.seq);
      continue;
    }

    try {
      if (row.kind === 'resolve') {
        const p = payload as ResolvePayload;
        const body: ResolveProposalRequest = {
          action: p.action,
          edits: (p.edits ?? undefined) as ResolveProposalRequest['edits'],
          clientActionId: row.clientActionId,
        };
        await resolveProposal(row.targetId, body);
      } else if (row.kind === 'answer') {
        const p = payload as AnswerPayload;
        const body: AnswerCheckInRequest = {
          answer: p.answer,
          skip: p.skip ?? false,
          clientActionId: row.clientActionId,
        };
        await answerCheckIn(row.targetId, body);
      } else {
        await markNoticeRead(row.targetId, { clientActionId: row.clientActionId });
      }
      await deleteAck(db, row.seq);
    } catch (e) {
      const cls = e instanceof ApiError ? classifyAckStatus(e.status) : 'transient';
      if (cls === 'permanent') {
        // Resolved elsewhere / expired / malformed — the next inbox refresh shows server truth.
        logDebug('acks:drop-permanent', `seq=${row.seq} status=${e instanceof ApiError ? e.status : '?'}`);
        await deleteAck(db, row.seq);
        continue;
      }
      logDebug('acks:transient', e instanceof Error ? e.message : String(e));
      return { status: 'error' };
    }
  }

  return { status: 'uploaded', more: rows.length === BATCH };
}
