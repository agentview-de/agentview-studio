// Editor interaction — the regression net for the multi-select / grouping /
// layers / master work.
//
// WHY THIS FILE EXISTS. Every one of the bugs below was found by driving the
// real editor by hand, and not one of them was caught by a test:
//
//   * a group drag snapped back the instant you let go
//   * shift-click undid the selection it had just made
//   * clicking a group selected one member instead of the group
//   * a locked widget could still be dragged
//   * the slide master rendered BEHIND the slide background — invisible on the
//     canvas and on the wall
//   * a stale selection restored from localStorage produced an Arrange panel
//     that counted widgets nobody could see
//
// The pure geometry has good coverage (arrange / smart-snap / master tests). The
// WIRING had none, and the wiring is where all of it went wrong. So this suite
// dispatches real pointer events at real frames and asserts what the model and
// the stylesheet actually end up saying.
//
// It shares a page with canvas-zorder.test.js because it needs the same two
// things: real layout and the real editor stylesheet. Like that suite it mounts
// its own canvas on first use; the module-level stage then points here, which is
// safe because the runner finishes one suite before starting the next.

import { describe, test, expect } from './runner.js';
import { state } from '../admin/store.js';
import {
  mountCanvas, renderSlide, zoomToFit, selectedIds, selectionCount,
  selectAllWidgets, groupSelection, ungroupSelection, selectionGroupState,
  setSelectionFromLayers,
} from '../admin/canvas/canvas.js';
import { createPlaylist, createSlide, createWidget } from '../shared/slide-schema.js';
import '../shared/plugins/all.js';

let _mounted = false;
function mountOnce() {
  if (_mounted) return;
  const host = document.createElement('div');
  host.id = 'interaction-host';
  host.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:450px;background:#222;';
  document.body.appendChild(host);
  state.playlist = createPlaylist('interaction');
  const s = createSlide({ duration: 10 });
  state.playlist.slides = [s];
  state.ui.activeSlideId = s.id;
  state.ui.selectedWidgetId = null;
  state.ui.selectedWidgetIds = [];
  mountCanvas(host);
  _mounted = true;
}

const w = (id, rect, extra = {}) =>
  createWidget('text', { id, z: 0, rect, content: { body: `<p>${id}</p>` }, ...extra });

// Put these widgets on the slide and draw. Returns the live slide.
function show(widgets, { master = null } = {}) {
  mountOnce();
  const slide = state.playlist.slides.find(s => s.id === state.ui.activeSlideId);
  delete slide.background;
  delete slide.noMaster;
  slide.widgets = widgets;
  if (master) state.playlist.master = createSlide({ id: 'master', widgets: master });
  else delete state.playlist.master;
  state.ui.editingMaster = false;
  state.ui.selectedWidgetId = null;
  state.ui.selectedWidgetIds = [];
  renderSlide();
  zoomToFit();
  return slide;
}

const frame = id => document.querySelector(`.avs-widget-frame[data-id="${id}"]`);
const rectOf = id => {
  const x = state.playlist.slides[0].widgets.find(k => k.id === id);
  return { x: x.rect.x, y: x.rect.y };
};
const centre = (el) => {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
};

const pev = (type, target, x, y, mods = {}) => target.dispatchEvent(new PointerEvent(type, {
  bubbles: true, cancelable: true, pointerId: 1, button: 0, isPrimary: true,
  clientX: x, clientY: y, ...mods,
}));

// A real drag: press on the frame, move, release. `dx`/`dy` are screen pixels.
function drag(id, dx, dy, mods = {}) {
  const el = frame(id);
  const c = centre(el);
  pev('pointerdown', el, c.x, c.y, mods);
  pev('pointermove', window, c.x + dx, c.y + dy, mods);
  pev('pointerup', window, c.x + dx, c.y + dy, mods);
}

// A click that does not move — the gesture that used to collapse selections.
function tap(id, mods = {}) {
  const el = frame(id);
  const c = centre(el);
  pev('pointerdown', el, c.x, c.y, mods);
  pev('pointerup', window, c.x, c.y, mods);
}

describe('editor · group drag', () => {
  test('REGRESSION: every member keeps the delta after the pointer is released', () => {
    // The bug: the delta was measured against the widget's LIVE rect, so the
    // final 'end' event (whose rect IS the live rect) had a delta of zero and
    // re-applied the followers' original positions — the group snapped back the
    // instant you let go, while the widget under the pointer stayed put.
    show([w('a', { x: 10, y: 10, w: 20, h: 20 }), w('b', { x: 40, y: 10, w: 20, h: 20 })]);
    selectAllWidgets();
    expect(selectionCount()).toBe(2);

    const beforeA = rectOf('a'), beforeB = rectOf('b');
    drag('a', 40, 20);
    const afterA = rectOf('a'), afterB = rectOf('b');

    const dxA = afterA.x - beforeA.x, dxB = afterB.x - beforeB.x;
    const dyA = afterA.y - beforeA.y, dyB = afterB.y - beforeB.y;
    expect(dxA > 0).toBe(true);            // it actually moved
    expect(dxB).toBe(dxA);                 // …and b came with it
    expect(dyB).toBe(dyA);
  });

  test('the group is clamped as one — the arrangement survives the slide edge', () => {
    // Dragging hard left: the LEFT member can only travel to 0, so both stop
    // there together. Clamping each rect on its own would squash the gap.
    show([w('a', { x: 5, y: 40, w: 20, h: 20 }), w('b', { x: 60, y: 40, w: 20, h: 20 })]);
    selectAllWidgets();
    const gapBefore = rectOf('b').x - rectOf('a').x;
    drag('b', -2000, 0);
    expect(rectOf('a').x).toBe(0);
    expect(rectOf('b').x - rectOf('a').x).toBe(gapBefore);
  });
});

