import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationMessageDto, ListMessagesParams } from '../data/api/generated/comms/models';

const listMessages = vi.fn();
vi.mock('../data/api/generated/comms/archive/archive', () => ({
  search: vi.fn(),
  listConversations: vi.fn(),
  listMessages: (id: string, params: ListMessagesParams) => listMessages(id, params),
}));
vi.mock('../debug/log', () => ({ logDebug: vi.fn() }));

const { useArchive, THREAD_PAGE_SIZE } = await import('./archive-store');

const thread = Array.from({ length: 100 }, (_, i): ConversationMessageDto => ({
  id: `m${String(i).padStart(3, '0')}`,
  timestamp: new Date(Date.UTC(2026, 6, 1, 0, i)).toISOString(),
  text: `message ${i}`,
  fromPrincipal: i % 2 === 0,
}));

const indexOf = (id: string) => thread.findIndex((m) => m.id === id);

// Mirrors the comms API paging contract over a fixed 100-message thread.
function serve(_id: string, params: ListMessagesParams) {
  const limit = params.limit ?? 30;
  let items: ConversationMessageDto[];
  if (params.around) {
    const at = indexOf(params.around);
    const older = thread.slice(Math.max(0, at - Math.max(1, Math.floor(limit / 2))), at);
    items = [...older, ...thread.slice(at, at + limit - older.length)];
  } else if (params.before) {
    const at = indexOf(params.before);
    items = thread.slice(Math.max(0, at - limit), at);
  } else if (params.after) {
    const at = indexOf(params.after);
    items = thread.slice(at + 1, at + 1 + limit);
  } else {
    items = thread.slice(-limit);
  }
  return Promise.resolve({ status: 200, data: { conversationId: 'c1', title: 'T', items } });
}

const ids = () => useArchive.getState().threadMessages.map((m) => m.id);

beforeEach(() => {
  listMessages.mockReset();
  listMessages.mockImplementation(serve);
  useArchive.getState().closeThread();
});

describe('openThread', () => {
  it('opens the latest page with only the older end open', async () => {
    await useArchive.getState().openThread('c1');
    const s = useArchive.getState();
    expect(ids().at(-1)).toBe('m099');
    expect(s.threadHasOlder).toBe(true);
    expect(s.threadHasNewer).toBe(false);
  });

  it('opens a window around a search hit with both ends open', async () => {
    await useArchive.getState().openThread('c1', 'm050');
    const s = useArchive.getState();
    expect(ids()).toContain('m050');
    expect(s.threadHasOlder).toBe(true);
    expect(s.threadHasNewer).toBe(true);
  });
});

describe('loadNewer', () => {
  it('pages forward from the hit until the newest message, then stops', async () => {
    await useArchive.getState().openThread('c1', 'm050');
    for (let i = 0; i < 10; i++) await useArchive.getState().loadNewer();

    expect(ids().at(-1)).toBe('m099');
    expect(useArchive.getState().threadHasNewer).toBe(false);
    expect(listMessages.mock.calls.filter(([, p]) => p.after)).toHaveLength(2);
  });

  it('is a no-op on the latest page', async () => {
    await useArchive.getState().openThread('c1');
    await useArchive.getState().loadNewer();
    expect(listMessages).toHaveBeenCalledTimes(1);
  });

  it('stops on an empty page when the window ended exactly at the newest message', async () => {
    await useArchive.getState().openThread('c1', 'm085');
    expect(useArchive.getState().threadHasNewer).toBe(true);

    await useArchive.getState().loadNewer();
    await useArchive.getState().loadNewer();

    expect(useArchive.getState().threadHasNewer).toBe(false);
    expect(listMessages.mock.calls.filter(([, p]) => p.after)).toHaveLength(1);
  });
});

describe('loadOlder', () => {
  it('pages back to the first message, then stops', async () => {
    await useArchive.getState().openThread('c1', 'm050');
    for (let i = 0; i < 10; i++) await useArchive.getState().loadOlder();

    expect(ids()[0]).toBe('m000');
    expect(ids()).toHaveLength(new Set(ids()).size);
    expect(useArchive.getState().threadHasOlder).toBe(false);
  });

  it('runs alongside loadNewer so neither edge request is dropped', async () => {
    await useArchive.getState().openThread('c1', 'm050');
    await Promise.all([useArchive.getState().loadOlder(), useArchive.getState().loadNewer()]);

    expect(ids()[0]).toBe('m005');
    expect(ids().at(-1)).toBe('m094');
  });

  it('drops a page that lands after the thread was closed', async () => {
    await useArchive.getState().openThread('c1', 'm050');
    const pending = useArchive.getState().loadOlder();
    useArchive.getState().closeThread();
    await pending;

    expect(useArchive.getState().threadMessages).toEqual([]);
  });
});

it('pages with the shared limit', async () => {
  await useArchive.getState().openThread('c1', 'm050');
  expect(listMessages).toHaveBeenCalledWith('c1', { around: 'm050', limit: THREAD_PAGE_SIZE });
});
