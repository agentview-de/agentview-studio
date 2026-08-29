// Dragging things around the editor.
//
// The editor's upload drop zone is the WHOLE WINDOW (main.js), so it sees every
// internal drag too — and it treated all of them as an incoming upload. Three
// separate questions had been collapsed into one:
//
//   • Highlight? Reordering a slide put a 2px accent frame around the entire
//     editor, because an internal drag looks like any other drag if you never
//     ask what it carries.
//   • Still inside? dragleave BUBBLES from descendants, so crossing from one
//     child element to the next fired it on the zone itself: the affordance
//     flickered off and on all the way across the editor.
//   • Accept? A URL dragged out of a text editor arrives as text/plain and
//     nothing else, and its value cannot be read until the drop — so accepting
//     has to be more generous than highlighting, not the same test.
//
// And the reorder itself: the window-wide zone makes every pixel a valid drop
// target, so releasing a slide over the canvas ended the drag without the rail
// ever seeing a drop — while dragover had already moved the card. The rail then
// showed one order and the playlist held another.
//
// Browser-only: real DragEvents against a real DataTransfer.

import { test, expect, describe } from './runner.js';
import { makeDropZone, makeReorderable } from '../admin/ui/drag-drop.js';

const canForge = (() => { try { return !!new DataTransfer(); } catch { return false; } })();

// A drag carrying files, a link, or plain text — the three things that reach
// this code, and the reason the answers have to differ.
function transfer(kind) {
  const dt = new DataTransfer();
  if (kind === 'files') dt.items.add(new File(['x'], 'bild.png', { type: 'image/png' }));
  if (kind === 'link') { dt.setData('text/uri-list', 'https://example.org/x.png'); dt.setData('text/plain', 'https://example.org/x.png'); }
  if (kind === 'text') dt.setData('text/plain', 'https://example.org/x.png');
  if (kind === 'internal') dt.setData('text/plain', 's_slide_7');
  return dt;
}

const drag = (el, type, dt, extra = {}) =>
  el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true, ...extra }));

function zone() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:-3000px;top:0;width:300px;height:200px;';
  el.innerHTML = '<span id="dz-a">a</span><span id="dz-b">b</span>';
  document.body.appendChild(el);
  const drops = [];
  makeDropZone(el, (payload) => drops.push(payload));
  return { el, drops, lit: () => el.classList.contains('bb-drop-hover'), done: () => el.remove() };
}

describe('drop zone · it only lights up for something it can take', () => {
  test('REGRESSION: an internal drag does not light up the whole editor', () => {
    if (!canForge) return;
    const z = zone();
    try {
      drag(z.el, 'dragenter', transfer('internal'));
      expect(z.lit()).toBeFalsy();
      // Files and links are the real thing, and they do.
      drag(z.el, 'dragenter', transfer('files'));
      expect(z.lit()).toBeTruthy();
      drag(z.el, 'dragleave', transfer('files'));
      drag(z.el, 'dragenter', transfer('link'));
      expect(z.lit()).toBeTruthy();
    } finally { z.done(); }
  });

  test('REGRESSION: moving between children does not flicker the affordance off', () => {
    if (!canForge) return;
    const z = zone();
    try {
      const a = z.el.querySelector('#dz-a');
      const b = z.el.querySelector('#dz-b');
      drag(z.el, 'dragenter', transfer('files'));
      expect(z.lit()).toBeTruthy();
      // Leaving child a for child b: dragleave bubbles to the zone, but the
      // pointer never left it.
      drag(a, 'dragleave', transfer('files'), { relatedTarget: b });
      expect(z.lit()).toBeTruthy();
      // Leaving for good does turn it off.
      drag(b, 'dragleave', transfer('files'), { relatedTarget: document.body });
      expect(z.lit()).toBeFalsy();
    } finally { z.done(); }
  });

  test('a URL dragged in as plain text is still accepted', () => {
    if (!canForge) return;
    const z = zone();
    try {
      // No highlight — it is indistinguishable from an internal drag until the
      // drop, when the value can finally be read…
      drag(z.el, 'dragenter', transfer('text'));
      expect(z.lit()).toBeFalsy();
      // …but the drop is allowed, and the caller gets the text to judge.
      const over = new DragEvent('dragover', { dataTransfer: transfer('text'), bubbles: true, cancelable: true });
      z.el.dispatchEvent(over);
      expect(over.defaultPrevented).toBeTruthy();
      drag(z.el, 'drop', transfer('text'));
      expect(z.drops).toHaveLength(1);
      expect(z.drops[0].text).toBe('https://example.org/x.png');
      expect(z.drops[0].files).toEqual([]);
    } finally { z.done(); }
  });

  test('a dropped file reaches the callback and the affordance goes away', () => {
    if (!canForge) return;
    const z = zone();
    try {
      drag(z.el, 'dragenter', transfer('files'));
      drag(z.el, 'drop', transfer('files'));
      expect(z.lit()).toBeFalsy();
      expect(z.drops).toHaveLength(1);
      expect(z.drops[0].files.map(f => f.name)).toEqual(['bild.png']);
    } finally { z.done(); }
  });

  test('filesOnly zones ignore text entirely', () => {
    if (!canForge) return;
    const el = document.createElement('div');
    document.body.appendChild(el);
    const drops = [];
    makeDropZone(el, p => drops.push(p), { filesOnly: true });
    try {
      const over = new DragEvent('dragover', { dataTransfer: transfer('text'), bubbles: true, cancelable: true });
      el.dispatchEvent(over);
      expect(over.defaultPrevented).toBeFalsy();
      drag(el, 'drop', transfer('text'));
      expect(drops).toEqual([]);
      drag(el, 'drop', transfer('files'));
      expect(drops).toHaveLength(1);
    } finally { el.remove(); }
  });
});

