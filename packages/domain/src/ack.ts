// The acks stream: inbox gestures (resolve a proposal / answer a question / mark a notice read) queued
// offline and replayed against the hub, which dedups on clientActionId. Pure types.

import type { EditSlot } from './edit-spec';

export type ResolveAction = 'Approve' | 'Edit' | 'Dismiss';

export interface ResolvePayload {
  action: ResolveAction;
  /** Full edited proposal payload in the slot matching the proposal's kind; required when action is Edit. */
  edits?: Partial<Record<EditSlot, Record<string, unknown>>>;
}

export interface AnswerPayload {
  answer?: string;
  skip?: boolean;
}

/** Marking a notice read carries no fields of its own — the target id and action id say everything. */
export type ReadPayload = Record<string, never>;

/** One gesture on one inbox item. */
export type Ack =
  | { kind: 'resolve'; targetId: string; payload: ResolvePayload }
  | { kind: 'answer'; targetId: string; payload: AnswerPayload }
  | { kind: 'read'; targetId: string; payload: ReadPayload };
