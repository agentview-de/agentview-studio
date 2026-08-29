// Does the field DO anything?
//
// The chart shipped a language field that the drawing code never read: it was
// declared, documented, visible in the inspector, and inert. A field like that
// is worse than a missing one — somebody sets it, sees a plausible slide, and
// publishes it.
//
// Nothing static catches that. `locale` appeared in chart.js the whole time —
// in the defaults, in the schema, in a formatter that was never handed it. The
// only check that means anything is behavioural: render the widget twice with
// two different values and see whether the pixels move.
//
// So this is a table of (widget, field, two values), and the rule is that the
// output has to differ. Canvas widgets are compared by their pixels, DOM
// widgets by their markup.
//
// A case that fails here is one of two things, and both are worth knowing: the
// field does nothing, or the two values genuinely render the same and the pair
// was badly chosen. Neither may be silenced without saying which it was.
//
// The first run failed four times and all four were the second kind: the
// ticker's directions are 'ltr'/'rtl', not 'left'/'right'; the countdown's unit
// labels are 'short'/'full'/'hidden', not 'long'; and its target is an object
// {at, tz} rather than a date string; the ticker's items are an ARRAY, not a
// newline-separated string; and the icon's badge is a shape name, not a count.
// Which is itself worth knowing — those are the shapes a caller has to get
// right, and every one of them fails silently into an empty render.
//
// What this cannot cover is a field only a live feed makes visible: currency's
// decimal places need rates on screen before they can change anything. Those
// belong in a test that stubs the feed, not in this table.

import { test, expect, describe } from './runner.js';
import '../shared/plugins/registry.js';
import { get as getPlugin } from '../shared/plugins/registry.js';
import { mountWidget } from '../shared/widget-host.js';

const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

/** Mount once and reduce what came out to a comparable string. */
async function render(type, content) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-4000px;top:0;width:640px;height:360px;';
  document.body.appendChild(host);
  let dispose = () => {};
  try {
    dispose = mountWidget({ id: 'fx', type, content }, {}, host, { mode: 'preview' });
    await frame();
    await new Promise(r => setTimeout(r, 90));
    let sig = host.innerHTML;
    // A canvas has no markup to compare, so compare what it painted.
    for (const cv of host.querySelectorAll('canvas')) {
      try { sig += '|' + cv.toDataURL(); } catch { /* tainted — markup only */ }
    }
    return sig;
  } finally { dispose(); host.remove(); }
}

const defaultsOf = (type) => {
  const p = getPlugin(type);
  const s = typeof p?.schema === 'function' ? p.schema() : p?.schema;
  return { ...(s?.defaults ?? {}) };
};

/**
 * Each case: the widget, the field, two values, and enough content for the
 * widget to actually draw something.
 */
