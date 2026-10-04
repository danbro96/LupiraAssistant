import { describe, expect, it } from 'vitest';
import {
  compareChronological,
  dayBreakLabel,
  mergeThreadPage,
  pageMayHaveMore,
  threadWindowEnds,
} from './thread-page';

const m = (id: string, timestamp: string) => ({ id, timestamp });
const run = (n: number) =>
  Array.from({ length: n }, (_, i) => m(`m${String(i).padStart(3, '0')}`, new Date(Date.UTC(2026, 6, 1, 0, i)).toISOString()));

describe('mergeThreadPage', () => {
  it('prepends an older page in chronological order', () => {
    const loaded = [m('c', '2026-07-01T12:00:00Z'), m('d', '2026-07-01T13:00:00Z')];
    const page = [m('a', '2026-07-01T10:00:00Z'), m('b', '2026-07-01T11:00:00Z')];

    expect(mergeThreadPage(loaded, page).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('dedups an overlapping boundary message', () => {
    const loaded = [m('b', '2026-07-01T11:00:00Z'), m('c', '2026-07-01T12:00:00Z')];
    const page = [m('a', '2026-07-01T10:00:00Z'), m('b', '2026-07-01T11:00:00Z')];

    expect(mergeThreadPage(loaded, page).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('breaks same-instant ties by id, matching the server order', () => {
    const same = '2026-07-01T10:00:00Z';
    expect(mergeThreadPage([m('b', same)], [m('a', same)]).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('falls back to id order when a timestamp is unparseable', () => {
    expect(compareChronological(m('a', 'nonsense'), m('b', 'nonsense'))).toBeLessThan(0);
  });
});

describe('dayBreakLabel', () => {
  it('labels the first message and each new day only', () => {
    const first = m('a', '2026-07-01T10:00:00Z');
    const sameDay = m('b', '2026-07-01T23:00:00Z');
    const nextDay = m('c', '2026-07-02T01:00:00Z');

    expect(dayBreakLabel(first, undefined)).toBe('2026-07-01');
    expect(dayBreakLabel(sameDay, first)).toBeNull();
    expect(dayBreakLabel(nextDay, sameDay)).toBe('2026-07-02');
  });
});

describe('threadWindowEnds', () => {
  it('treats the latest page as the newest end, older only when the page is full', () => {
    expect(threadWindowEnds(run(30), 30)).toEqual({ hasOlder: true, hasNewer: false });
    expect(threadWindowEnds(run(12), 30)).toEqual({ hasOlder: false, hasNewer: false });
  });

  it('keeps both ends open around an anchor with a full older half and a full page', () => {
    const items = run(30);
    expect(threadWindowEnds(items, 30, items[15].id)).toEqual({ hasOlder: true, hasNewer: true });
  });

  it('closes the older end when fewer than half the limit precede the anchor', () => {
    const items = run(30);
    expect(threadWindowEnds(items, 30, items[4].id)).toEqual({ hasOlder: false, hasNewer: true });
  });

  it('closes the newer end when the page came back short', () => {
    const items = run(22);
    expect(threadWindowEnds(items, 30, items[15].id)).toEqual({ hasOlder: true, hasNewer: false });
  });

  it('closes both ends when the whole thread fit around the anchor', () => {
    const items = run(8);
    expect(threadWindowEnds(items, 30, items[3].id)).toEqual({ hasOlder: false, hasNewer: false });
  });

  it('falls back to page fullness when the anchor is missing', () => {
    expect(threadWindowEnds(run(30), 30, 'gone')).toEqual({ hasOlder: true, hasNewer: true });
  });
});

describe('pageMayHaveMore', () => {
  it('is true only for a full page', () => {
    expect(pageMayHaveMore(run(30), 30)).toBe(true);
    expect(pageMayHaveMore(run(29), 30)).toBe(false);
    expect(pageMayHaveMore([], 30)).toBe(false);
  });
});
