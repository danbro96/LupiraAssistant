// Thread paging for the archive reader: pages arrive chronological and may overlap (an anchor page
// re-fetched, or a `before` page whose boundary the client already holds), so merging is dedup +
// chronological order rather than plain concatenation.

/** The minimum a thread row must carry to be ordered and deduped. */
export interface ThreadMessage {
  id: string;
  timestamp: string;
}

/**
 * Merge a freshly-fetched page into the loaded window: dedup by id (loaded copy wins), then order by
 * (timestamp, id) — the same total order the server pages on, so the seam never jumbles.
 */
export function mergeThreadPage<T extends ThreadMessage>(loaded: readonly T[], page: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const m of page) byId.set(m.id, m);
  for (const m of loaded) byId.set(m.id, m);
  return [...byId.values()].sort(compareChronological);
}

export function compareChronological(a: ThreadMessage, b: ThreadMessage): number {
  const ta = Date.parse(a.timestamp);
  const tb = Date.parse(b.timestamp);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface ThreadWindowEnds {
  hasOlder: boolean;
  hasNewer: boolean;
}

/**
 * Which ends of a freshly-opened window may hold more messages. Mirrors the server's `around` split:
 * up to floor(limit/2) messages before the anchor, the remainder from the anchor on; a short side is exhausted.
 */
export function threadWindowEnds(items: readonly ThreadMessage[], limit: number, anchorId?: string): ThreadWindowEnds {
  const full = items.length >= limit;
  if (anchorId === undefined) return { hasOlder: full, hasNewer: false };
  const anchorIndex = items.findIndex((m) => m.id === anchorId);
  if (anchorIndex < 0) return { hasOlder: full, hasNewer: full };
  return { hasOlder: anchorIndex >= Math.max(1, Math.floor(limit / 2)), hasNewer: full };
}

/** A `before`/`after` page shorter than the requested limit means that direction is exhausted. */
export function pageMayHaveMore(page: readonly ThreadMessage[], limit: number): boolean {
  return page.length >= limit;
}

/** Day-boundary label for a separator row, or null when the previous message is the same day. */
export function dayBreakLabel(current: ThreadMessage, previous: ThreadMessage | undefined): string | null {
  const day = current.timestamp.slice(0, 10);
  if (previous && previous.timestamp.slice(0, 10) === day) return null;
  return day;
}