const CASES = [
  // The two widgets whose entire job is showing numbers — where the bug was.
  ['chart', 'locale', 'en', 'fr-CA', { kind: 'bar', source: 'inline', showValues: true, data: [{ label: 'A', value: 1234.56 }] }],
  ['chart', 'valueFormat', 'compact', 'full', { kind: 'bar', source: 'inline', showValues: true, data: [{ label: 'A', value: 1234.56 }] }],
  ['chart', 'valueUnit', '', '€', { kind: 'bar', source: 'inline', showValues: true, data: [{ label: 'A', value: 12 }] }],
  ['chart', 'kind', 'bar', 'line', { source: 'inline', data: [{ label: 'A', value: 5 }, { label: 'B', value: 9 }] }],
  ['chart', 'sortOrder', 'none', 'desc', { kind: 'bar', source: 'inline', showValues: true, data: [{ label: 'A', value: 1 }, { label: 'B', value: 9 }] }],
  ['chart', 'goalValue', 0, 8, { kind: 'bar', source: 'inline', data: [{ label: 'A', value: 5 }] }],
  ['kpi-cards', 'locale', 'en', 'fr-CA', { source: 'inline', cards: [{ label: 'A', value: 1234.56, deltaPct: 6.2 }] }],
  ['kpi-cards', 'numberFormat', 'compact', 'full', { source: 'inline', cards: [{ label: 'A', value: 1234.56 }] }],
  ['kpi-cards', 'columns', 2, 4, { source: 'inline', cards: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] }],
  ['progress', 'locale', 'en', 'fr-CA', { source: 'inline', label: 'X', value: 1234.5, target: 2000, showValue: true }],
  ['progress', 'style', 'bar', 'gauge', { source: 'inline', label: 'X', value: 50, target: 100 }],
  ['menu', 'locale', 'en', 'fr-CA', { rows: [{ name: 'Kaffee', price: 4.5 }], showPrices: true }],
  ['menu', 'currency', '€', '$', { rows: [{ name: 'Kaffee', price: 4.5 }], showPrices: true }],
  ['menu', 'hideZeroDecimals', false, true, { rows: [{ name: 'Kaffee', price: 4 }], showPrices: true }],
  // Time widgets: the other family where a locale silently does nothing.
  ['clock', 'locale', 'en', 'fr-CA', { timezone: 'Europe/Berlin', display: 'datetime' }],
  ['clock', 'hour12', false, true, { timezone: 'Europe/Berlin' }],
  ['clock', 'showOffset', false, true, { timezone: 'Europe/Berlin', label: 'Berlin' }],
  ['world-clock', 'hour12', false, true, { zones: [{ tz: 'Europe/Berlin', label: 'B' }] }],
  ['world-clock', 'showOffset', false, true, { zones: [{ tz: 'Europe/Berlin', label: 'B' }] }],
  ['countdown', 'unitStyle', 'short', 'full', { target: { at: 4070908800000, tz: 'Europe/Berlin' }, units: 'dhms' }],
  ['countdown', 'locale', 'en', 'fr-CA', { target: { at: 4070908800000, tz: 'Europe/Berlin' }, showTarget: true }],
  ['days-since', 'showDate', false, true, { since: { at: 1735689600000, tz: 'Europe/Berlin' } }],
  // Layout fields, to prove the check is not only about numbers.
  ['text', 'valign', 'center', 'top', { body: 'Hallo' }],
  ['text', 'textScale', 1, 2, { body: 'Hallo' }],
  ['ticker', 'direction', 'ltr', 'rtl', { items: [{ text: 'a' }, { text: 'b' }] }],
  ['icon', 'badge', 'none', 'circle', { symbol: 'star' }],
  ['qr-code', 'ecLevel', 'M', 'H', { template: 'url', url: 'https://example.org' }],
];

describe('every field earns its place in the inspector', () => {
  for (const [type, key, a, b, content] of CASES) {
    test(`${type} · ${key}`, async () => {
      const base = { ...defaultsOf(type), ...content };
      const one = await render(type, { ...base, [key]: a });
      const two = await render(type, { ...base, [key]: b });
      // Guard against a vacuous pass: if the widget rendered nothing at all,
      // "they differ" would be meaningless — and so would "they match".
      expect(one.length > 0).toBeTruthy();
      expect(one === two).toBe(false);
    });
  }
});

describe('a list written by hand is still a list', () => {
  // Six of this file's first-draft cases failed because content the widget
  // could not read produced an EMPTY render and no explanation. The ticker was
  // the clearest: a newline-separated string — the shape a person writes by
  // hand, and the shape an importer or a hand-edited playlist produces — gave
  // a blank bar. kpi-cards has tolerated exactly this for its sparkline
  // history all along.
  const bar = async (items) => render('ticker', { ...defaultsOf('ticker'), items });

  test('REGRESSION: newline-separated text is not an empty ticker', async () => {
    const typed = await bar('Erste Zeile\nZweite Zeile');
    expect(typed).toContain('Erste Zeile');
    expect(typed).toContain('Zweite Zeile');
  });

  test('the array form is untouched, entries and objects alike', async () => {
    expect(await bar([{ text: 'Objekt' }])).toContain('Objekt');
    expect(await bar(['Zeichenkette'])).toContain('Zeichenkette');
  });

  test('a comma stays inside the message, only newlines split', async () => {
    const one = await bar('Kaffee, Tee und Kuchen');
    expect(one).toContain('Kaffee, Tee und Kuchen');
  });

  test('blank lines and stray whitespace do not become empty entries', async () => {
    const out = await bar('  Eins  \n\n   \nZwei');
    expect(out).toContain('Eins');
    expect(out).toContain('Zwei');
    expect(out).notToContain('><span></span>');
  });
});
