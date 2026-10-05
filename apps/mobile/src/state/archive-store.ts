import { create } from 'zustand';
import {
  search,
  listConversations,
  listMessages,
} from '../data/api/generated/comms/archive/archive';
import type {
  ArchiveSearchHitDto,
  ConversationSummaryDto,
  ConversationMessageDto,
  MessageSource,
} from '../data/api/generated/comms/models';
import { mergeThreadPage, pageMayHaveMore, threadWindowEnds } from '@lupira/assistant-domain/thread-page';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

export const THREAD_PAGE_SIZE = 30;

// The comms archive browser: hybrid search, the conversation list, and a chat-style thread reader.
// Online-only by design — research is a deliberate act, not something the offline cache serves.

export interface SearchFilters {
  q: string;
  source?: MessageSource;
  participant?: string;
  from?: string;
  to?: string;
}

interface ArchiveState {
  searching: boolean;
  hits: ArchiveSearchHitDto[];
  searchError: string | null;

  conversations: ConversationSummaryDto[];
  conversationsCursor: string | null;
  loadingConversations: boolean;

  threadId: string | null;
  threadTitle: string | null;
  threadMessages: ConversationMessageDto[];
  loadingThread: boolean;
  threadHasOlder: boolean;
  threadHasNewer: boolean;
  loadingOlder: boolean;
  loadingNewer: boolean;
}

interface ArchiveActions {
  search: (filters: SearchFilters) => Promise<void>;
  clearSearch: () => void;
  loadConversations: (opts?: { more?: boolean; q?: string }) => Promise<void>;
  /** Open a thread: the latest page, or centred on a message (the search-hit jump). */
  openThread: (conversationId: string, aroundMessageId?: string) => Promise<void>;
  /** Page further back from the oldest loaded message. */
  loadOlder: () => Promise<void>;
  /** Page forward from the newest loaded message. */
  loadNewer: () => Promise<void>;
  closeThread: () => void;
}

export const useArchive = create<ArchiveState & ArchiveActions>((set, get) => ({
  searching: false,
  hits: [],
  searchError: null,
  conversations: [],
  conversationsCursor: null,
  loadingConversations: false,
  threadId: null,
  threadTitle: null,
  threadMessages: [],
  loadingThread: false,
  ...closedThread(),

  search: async (filters) => {
    if (filters.q.trim().length === 0) {
      set({ hits: [], searchError: null });
      return;
    }
    set({ searching: true, searchError: null });
    try {
      const res = await search({
        q: filters.q.trim(),
        source: filters.source,
        participant: filters.participant,
        from: filters.from,
        to: filters.to,
      });
      set({ hits: res, searching: false });
    } catch (e) {
      logDebug('archive:search-error', e instanceof Error ? e.message : String(e));
      set({ searching: false, searchError: 'Search unavailable.', hits: [] });
    }
  },

  clearSearch: () => set({ hits: [], searchError: null }),

  loadConversations: async (opts = {}) => {
    if (get().loadingConversations) return;
    set({ loadingConversations: true });
    try {
      const cursor = opts.more ? (get().conversationsCursor ?? undefined) : undefined;
      const data = await listConversations({ cursor, q: opts.q });
      const page = data.items;
      set({
        conversations: opts.more ? [...get().conversations, ...page] : page,
        conversationsCursor: data.nextCursor ?? null,
        loadingConversations: false,
      });
    } catch (e) {
      logDebug('archive:conversations-error', e instanceof Error ? e.message : String(e));
      set({ loadingConversations: false });
    }
  },

  openThread: async (conversationId, aroundMessageId) => {
    set({ threadId: conversationId, threadMessages: [], threadTitle: null, loadingThread: true, ...closedThread() });
    try {
      const data = await listMessages(conversationId, { around: aroundMessageId, limit: THREAD_PAGE_SIZE });
      if (get().threadId !== conversationId) return;
      const ends = threadWindowEnds(data.items, THREAD_PAGE_SIZE, aroundMessageId);
      set({
        threadTitle: data.title ?? null,
        threadMessages: data.items,
        loadingThread: false,
        threadHasOlder: ends.hasOlder,
        threadHasNewer: ends.hasNewer,
      });
    } catch (e) {
      logDebug('archive:thread-error', e instanceof Error ? e.message : String(e));
      set({ loadingThread: false });
    }
  },

  loadOlder: async () => {
    const { threadId, threadMessages, loadingThread, loadingOlder, threadHasOlder } = get();
    if (!threadId || loadingThread || loadingOlder || !threadHasOlder || threadMessages.length === 0) return;
    set({ loadingOlder: true });
    try {
      const data = await listMessages(threadId, { before: threadMessages[0].id, limit: THREAD_PAGE_SIZE });
      if (get().threadId !== threadId) return;
      set({
        threadMessages: mergeThreadPage(get().threadMessages, data.items),
        threadHasOlder: pageMayHaveMore(data.items, THREAD_PAGE_SIZE),
        loadingOlder: false,
      });
    } catch (e) {
      logDebug('archive:older-error', e instanceof Error ? e.message : String(e));
      set({ loadingOlder: false });
    }
  },

  loadNewer: async () => {
    const { threadId, threadMessages, loadingThread, loadingNewer, threadHasNewer } = get();
    if (!threadId || loadingThread || loadingNewer || !threadHasNewer || threadMessages.length === 0) return;
    set({ loadingNewer: true });
    try {
      const data = await listMessages(threadId, { after: threadMessages[threadMessages.length - 1].id, limit: THREAD_PAGE_SIZE });
      if (get().threadId !== threadId) return;
      set({
        threadMessages: mergeThreadPage(get().threadMessages, data.items),
        threadHasNewer: pageMayHaveMore(data.items, THREAD_PAGE_SIZE),
        loadingNewer: false,
      });
    } catch (e) {
      logDebug('archive:newer-error', e instanceof Error ? e.message : String(e));
      set({ loadingNewer: false });
    }
  },

  closeThread: () =>
    set({ threadId: null, threadTitle: null, threadMessages: [], loadingThread: false, ...closedThread() }),
}));

function closedThread() {
  return { threadHasOlder: false, threadHasNewer: false, loadingOlder: false, loadingNewer: false };
}
