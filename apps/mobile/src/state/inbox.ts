import { useQuery } from '@tanstack/react-query';
import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { onlineQuery } from '@danbro96/lupira-expo-query/onlineQuery';
import { getAuthStatus } from '../data/api/generated/assistant/auth/auth';
import { engine, readInbox } from '../sync/engine';
import { INBOX, ackOp } from '../sync/inbox-module';
import { queryClient } from '../sync/queryClient';
import type { InboxItemView } from '@lupira/assistant-domain/inbox-item';
import type { Ack, AnswerPayload, ResolvePayload } from '@lupira/assistant-domain/ack';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

/** Server-truth, read via GET /auth/status; `unknown` until the first successful read. */
export type GrantStatus = 'connected' | 'reauth-needed' | 'unknown';

const GRANT_KEY = ['assistant', 'grant'];
const NO_ITEMS: InboxItemView[] = [];

export function useInboxItems(): InboxItemView[] {
  return useQuery(mirrorQuery([INBOX], readInbox)).data ?? NO_ITEMS;
}

export function useGrantStatus(): GrantStatus {
  const grant = useQuery(onlineQuery(GRANT_KEY, () => getAuthStatus())).data;
  if (!grant) return 'unknown';
  return grant.hasGrant && grant.status === 'Active' ? 'connected' : 'reauth-needed';
}

export const refreshGrant = (): Promise<void> => queryClient.invalidateQueries({ queryKey: GRANT_KEY });

/** Approve/edit/dismiss a proposal: optimistic remove + offline-safe enqueue on the acks stream. */
export const resolveItem = (id: string, payload: ResolvePayload) => enqueueAck({ kind: 'resolve', targetId: id, payload });

/** Answer or skip a question: optimistic remove + offline-safe enqueue on the acks stream. */
export const answerItem = (id: string, payload: AnswerPayload) => enqueueAck({ kind: 'answer', targetId: id, payload });

/** Dismiss a notice (mark read): same optimistic + queued path. */
export const markItemRead = (id: string) => enqueueAck({ kind: 'read', targetId: id, payload: {} });

async function enqueueAck(ack: Ack): Promise<void> {
  try {
    await engine.enqueue(ackOp(ack));
  } catch (e) {
    logDebug('inbox:gesture-enqueue-error', e instanceof Error ? e.message : String(e));
  }
}