describe('editor · selection gestures', () => {
  test('REGRESSION: shift-click ADDS to the selection instead of undoing itself', () => {
    // The bug: the tap handler narrowed any multi-selection to the widget under
    // the pointer — including on the very gesture that had just added it, so a
    // shift-click could never build a selection of more than one.
    show([w('a', { x: 10, y: 10, w: 20, h: 20 }), w('b', { x: 40, y: 10, w: 20, h: 20 })]);
    tap('a');
    expect(selectionCount()).toBe(1);
    tap('b', { shiftKey: true });
    expect(selectionCount()).toBe(2);
    expect(selectedIds().includes('a')).toBe(true);
    expect(selectedIds().includes('b')).toBe(true);
  });

  test('shift-clicking a selected widget removes it again', () => {
    show([w('a', { x: 10, y: 10, w: 20, h: 20 }), w('b', { x: 40, y: 10, w: 20, h: 20 })]);
    selectAllWidgets();
    tap('b', { shiftKey: true });
    expect(selectedIds()).toEqual(['a']);
  });

  test('a plain click on a member NARROWS a multi-selection to it', () => {
    show([w('a', { x: 10, y: 10, w: 20, h: 20 }), w('b', { x: 40, y: 10, w: 20, h: 20 })]);
    selectAllWidgets();
    tap('b');
    expect(selectedIds()).toEqual(['b']);
  });

  test('select-all skips locked and hidden widgets', () => {
    // "Select all" then a nudge would otherwise move the very background you
    // locked to stop moving, and a hidden widget has no frame to select.
    show([
      w('normal', { x: 10, y: 10, w: 20, h: 20 }),
      w('locked', { x: 40, y: 10, w: 20, h: 20 }, { locked: true }),
      w('hidden', { x: 70, y: 10, w: 20, h: 20 }, { hidden: true }),
    ]);
    selectAllWidgets();
    expect(selectedIds()).toEqual(['normal']);
  });
});

describe('editor · grouping', () => {
  test('REGRESSION: clicking a grouped widget selects the WHOLE group', () => {
    // The bug: the tap handler read the selection AFTER the click had expanded
    // it to the group, saw a multi-selection, and narrowed it straight back —
    // so a group could be selected, but never for longer than one frame.
    show([w('a', { x: 10, y: 10, w: 20, h: 20 }), w('b', { x: 40, y: 10, w: 20, h: 20 })]);
    selectAllWidgets();
    expect(groupSelection()).toBe(true);
    state.ui.selectedWidgetId = null;          // deselect the way Escape does
    expect(selectionCount()).toBe(0);

    tap('a');
    expect(selectionCount()).toBe(2);
    expect(selectionGroupState()).toBe('grouped');
  });

  test('a SECOND click reaches one member inside the group', () => {
    show([w('a', { x: 10, y: 10, w: 20, h: 20 }), w('b', { x: 40, y: 10, w: 20, h: 20 })]);
    selectAllWidgets();
    groupSelection();
    state.ui.selectedWidgetId = null;
    tap('a');                                   // selects the group
    tap('a');                                   // reaches inside it
    expect(selectedIds()).toEqual(['a']);
  });

  test('ungroup makes the members individually selectable again', () => {
    show([w('a', { x: 10, y: 10, w: 20, h: 20 }), w('b', { x: 40, y: 10, w: 20, h: 20 })]);
    selectAllWidgets();
    groupSelection();
    expect(ungroupSelection()).toBe(true);
    state.ui.selectedWidgetId = null;
    tap('a');
    expect(selectedIds()).toEqual(['a']);
  });

  test('the group frame body is pointer-transparent, its handles are not', () => {
    // The frame must not swallow a drag that starts over a widget: "move the
    // selection" has ONE implementation, the ordinary widget drag underneath.
    show([w('a', { x: 10, y: 10, w: 30, h: 30 }), w('b', { x: 50, y: 10, w: 30, h: 30 })]);
    selectAllWidgets();
    const gf = document.querySelector('.avs-group-frame');
    expect(!!gf).toBe(true);
    expect(getComputedStyle(gf).pointerEvents).toBe('none');
    const handle = gf.querySelector('.avs-handle-se');
    expect(getComputedStyle(handle).pointerEvents).toBe('auto');
    expect(getComputedStyle(handle).display).notToBe('none');
    // No rotation handle: rotating members about the GROUP centre is not
    // expressible in the flat percent-rect model, so it must not be offered.
    expect(getComputedStyle(gf.querySelector('.avs-rotate-handle')).display).toBe('none');
  });
});