describe('reorderable list · a drag that ends elsewhere changes nothing', () => {
  function list() {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-3000px;top:0;width:200px;';
    host.innerHTML = ['a', 'b', 'c'].map(id =>
      `<div class="bb-card" draggable="true" data-id="${id}" style="height:40px">${id}</div>`).join('');
    document.body.appendChild(host);
    const moves = [];
    makeReorderable(host, { onMove: ids => moves.push(ids) });
    return {
      host, moves,
      order: () => [...host.querySelectorAll('.bb-card')].map(el => el.dataset.id),
      card: id => host.querySelector(`[data-id="${id}"]`),
      done: () => host.remove(),
    };
  }

  test('REGRESSION: releasing outside the list puts the card back', () => {
    if (!canForge) return;
    const l = list();
    try {
      const dt = transfer('internal');
      drag(l.card('c'), 'dragstart', dt);
      // dragover moved it to the front while the pointer was over the list…
      l.host.insertBefore(l.card('c'), l.card('a'));
      expect(l.order()).toEqual(['c', 'a', 'b']);
      // …and then the pointer left and the drag ended somewhere else.
      drag(l.card('c'), 'dragend', dt);
      expect(l.order()).toEqual(['a', 'b', 'c']);
      expect(l.moves).toEqual([]);       // and nothing was committed
    } finally { l.done(); }
  });

  test('a card dragged from the end back to the front is restored too', () => {
    if (!canForge) return;
    const l = list();
    try {
      const dt = transfer('internal');
      drag(l.card('a'), 'dragstart', dt);
      l.host.appendChild(l.card('a'));
      expect(l.order()).toEqual(['b', 'c', 'a']);
      drag(l.card('a'), 'dragend', dt);
      expect(l.order()).toEqual(['a', 'b', 'c']);
    } finally { l.done(); }
  });

  test('REGRESSION: a card nobody can see is not a drop target', () => {
    // The slide rail hides filtered-out cards with `hidden` (display:none), and
    // a display:none element reports a 0×0 box at 0,0 — its "centre" is the
    // top-left corner of the window. It joined the nearest-centre contest from
    // there, so dragging towards that corner dropped the card next to one that
    // was not on screen: an order nobody chose.
    if (!canForge) return;
    const host = document.createElement('div');
    // Laid out for real, and away from the origin so the hidden card's phantom
    // centre is the closest thing to the cursor.
    host.style.cssText = 'position:fixed;left:400px;top:400px;width:200px;';
    host.innerHTML = ['a', 'b', 'c'].map(id =>
      `<div class="bb-card" draggable="true" data-id="${id}" style="height:40px">${id}</div>`).join('');
    document.body.appendChild(host);
    const moves = [];
    makeReorderable(host, { onMove: ids => moves.push(ids) });
    const order = () => [...host.querySelectorAll('.bb-card')].map(el => el.dataset.id);
    const card = id => host.querySelector(`[data-id="${id}"]`);
    try {
      // What the rail's filter does. On a plain card the UA's `[hidden]` rule is
      // enough; the rail's own cards are display:grid and need the explicit
      // `.avs-slide-card[hidden]` rule in studio.css to actually disappear —
      // that half is pinned on the CSS page (rail-css.test.js), because it was
      // once wrong and no JS test could see it.
      card('b').hidden = true;
      expect(card('b').offsetParent).toBe(null);   // …not rendered, not a target
      const dt = transfer('internal');
      drag(card('c'), 'dragstart', dt);
      // Drag towards the window's top-left corner: nearer to the hidden card's
      // phantom centre (0,0) than to any real one.
      drag(host, 'dragover', dt, { clientX: 5, clientY: 5 });
      drag(card('c'), 'drop', dt);
      drag(card('c'), 'dragend', dt);
      // It landed next to a card that IS on screen — the first one, which is
      // what the cursor was closest to among the visible ones.
      expect(order()).toEqual(['c', 'a', 'b']);
      expect(moves).toEqual([['c', 'a', 'b']]);
    } finally { host.remove(); }
  });

  test('a real drop commits the new order and keeps it', () => {
    if (!canForge) return;
    const l = list();
    try {
      const dt = transfer('internal');
      drag(l.card('c'), 'dragstart', dt);
      l.host.insertBefore(l.card('c'), l.card('a'));
      drag(l.card('c'), 'drop', dt);
      drag(l.card('c'), 'dragend', dt);
      expect(l.moves).toEqual([['c', 'a', 'b']]);
      expect(l.order()).toEqual(['c', 'a', 'b']);   // not undone by dragend
    } finally { l.done(); }
  });
});
