// The acks stream: inbox gestures (resolve a proposal / answer a question) queued offline and
// replayed against the hub, which dedups on clientActionId. Pure types + result classification.

import type { EditSlot } from './edit-spec';

export type AckKind = 'resolve' | 'answer' | 'read';

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

export interface AckRequest {
  kind: AckKind;
  targetId: string;
  clientActionId: string;
  payload: ResolvePayload | AnswerPayload | ReadPayload;
}

export type AckUploadResult = 'accepted' | 'permanent' | 'transient';

/**
 * Classify an upload outcome. 2xx applied (or replayed) → accepted. Other 4xx → permanent: the
 * gesture is moot server-side (resolved elsewhere, expired, malformed) — drop it and let the next
 * inbox refresh show the truth. 401/408/429/5xx/network → transient, keep for retry.
 */
export function classifyAckStatus(httpStatus: number): AckUploadResult {
  if (httpStatus >= 200 && httpStatus < 300) return 'accepted';
  if (httpStatus === 401 || httpStatus === 408 || httpStatus === 429) return 'transient';
  if (httpStatus >= 400 && httpStatus < 500) return 'permanent';
  return 'transient';
}

/** Defensive parse of a stored payload_json; null = unreadable (treat as permanent). */
export function parseAckPayload(
  kind: AckKind,
  json: string,
): ResolvePayload | AnswerPayload | ReadPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  if (kind === 'resolve') {
    const action = (parsed as Record<string, unknown>).action;
    if (action !== 'Approve' && action !== 'Edit' && action !== 'Dismiss') return null;
    return parsed as ResolvePayload;
  }
  return parsed as AnswerPayload | ReadPayload;
}
