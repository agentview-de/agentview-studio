// Canvas widget stacking + hit-testing — the regression net for "widgets vanish
// from the preview but still show in the slide rail" and "I can't select a
// widget because one with a SMALLER z keeps catching the click".
//
// This is a DOM + CSS integration suite: it mounts the REAL editor canvas, loads
// the REAL styles/studio.css, and asserts what the user actually experiences via
// document.elementFromPoint(). It therefore lives in its OWN page
// (test/canvas-zorder.test.html) rather than the shared test/index.html, which
// has no editor stylesheet — the slide-bg floor (z-index) and the stage's
// stacking context (isolation) are CSS, and faking them here would only test the
// fake. Run: open /test/canvas-zorder.test.html via the dev server.
//
// Root causes this locks down (all three shipped together):
//   1. buildFrame used `z + 1` while setWidgetGeometry used `z` — an inspector
//      geometry/Z edit silently dropped a frame one z-index level, creating ties.
//   2. refreshWidget appended the rebuilt frame to the END of the stage, so on a
//      z-index tie the refreshed (often lower-z) widget won the stack.
//   3. A negative widget z (repeated "send to back") drove the frame's z-index
//      below the always-opaque slide-bg layer, hiding it on the canvas while it
//      still rendered as a block in the slide-rail thumbnail.

import { describe, test, expect } from './runner.js';
import { state } from '../admin/store.js';
import { mountCanvas, renderSlide, setWidgetGeometry, setWidgetRotation, refreshWidget, zoomToFit } from '../admin/canvas/canvas.js';
import { createPlaylist, createSlide, createWidget } from '../shared/slide-schema.js';
import '../shared/plugins/all.js';

// Mount the canvas exactly once into a fixed-size host (layout is required for
// getBoundingClientRect / elementFromPoint to mean anything), then reuse it.
let _mounted = false;
function mountOnce() {
  if (_mounted) return;
  const host = document.createElement('div');
  host.id = 'zorder-host';
  host.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:450px;background:#222;';
  document.body.appendChild(host);
  state.playlist = createPlaylist('zorder');
  const s = createSlide({ duration: 10 });
  state.playlist.slides = [s];
  state.ui.activeSlideId = s.id;
  state.ui.selectedWidgetId = null;
  mountCanvas(host);
  _mounted = true;
}

// Replace the active slide's widgets and draw, fitted into the host.
function showWidgets(widgets) {
  mountOnce();
  const slide = state.playlist.slides.find(s => s.id === state.ui.activeSlideId);
  delete slide.background; // fall back to the opaque theme bg (the disappear case)
  slide.widgets = widgets;
  state.ui.selectedWidgetId = null;
  renderSlide();
  zoomToFit();
  return slide;
}

const frame = id => document.querySelector(`.avs-widget-frame[data-id="${id}"]`);

// Which widget would actually receive a click at the centre of `id`'s frame?
// Returns the hit frame's widget id, or a 'NONFRAME:<class>' marker.
function clickHitAtCentreOf(id) {
  const r = frame(id).getBoundingClientRect();
  const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  return el?.closest?.('.avs-widget-frame')?.dataset?.id ?? ('NONFRAME:' + (el?.className ?? ''));
}
function clickHitAt(xFracOfStage, yFracOfStage) {
  const st = document.querySelector('.avs-stage').getBoundingClientRect();
  const el = document.elementFromPoint(Math.round(st.left + st.width * xFracOfStage), Math.round(st.top + st.height * yFracOfStage));
  return el?.closest?.('.avs-widget-frame')?.dataset?.id ?? ('NONFRAME:' + (el?.className ?? ''));
}
const w = (id, z, rect) => createWidget('text', { id, z, rect, content: { body: `<p>${id}</p>` } });

