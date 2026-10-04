import { create } from 'zustand';
import { getDb } from '../data/db/db';
import { getCache, setCache, clearCache } from '../data/db/inbox-cache-repo';
import { enqueueAck } from '../data/db/pending-acks-repo';
import { getAuthStatus } from '../data/api/generated/assistant/auth/auth';
import { getInbox } from '../data/api/generated/assistant/inbox/inbox';
import { kickSync } from '../sync/sync-engine';
import { mapInboxResponse, parseCachedInbox, type InboxItemView } from '@lupira/assistant-domain/inbox-item';
import type { AnswerPayload, ResolvePayload } from '@lupira/assistant-domain/ack';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

// The assistant surface store: the last cached feed plus the on-behalf-of grant status (live via the
// BFF). The feed fetch is wired against the hub's /inbox — see refresh().

/** Server-truth, read via GET /auth/status; `unknown` until the first successful read. */
export type GrantStatus = 'connected' | 'reauth-needed' | 'unknown';

interface InboxState {
  loaded: boolean;
  grantStatus: GrantStatus;
  items: InboxItemView[];
  fetchedAt: number | null;
}

interface InboxActions {
  /** Hydrate from the local cache so the screen renders offline at launch. */
  loadFromCache: () => Promise<void>;
  /** Re-fetch the feed from the hub via the BFF. */
  refresh: () => Promise<void>;
  /** Re-read grant status from GET /auth/status. */
  refreshGrant: () => Promise<void>;
  /** Approve/edit/dismiss a proposal: optimistic remove + offline-safe enqueue on the acks stream. */
  resolve: (id: string, payload: ResolvePayload) => Promise<void>;
  /** Answer or skip a question: optimistic remove + offline-safe enqueue on the acks stream. */
  answer: (id: string, payload: AnswerPayload) => Promise<void>;
  /** Dismiss a notice (mark read): same optimistic + queued path. */
  markRead: (id: string) => Promise<void>;
  clear: () => Promise<void>;
}

/** Optimistically drop the item, persist the shrunken cache, queue the gesture, kick the sync. */
async function applyGesture(
  set: (partial: Partial<InboxState>) => void,
  get: () => InboxState,
  kind: 'resolve' | 'answer' | 'read',
  id: string,
  payload: ResolvePayload | AnswerPayload | Record<string, never>,
): Promise<void> {
  const items = get().items.filter((i) => i.id !== id);
  set({ items });
  try {
    const db = await getDb();
    await setCache(db, JSON.stringify(items), get().fetchedAt ?? Date.now());
    await enqueueAck(db, kind, id, crypto.randomUUID(), payload, Date.now());
  } catch (e) {
    logDebug('inbox:gesture-enqueue-error', e instanceof Error ? e.message : String(e));
  }
  void kickSync();
}

export const useInbox = create<InboxState & InboxActions>((set, get) => ({
  loaded: false,
  grantStatus: 'unknown',
  items: [],
  fetchedAt: null,

  loadFromCache: async () => {
    try {
      const db = await getDb();
      const cache = await getCache(db);
      set({
        loaded: true,
        items: cache ? parseCachedInbox(cache.json) : [],
        fetchedAt: cache?.fetchedAt ?? null,
      });
    } catch (e) {
      logDebug('inbox:cache-load-error', e instanceof Error ? e.message : String(e));
      set({ loaded: true });
    }
  },

  refresh: async () => {
    try {
      const res = await getInbox();
      const items = mapInboxResponse(res.data);
      const fetchedAt = Date.now();
      set({ loaded: true, items, fetchedAt });
      const db = await getDb();
      await setCache(db, JSON.stringify(items), fetchedAt);
    } catch (e) {
      // Offline: the cached feed stays on screen.
      logDebug('inbox:refresh-error', e instanceof Error ? e.message : String(e));
    }
  },

  refreshGrant: async () => {
    try {
      const res = await getAuthStatus();
      if (res.status !== 200) return;
      const grant = res.data;
      set({ grantStatus: grant.hasGrant && grant.status === 'Active' ? 'connected' : 'reauth-needed' });
    } catch (e) {
      // Offline or unauthenticated: keep the last known status rather than flashing the reconnect card.
      logDebug('inbox:refresh-grant-error', e instanceof Error ? e.message : String(e));
    }
  },

  resolve: async (id, payload) => applyGesture(set, get, 'resolve', id, payload),

  answer: async (id, payload) => applyGesture(set, get, 'answer', id, payload),

  markRead: async (id) => applyGesture(set, get, 'read', id, {}),

  clear: async () => {
    const db = await getDb();
    await clearCache(db);
    set({ items: [], fetchedAt: null, grantStatus: 'unknown' });
  },
}));
