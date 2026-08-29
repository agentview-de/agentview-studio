// The gate's decision, taken against the REAL registry.
//
// plugin-network.test.js covers the helper. This covers what the helper says
// about the widgets people actually place — because the bug was never in the
// arithmetic, it was in five plugins that never declared themselves and four
// that declared too much.
//
// Browser-only: it asks the loaded plugin registry.

import { test, expect, describe } from './runner.js';
import '../shared/plugins/registry.js';
import { get as getPlugin, list as listPlugins } from '../shared/plugins/registry.js';
import { usesNetwork } from '../shared/plugin-network.js';

const gated = (type, content) => usesNetwork(getPlugin(type), content);

describe('privacy gate · the five that used to say nothing', () => {
  test('REGRESSION: a calendar with an ICS URL is a network widget', () => {
    // fetch(icsUrl) against a user-supplied calendar server, from the editor.
    expect(gated('calendar', { icsUrl: 'https://cal.example.org/x.ics' })).toBe(true);
    expect(gated('calendar', { events: [{ title: 'a' }] })).toBe(false);
  });

  test('REGRESSION: markdown pulled from a URL is one too — and it polls', () => {
    expect(gated('markdown', { sourceUrl: 'https://example.org/a.md' })).toBe(true);
    expect(gated('markdown', { body: '# written here' })).toBe(false);
  });

  test('REGRESSION: a menu with remote dish photos reaches that host', () => {
    const rows = [{ name: 'Kaffee', image: 'https://cdn.example.org/k.jpg' }];
    expect(gated('menu', { showImages: true, rows })).toBe(true);
    // …but a text menu board, which is most of them, must not be gated.
    expect(gated('menu', { rows: [{ name: 'Kaffee' }] })).toBe(false);
    // Nor one whose pictures are switched off, or embedded rather than fetched.
    expect(gated('menu', { showImages: false, rows })).toBe(false);
    expect(gated('menu', { showImages: true, rows: [{ name: 'K', image: 'data:image/png;base64,AA' }] })).toBe(false);
  });

  test('REGRESSION: a quote portrait and a QR logo are requests as well', () => {
    expect(gated('quote', { portrait: 'https://example.org/p.jpg' })).toBe(true);
    expect(gated('quote', { quote: 'Nur Text' })).toBe(false);
    expect(gated('qr-code', { url: 'https://example.org', logoUrl: 'https://example.org/l.png' })).toBe(true);
    expect(gated('qr-code', { url: 'https://example.org' })).toBe(false);
  });
});

describe('privacy gate · the ones that used to say too much', () => {
  test('REGRESSION: inline data is not a network call', () => {
    // You could not see your own numbers without granting a live preview that
    // was never live.
    expect(gated('chart', { source: 'inline', data: [{ label: 'a', value: 1 }] })).toBe(false);
    expect(gated('kpi-cards', { source: 'inline', cards: [{ label: 'a', value: 1 }] })).toBe(false);
    expect(gated('data-table', { source: 'inline', rows: [] })).toBe(false);
    expect(gated('progress', { source: 'inline', value: 1, target: 2 })).toBe(false);
  });

  test('…and a URL source still is', () => {
    for (const t of ['chart', 'kpi-cards', 'data-table', 'progress']) {
      expect(gated(t, { source: 'url', dataUrl: 'https://example.org/d.json' })).toBe(true);
    }
  });

  test('provided-offline reads a slot the Studio already filled', () => {
    expect(gated('chart', { source: 'stored', dataUrl: 'https://example.org/d.json' })).toBe(false);
    expect(gated('weather', { dataMode: 'stored' })).toBe(false);
    expect(gated('rss', { dataMode: 'stored' })).toBe(false);
    expect(gated('weather', { dataMode: 'live' })).toBe(true);
  });
});

describe('privacy gate · nothing declares itself the wrong way', () => {
  test('every plugin declares network as a boolean or a predicate', () => {
    for (const p of listPlugins()) {
      const n = p.network;
      const ok = n === undefined || typeof n === 'boolean' || typeof n === 'function';
      expect(ok).toBe(true);
    }
  });

  test('the widgets that always fetch still always say so', () => {
    // No predicate can make these safe: their whole content is a remote URL.
    for (const t of ['video', 'image', 'iframe', 'embed', 'youtube', 'pdf', 'stream-cam', 'map', 'audio-viz', 'image-gallery', 'live-json']) {
      expect(gated(t, { url: 'https://example.org/x' })).toBe(true);
    }
  });

  test('a widget that never touches the network is never gated', () => {
    for (const t of ['text', 'clock', 'world-clock', 'countdown', 'days-since', 'icon', 'code', 'ticker', 'greeting']) {
      expect(gated(t, {})).toBe(false);
    }
  });
});
