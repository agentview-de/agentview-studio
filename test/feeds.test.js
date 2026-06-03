// Tests for shared/feeds.js — the multi-feed fetch+parse pipeline shared by the
// RSS / News-with-Photos widgets and their offline provisioning. fetch and the
// XML parse are injectable, so the orchestration (merge, sort, cap, okCount,
// resilience to dead/empty/malformed feeds) is verified here under Node without
// a DOM. The widget-specific mapItem is stubbed.
import { describe, test, expect } from './runner.js';
import { fetchFeedItems, parseFeedItems } from '../shared/feeds.js';

// A fake parser: feed bodies are JSON arrays of pseudo-nodes; 'BAD' throws to
// stand in for a malformed XML body.
const fakeParse = (xml) => {
  if (xml === 'BAD') throw new Error('parse error');
  const nodes = JSON.parse(xml);
  return { querySelectorAll: () => nodes };
};
const mapItem = (n) => ({ title: n.title, date: n.date ?? 0 });

// A fetch stub backed by a {url: body} map. Unknown URLs reject (dead feed);
// 'THROW' bodies resolve but their text() rejects (network mid-read failure).
const stubFetch = (map) => (u) => {
  if (!(u in map)) return Promise.reject(new Error('ENOTFOUND'));
  if (map[u] === 'THROW') return Promise.resolve({ text: () => Promise.reject(new Error('body read')) });
  return Promise.resolve({ text: () => Promise.resolve(map[u]) });
};

const FEEDS = {
  a: JSON.stringify([{ title: 'A-old', date: 100 }, { title: 'A-new', date: 300 }]),
  b: JSON.stringify([{ title: 'B', date: 200 }]),
  empty: JSON.stringify([]),
  bad: 'BAD',
};

describe('feeds · parseFeedItems', () => {
  test('maps every node via mapItem', () => {
    expect(parseFeedItems(JSON.stringify([{ title: 'x', date: 1 }]), mapItem, fakeParse))
      .toEqual([{ title: 'x', date: 1 }]);
  });
});

describe('feeds · fetchFeedItems', () => {
  test('merges feeds, sorts newest-first, caps to maxItems', async () => {
    const { items, okCount, configured } = await fetchFeedItems(['a', 'b'], {
      mapItem, parseDoc: fakeParse, fetchImpl: stubFetch(FEEDS), maxItems: 2,
    });
    expect(configured).toBe(true);
    expect(okCount).toBe(2);
    expect(items.map(i => i.title)).toEqual(['A-new', 'B']); // 300, 200 (100 capped out)
  });

  test('no feed configured → configured:false, nothing fetched', async () => {
    expect(await fetchFeedItems([], { mapItem, parseDoc: fakeParse }))
      .toEqual({ items: [], okCount: 0, configured: false });
  });

  test('accepts a legacy single-string url', async () => {
    const r = await fetchFeedItems('a', { mapItem, parseDoc: fakeParse, fetchImpl: stubFetch(FEEDS), maxItems: 10 });
    expect(r.okCount).toBe(1);
    expect(r.items.map(i => i.title)).toEqual(['A-new', 'A-old']);
  });

  test('one dead / empty / malformed feed never blanks the rest', async () => {
    const r = await fetchFeedItems(['a', 'missing', 'empty', 'bad'], {
      mapItem, parseDoc: fakeParse, fetchImpl: stubFetch(FEEDS), maxItems: 10,
    });
    expect(r.okCount).toBe(1); // only 'a' yielded items
    expect(r.items.map(i => i.title)).toEqual(['A-new', 'A-old']);
  });

  test('a mid-read fetch failure is skipped, not fatal', async () => {
    const r = await fetchFeedItems(['a', 'broken'], {
      mapItem, parseDoc: fakeParse, fetchImpl: stubFetch({ ...FEEDS, broken: 'THROW' }), maxItems: 10,
    });
    expect(r.okCount).toBe(1);
    expect(r.items.map(i => i.title)).toEqual(['A-new', 'A-old']);
  });
});
