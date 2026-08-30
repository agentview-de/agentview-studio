// A widget with nothing to show must say so.
//
// On the editor canvas an empty render is a blank rectangle that looks exactly
// like a broken widget; on a wall it is a hole in the layout. Thirty of the
// thirty-four widgets already said something sensible — "Add a video URL",
// "No upcoming events", "Set a target date" — and two did not:
//
//   menu       delete the last row, or mistype the section filter, and the
//              board went blank.
//   kpi-cards  the URL branches had had a message for a long time; the INLINE
//              branch drew an empty grid.
//
// So the test is the sweep itself rather than two hand-written cases: mount
// EVERY registered widget with empty content and require something visible.
// A widget added later inherits the check instead of the bug.

import { test, expect, describe } from './runner.js';
import '../shared/plugins/registry.js';
import { list as listPlugins } from '../shared/plugins/registry.js';
import { mountWidget } from '../shared/widget-host.js';

async function mount(type, content) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-4000px;top:0;width:640px;height:360px;';
  document.body.appendChild(host);
  let dispose = () => {};
  try {
    dispose = mountWidget({ id: 'empty', type, content }, {}, host, { mode: 'preview' });
    await new Promise(r => setTimeout(r, 70));
    return {
      text: host.innerText.trim(),
      // A widget may legitimately answer with a picture instead of words.
      graphic: !!host.querySelector('canvas, svg, img, video, iframe'),
    };
  } finally { dispose(); host.remove(); }
}

// `custom` is the designer widget: its content IS author-supplied markup, and
// an author who supplies none has asked for an empty box.
//
// `shape` is exempt for the opposite reason: a coloured box IS its content. It
// has nothing to explain and nothing to fetch — an empty content object still
// paints a rectangle in the slide accent, which is exactly what the reader
// asked for. It escapes the sweep only because the two most-used shapes are
// drawn with CSS rather than SVG (see shared/data/shapes.js for why), so the
// `graphic` probe below can't see them; the assertion that it paints is in
// test/shapes.test.js and /tools/shape-sheet.html.
//
// Every other widget owns its own rendering and owes the reader an explanation.
const AUTHORED = new Set(['custom', 'shape']);

describe('nothing to show is something to say', () => {
  for (const p of listPlugins()) {
    if (AUTHORED.has(p.type)) continue;
    test(`${p.type} · empty content`, async () => {
      const { text, graphic } = await mount(p.type, {});
      expect(text.length > 0 || graphic).toBeTruthy();
    });
  }
});

describe('the two that used to go blank', () => {
  test('REGRESSION: a menu with its last row deleted explains itself', async () => {
    const { text } = await mount('menu', { rows: [] });
    expect(text).toContain('Add menu items');
  });

  test('REGRESSION: a mistyped section filter is not a blank board', async () => {
    // The rows are there; the filter hides them. That is a different mistake
    // from having no rows, and it deserves a different sentence.
    const { text } = await mount('menu', {
      rows: [{ name: 'Kaffee', section: 'Getränke' }], sectionFilter: 'Tippfehler',
    });
    expect(text).toContain('section filter');
  });

  test('REGRESSION: inline KPI cards with none left say so', async () => {
    const { text } = await mount('kpi-cards', { source: 'inline', cards: [] });
    expect(text).toContain('Add cards');
  });

  test('the URL branches keep the message they already had', async () => {
    const { text } = await mount('kpi-cards', { source: 'url' });
    expect(text).toContain('JSON URL');
  });

  test('and a widget that HAS content is untouched', async () => {
    const menu = await mount('menu', { rows: [{ name: 'Kaffee', price: 4.5 }] });
    expect(menu.text).toContain('Kaffee');
    expect(menu.text).notToContain('Add menu items');
    const kpi = await mount('kpi-cards', { source: 'inline', cards: [{ label: 'Besucher', value: 5 }] });
    expect(kpi.text).toContain('Besucher');
    expect(kpi.text).notToContain('Add cards');
  });
});
