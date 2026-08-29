// Numbers and dates on the screen belong to the AUDIENCE, not to the device.
//
// shared/locale-field.js states the rule: "every widget that formats dates,
// weekday/month names or numbers via Intl offers this ONE field instead of
// silently following the device" — because a signage box routinely runs an OS
// locale that has nothing to do with the room it hangs in.
//
// Three widgets did not follow it, and two of them are the ones a German
// business puts on a wall:
//   menu      price.toFixed(2)  → "4.50 €" on a café board that means 4,50 €
//   currency  rate.toFixed(d)   → "1.0842" where the room reads 1,0842
//   chart     toLocaleString(undefined) and no field to override it at all
//
// Browser-only: it mounts the real widgets.

import { test, expect, describe } from './runner.js';
import '../shared/plugins/all.js';
import { list, get } from '../shared/plugins/registry.js';
import { mountWidget } from '../shared/widget-host.js';

// Every widget that turns a number, a date or a weekday into text. Adding one
// to the registry without adding it here is fine; adding one WITHOUT the field
// is what this list exists to catch.
const FORMATTERS = [
  'chart', 'clock', 'countdown', 'currency', 'days-since', 'greeting',
  'kpi-cards', 'menu', 'progress', 'rss', 'weather', 'world-clock',
];

function renderText(type, content) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-3000px;top:0;width:600px;height:400px;overflow:hidden;';
  document.body.appendChild(box);
  const realFetch = window.fetch;
  const realWarn = console.warn;
  window.fetch = async () => { throw new TypeError('Failed to fetch'); };
  console.warn = () => {};
  let dispose = null;
  try {
    dispose = mountWidget({ id: 'loc-w', type, rect: { x: 0, y: 0, w: 100, h: 100 }, content },
      { id: 'loc-s', duration: 10 }, box, { mode: 'live' });
    return box.innerText;
  } finally {
    try { dispose?.(); } catch { /* ignore */ }
    window.fetch = realFetch;
    console.warn = realWarn;
    box.remove();
  }
}

describe('plugins · the audience decides how a number is written', () => {
  test('REGRESSION: every formatting widget offers the locale field', () => {
    const missing = FORMATTERS.filter(type => {
      const p = get(type);
      if (!p) return false;                     // renamed or dropped: not this test's business
      return !('locale' in p.defaults());
    });
    expect(missing).toEqual([]);
  });

  test('the field defaults to "" — the device, which is the documented fallback', () => {
    for (const type of FORMATTERS) {
      const p = get(type);
      if (p) expect(p.defaults().locale).toBe('');
    }
  });

  test('REGRESSION: a menu board writes its prices the way the room reads them', () => {
    const p = get('menu');
    const de = renderText('menu', { ...p.defaults(), locale: 'de' });
    const en = renderText('menu', { ...p.defaults(), locale: 'en-US' });
    expect(de).toContain('6,50');
    expect(en).toContain('6.50');
    expect(de).notToContain('6.50');
  });

  test('a whole price still loses its decimals when asked to', () => {
    const p = get('menu');
    const txt = renderText('menu', { ...p.defaults(), locale: 'de', hideZeroDecimals: true });
    // 4.00 → "4", not "4,00" and not "4.00".
    expect(txt).toContain('4 €');
  });

  test('the registry has not quietly lost one of these widgets', () => {
    const types = new Set(list().map(p => p.type));
    const gone = FORMATTERS.filter(t => !types.has(t));
    expect(gone).toEqual([]);
  });
});
