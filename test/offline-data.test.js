// Tests for shared/offline-data.js — the pure "provide data offline" helpers:
// finding stored widgets, deriving their slot slug, and producing the shipped
// copy (slot binding injected, secret keys stripped, original never mutated).
import { describe, test, expect } from './runner.js';
import { offlineSlugFor, offlineWidgets, withOfflineBindings, OFFLINE_FIELD, isStored, offlineLiveOpts } from '../shared/offline-data.js';

// A small playlist: one stored live-json (with an API key), one live one, plus a
// stored widget tucked inside an A/B variant and a language variant.
const makePlaylist = () => ({
  id: 'pl1',
  slides: [
    { id: 's1', widgets: [
      { id: 'w-stored', type: 'live-json', content: { dataMode: 'stored', url: 'https://api/x.json', apiKey: 'SECRET' } },
      { id: 'w-live',   type: 'live-json', content: { dataMode: 'live', url: 'https://api/y.json' } },
      // source:'stored' is the other offline convention (data-table/chart/kpi-cards)
      { id: 'w-src-stored', type: 'chart', content: { source: 'stored', dataUrl: 'https://api/c.json' } },
      { id: 'w-src-url',    type: 'chart', content: { source: 'url', dataUrl: 'https://api/d.json' } },
    ] },
    { id: 's2',
      widgets: [{ id: 'w-plain', type: 'text', content: { text: 'hi' } }],
      abVariants: [{ widgets: [{ id: 'w-ab', type: 'live-json', content: { dataMode: 'stored', url: 'https://api/ab.json' } }] }],
      langs: { en: { widgets: [{ id: 'w-en', type: 'live-json', content: { dataMode: 'stored', url: 'https://api/en.json' } }] } },
    },
  ],
});

describe('offline-data · offlineSlugFor', () => {
  test('is stable and derived from the widget id', () => {
    expect(offlineSlugFor({ id: 'w-stored' })).toBe('avs-d-w-stored');
    expect(offlineSlugFor({ id: 'w-stored' })).toBe(offlineSlugFor({ id: 'w-stored' }));
  });
});

describe('offline-data · isStored / offlineLiveOpts', () => {
  test('isStored detects BOTH conventions (dataMode + source)', () => {
    expect(isStored({ dataMode: 'stored' })).toBe(true);
    expect(isStored({ source: 'stored' })).toBe(true);
    expect(isStored({ dataMode: 'live' })).toBe(false);
    expect(isStored({ source: 'url' })).toBe(false);
    expect(isStored({ source: 'inline' })).toBe(false);
    expect(isStored({})).toBe(false);
    expect(isStored(undefined)).toBe(false);
  });
  test('offlineLiveOpts: stored → offline + injected data; live → not offline', () => {
    expect(offlineLiveOpts({ source: 'stored', _offline: { data: { a: 1 } } }))
      .toEqual({ offline: true, offlineData: { a: 1 } });
    expect(offlineLiveOpts({ dataMode: 'live', _offline: { data: { a: 1 } } }).offline).toBe(false);
  });
});

describe('offline-data · offlineWidgets', () => {
  test('finds stored widgets (both conventions) across slides, A/B and language variants', () => {
    const ids = offlineWidgets(makePlaylist()).map(w => w.id).sort();
    expect(ids).toEqual(['w-ab', 'w-en', 'w-src-stored', 'w-stored']);
  });
  test('returns [] when nothing is stored', () => {
    expect(offlineWidgets({ slides: [{ widgets: [{ id: 'a', content: { dataMode: 'live' } }] }] })).toHaveLength(0);
  });
});

describe('offline-data · withOfflineBindings', () => {
  test('injects a slot binding and strips the API key from stored widgets only', () => {
    const shipped = withOfflineBindings(makePlaylist());
    const stored = shipped.slides[0].widgets[0];
    expect(stored.bindings[OFFLINE_FIELD]).toEqual({ slot: 'avs-d-w-stored' });
    expect('apiKey' in stored.content).toBe(false);   // secret stripped from shipped copy
    expect(stored.content.url).toBe('https://api/x.json'); // url kept (refresh source ref)

    const live = shipped.slides[0].widgets[1];
    expect(live.bindings).toBe(undefined);             // live widget untouched

    // source:'stored' convention is bound too; source:'url' is left alone.
    expect(shipped.slides[0].widgets[2].bindings[OFFLINE_FIELD]).toEqual({ slot: 'avs-d-w-src-stored' });
    expect(shipped.slides[0].widgets[3].bindings).toBe(undefined);
  });

  test('binds stored widgets inside A/B and language variants too', () => {
    const shipped = withOfflineBindings(makePlaylist());
    expect(shipped.slides[1].abVariants[0].widgets[0].bindings[OFFLINE_FIELD].slot).toBe('avs-d-w-ab');
    expect(shipped.slides[1].langs.en.widgets[0].bindings[OFFLINE_FIELD].slot).toBe('avs-d-w-en');
  });

  test('does NOT mutate the original playlist (keys + bindings intact)', () => {
    const pl = makePlaylist();
    withOfflineBindings(pl);
    expect(pl.slides[0].widgets[0].content.apiKey).toBe('SECRET'); // editor copy keeps the key
    expect(pl.slides[0].widgets[0].bindings).toBe(undefined);      // and gains no binding
  });
});