describe('canvas · widget stacking & hit-testing', () => {
  test('the higher-z widget keeps catching the click — even after an inspector geometry edit + a content refresh of the lower one', () => {
    // A (z=1) spans the slide; B (z=2) sits on top inside A. B must win the click.
    showWidgets([w('A', 1, { x: 10, y: 10, w: 80, h: 80 }), w('B', 2, { x: 30, y: 30, w: 40, h: 40 })]);
    expect(clickHitAtCentreOf('B')).toBe('B');

    // The exact sequence that used to invert the stack:
    //  (1) an inspector geometry edit on B (routes through setWidgetGeometry)
    //  (2) a content edit on A (routes through refreshWidget)
    const B = state.playlist.slides[0].widgets.find(x => x.id === 'B');
    setWidgetGeometry('B', { ...B.rect });
    refreshWidget('A');

    expect(clickHitAtCentreOf('B')).toBe('B');
    // The smoking gun: B's z-index must NOT have drifted below A's.
    expect(+getComputedStyle(frame('B')).zIndex).toBe(3);
    expect(+getComputedStyle(frame('A')).zIndex).toBe(2);
  });

  test('setWidgetGeometry assigns the SAME z-index buildFrame does (no off-by-one)', () => {
    showWidgets([w('only', 4, { x: 20, y: 20, w: 40, h: 40 })]);
    const fromRender = getComputedStyle(frame('only')).zIndex;
    setWidgetGeometry('only', { x: 20, y: 20, w: 40, h: 40 });
    expect(getComputedStyle(frame('only')).zIndex).toBe(fromRender);
    expect(fromRender).toBe('5'); // z (4) + 1
  });

  test('refreshWidget keeps the stage DOM in ascending-z order (does not shove the refreshed frame on top)', () => {
    showWidgets([w('lo', 1, { x: 10, y: 10, w: 50, h: 50 }), w('hi', 2, { x: 40, y: 40, w: 50, h: 50 })]);
    refreshWidget('lo'); // editing the lower widget must not lift it above the higher one
    const order = [...document.querySelectorAll('.avs-widget-frame')].map(f => f.dataset.id);
    expect(order).toEqual(['lo', 'hi']);
    expect(clickHitAt(0.55, 0.55)).toBe('hi'); // overlap belongs to the higher-z widget
  });

  test('a widget sent far to the back stays ABOVE the (opaque) slide background', () => {
    // z = -3 → frame z-index -2; only visible if the slide-bg floor + stage
    // stacking context keep it above the backdrop.
    showWidgets([w('back', -3, { x: 25, y: 25, w: 50, h: 50 })]);
    expect(clickHitAtCentreOf('back')).toBe('back');
    expect(+getComputedStyle(document.querySelector('.avs-slide-bg')).zIndex).toBe(-9999);
  });

  test('the slide background still covers the stage where no widget sits', () => {
    showWidgets([w('small', 0, { x: 40, y: 40, w: 10, h: 10 })]);
    // A corner with no widget must hit the slide-bg layer (proof the bg paints
    // above the stage backdrop despite its very negative z-index).
    expect(clickHitAt(0.02, 0.02)).toBe('NONFRAME:avs-slide-bg');
  });

  test('two back widgets keep their relative order across a refresh', () => {
    showWidgets([w('bk_hi', -3, { x: 20, y: 20, w: 50, h: 50 }), w('bk_lo', -6, { x: 35, y: 35, w: 50, h: 50 })]);
    expect(clickHitAt(0.45, 0.45)).toBe('bk_hi'); // -3 sits above -6
    refreshWidget('bk_lo');                        // refreshing the lower one must not flip it
    expect(clickHitAt(0.45, 0.45)).toBe('bk_hi');
  });
});