describe('editor · locked and hidden widgets', () => {
  test('REGRESSION: a locked widget cannot be dragged', () => {
    show([w('locked', { x: 20, y: 20, w: 30, h: 30 }, { locked: true })]);
    const before = rectOf('locked');
    drag('locked', 60, 60);
    expect(rectOf('locked')).toEqual(before);
  });

  test('a locked frame is pointer-transparent, so the click reaches past it', () => {
    show([w('locked', { x: 20, y: 20, w: 30, h: 30 }, { locked: true })]);
    expect(getComputedStyle(frame('locked')).pointerEvents).toBe('none');
  });

  test('a hidden widget gets no frame at all', () => {
    show([w('shown', { x: 10, y: 10, w: 20, h: 20 }), w('gone', { x: 40, y: 10, w: 20, h: 20 }, { hidden: true })]);
    expect(!!frame('shown')).toBe(true);
    expect(!!frame('gone')).toBe(false);
  });

  test('the Layers panel can still select a locked widget the canvas cannot', () => {
    // The lock was set in that panel, so that is where a person looks to undo
    // it — it has to be able to reach past the pointer-events block.
    show([w('locked', { x: 20, y: 20, w: 30, h: 30 }, { locked: true })]);
    setSelectionFromLayers('locked');
    expect(selectedIds()).toEqual(['locked']);
  });
});

describe('editor · slide master', () => {
  test('REGRESSION: master content renders ABOVE the slide background', () => {
    // The bug this locks down is the same one canvas-zorder.test.js already
    // guards for ordinary widgets: a large negative z put the master behind
    // .avs-slide-bg (z-index -9999), which paints over it — invisible on the
    // canvas AND on the wall, which is the worse half.
    show([w('own', { x: 10, y: 10, w: 20, h: 20 })], { master: [w('m', { x: 40, y: 40, w: 30, h: 30 })] });
    const ghost = document.querySelector('.avs-master-ghost');
    expect(!!ghost).toBe(true);
    const ghostZ = +getComputedStyle(ghost).zIndex;
    const bgZ = +getComputedStyle(document.querySelector('.avs-slide-bg')).zIndex;
    expect(ghostZ > bgZ).toBe(true);
    // …and still below the slide's own widgets.
    expect(ghostZ < +getComputedStyle(frame('own')).zIndex).toBe(true);
  });

  test('the master is not editable on an ordinary slide', () => {
    // Two ways to change one widget, one of which silently edits every other
    // slide, is how a master becomes a thing people are afraid of.
    show([w('own', { x: 10, y: 10, w: 20, h: 20 })], { master: [w('m', { x: 40, y: 40, w: 30, h: 30 })] });
    const ghost = document.querySelector('.avs-master-ghost');
    expect(getComputedStyle(ghost).pointerEvents).toBe('none');
    // It is not a widget frame, so nothing can select it.
    expect(ghost.classList.contains('avs-widget-frame')).toBe(false);
  });

  test('a slide that opted out shows no master', () => {
    const slide = show([w('own', { x: 10, y: 10, w: 20, h: 20 })], { master: [w('m', { x: 40, y: 40, w: 30, h: 30 })] });
    slide.noMaster = true;
    renderSlide();
    expect(document.querySelectorAll('.avs-master-ghost').length).toBe(0);
  });

  test('a hidden master widget reaches no slide', () => {
    show([w('own', { x: 10, y: 10, w: 20, h: 20 })],
      { master: [w('m', { x: 40, y: 40, w: 30, h: 30 }, { hidden: true })] });
    expect(document.querySelectorAll('.avs-master-ghost').length).toBe(0);
  });
});

describe('editor · restored selection', () => {
  test('REGRESSION: ids that are not on the slide do not survive the mount', () => {
    // ui.selectedWidgetIds is persisted and hydrate() assigns it back wholesale,
    // so a replaced playlist left a selection of ghosts behind: the Arrange
    // panel said "3 widgets selected" over nothing at all, and every button in
    // it silently did nothing.
    show([w('real', { x: 10, y: 10, w: 20, h: 20 })]);
    state.ui.selectedWidgetIds = ['gone1', 'gone2', 'gone3'];
    state.ui.selectedWidgetId = 'gone3';
    // What mountCanvas does on boot with the restored value.
    setSelectionFromLayers(null);
    expect(selectionCount()).toBe(0);
    expect(state.ui.selectedWidgetId).toBe(null);
  });

  test('a still-valid selection is kept', () => {
    show([w('a', { x: 10, y: 10, w: 20, h: 20 }), w('b', { x: 40, y: 10, w: 20, h: 20 })]);
    selectAllWidgets();
    expect(selectionCount()).toBe(2);
  });
});