describe('canvas · widget rotation', () => {
  const rw = (id, rotation) => createWidget('text', { id, z: 1, rotation, rect: { x: 30, y: 30, w: 40, h: 40 }, content: { body: `<p>${id}</p>` } });

  test('a rotated widget renders the CSS `rotate` on its frame (not transform — so builds/loops compose)', () => {
    showWidgets([rw('r1', 45)]);
    expect(getComputedStyle(frame('r1')).rotate).toContain('45deg');
  });

  test('setWidgetRotation updates the frame live, and 0 clears it', () => {
    showWidgets([rw('r2', 0)]);
    setWidgetRotation('r2', 30);
    expect(getComputedStyle(frame('r2')).rotate).toContain('30deg');
    setWidgetRotation('r2', 0);
    const cleared = getComputedStyle(frame('r2')).rotate;
    expect(cleared === 'none' || cleared === '' || cleared === '0deg').toBe(true);
  });

  test('the rotate handle exists and is only visible when the widget is selected', () => {
    showWidgets([rw('r3', 0)]);
    expect(!!frame('r3').querySelector('.avs-rotate-handle')).toBe(true);
    expect(getComputedStyle(frame('r3').querySelector('.avs-rotate-handle')).display).toBe('none');
    state.ui.selectedWidgetId = 'r3'; renderSlide();
    expect(getComputedStyle(frame('r3').querySelector('.avs-rotate-handle')).display).toBe('block');
    state.ui.selectedWidgetId = null; renderSlide();
  });
});

// Whose arrow key is this?
//
// The canvas nudges the selected widget with the arrow keys while its frame has
// focus — real keyboard access, and the only way a pointer-less user can arrange
// anything. But the inline text editor makes `.bb-body`, INSIDE that same frame,
// contenteditable. Its arrow keys bubbled straight into the nudge handler: while
// writing on the canvas, ← slid the widget sideways and the caret never moved,
// because the handler also called preventDefault().
//
// This drives the REAL frame built by renderSlide(), not a copy of the rule.
describe('canvas · arrow keys while writing belong to the caret', () => {
  const arrow = (el, key, mods = {}) => {
    const e = new KeyboardEvent('keydown', {
      key, bubbles: true, cancelable: true,
      shiftKey: !!mods.shift, altKey: !!mods.alt, ctrlKey: !!mods.ctrl, metaKey: !!mods.meta,
    });
    el.dispatchEvent(e);
    return e;
  };

  test('REGRESSION: an arrow key from the editable body does not move the widget', async () => {
    const w = createWidget('text', { z: 1, rect: { x: 20, y: 20, w: 40, h: 30 }, content: { body: '<p>Text</p>' } });
    showWidgets([w]);
    const frame = document.querySelector(`.avs-widget-frame[data-id="${w.id}"]`);
    expect(frame === null).toBeFalsy();
    const body = frame.querySelector('.bb-body');
    expect(body === null).toBeFalsy();

    // Exactly what enterInlineTextEdit() does to that element.
    body.contentEditable = 'true';
    try {
      const before = { ...w.rect };
      const e = arrow(body, 'ArrowLeft');
      expect(w.rect.x).toBe(before.x);
      expect(w.rect.y).toBe(before.y);
      // …and the caret gets the keystroke it was aimed at.
      expect(e.defaultPrevented).toBeFalsy();
      // Selecting text with shift+arrow is the body's business too.
      arrow(body, 'ArrowRight', { shift: true });
      expect(w.rect.x).toBe(before.x);
    } finally {
      body.contentEditable = 'false';
      body.removeAttribute('contenteditable');
    }
  });

  test('the frame itself still nudges — this is keyboard access, not decoration', () => {
    const w = createWidget('text', { z: 1, rect: { x: 20, y: 20, w: 40, h: 30 }, content: { body: '<p>Text</p>' } });
    showWidgets([w]);
    const frame = document.querySelector(`.avs-widget-frame[data-id="${w.id}"]`);
    const before = { ...w.rect };
    const e = arrow(frame, 'ArrowRight');
    expect(w.rect.x > before.x).toBeTruthy();
    expect(e.defaultPrevented).toBeTruthy();
    // Alt resizes rather than moves.
    const mid = { ...w.rect };
    arrow(frame, 'ArrowDown', { alt: true });
    expect(w.rect.h > mid.h).toBeTruthy();
  });
});
