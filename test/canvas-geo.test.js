// Pure canvas geometry — the rotated-resize math + rotation-from-pointer that
// back the on-canvas drag handles. These are framework-free and DOM-free, so
// they run headlessly in run-node.mjs as well as the browser suite.
//
// The hard invariant for rotated resize (Figma/PowerPoint behaviour): dragging a
// handle resizes along the widget's OWN axes while the OPPOSITE edge/corner stays
// pinned where it is on screen. At deg=0 the math must collapse onto the old
// axis-aligned behaviour (incl. the MIN-size edge handling) so non-rotated
// widgets are byte-for-byte unchanged.

import { describe, test, expect } from './runner.js';
import { resizeRotated, rotationFromPointer, clampRect, alignRect } from '../admin/canvas/widget-frame.js';

const SW = 1600, SH = 900; // stage on-screen px (square device pixels)

// Screen px position of a rect corner/edge under rotation `deg`.
// sx,sy ∈ {-1,0,1} pick the local offset from the centre (−1 = left/top edge).
function anchorScreen(r, deg, sx, sy) {
  const th = (deg * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th);
  const cx = ((r.x + r.w / 2) / 100) * SW, cy = ((r.y + r.h / 2) / 100) * SH;
  const ox = (sx * r.w / 2 / 100) * SW, oy = (sy * r.h / 2 / 100) * SH;
  return { x: cx + ox * cos - oy * sin, y: cy + ox * sin + oy * cos };
}
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

describe('geo · resizeRotated (axis-aligned baseline, deg=0)', () => {
  const base = { x: 40, y: 40, w: 20, h: 20 };

  test('east handle grows width, leaves x/y/h untouched', () => {
    const r = resizeRotated({ startRect: base, mode: 'e', dxPx: 160, dyPx: 0, deg: 0, stageW: SW, stageH: SH });
    expect(near(r.w, 30)).toBe(true);   // +160px / 1600 * 100 = +10%
    expect(near(r.x, 40)).toBe(true);
    expect(near(r.y, 40)).toBe(true);
    expect(near(r.h, 20)).toBe(true);
  });

  test('west handle moves x and grows width (legacy parity)', () => {
    const r = resizeRotated({ startRect: base, mode: 'w', dxPx: -160, dyPx: 0, deg: 0, stageW: SW, stageH: SH });
    expect(near(r.w, 30)).toBe(true);
    expect(near(r.x, 30)).toBe(true);
  });

  test('north-west drag past the far edges clamps to MIN and anchors the SE corner', () => {
    const r = resizeRotated({ startRect: base, mode: 'nw', dxPx: 1000, dyPx: 1000, deg: 0, stageW: SW, stageH: SH });
    expect(r.w).toBe(3); expect(r.h).toBe(3);                 // MIN size
    expect(near(r.x, base.x + base.w - 3)).toBe(true);        // legacy: startX + startW − MIN
    expect(near(r.y, base.y + base.h - 3)).toBe(true);
  });
});

describe('geo · resizeRotated (rotated keeps opposite side fixed)', () => {
  const base = { x: 40, y: 40, w: 20, h: 20 };

  test('deg=90 east handle: width grows and the west edge stays put on screen', () => {
    const deg = 90; // local x-axis points screen-down, so a downward drag grows width
    const r = resizeRotated({ startRect: base, mode: 'e', dxPx: 0, dyPx: 180, deg, stageW: SW, stageH: SH });
    expect(r.w > base.w).toBe(true);
    const a0 = anchorScreen(base, deg, -1, 0), a1 = anchorScreen(r, deg, -1, 0);
    expect(near(a0.x, a1.x)).toBe(true);
    expect(near(a0.y, a1.y)).toBe(true);
  });

  test('deg=45 SE corner: both dims grow and the NW corner stays put on screen', () => {
    const deg = 45;
    const r = resizeRotated({ startRect: base, mode: 'se', dxPx: 0, dyPx: 170, deg, stageW: SW, stageH: SH });
    expect(r.w > base.w).toBe(true);
    expect(r.h > base.h).toBe(true);
    const a0 = anchorScreen(base, deg, -1, -1), a1 = anchorScreen(r, deg, -1, -1);
    expect(near(a0.x, a1.x)).toBe(true);
    expect(near(a0.y, a1.y)).toBe(true);
  });
});

describe('geo · rotationFromPointer', () => {
  test('cardinal directions (handle sits at the top → up = 0°)', () => {
    expect(rotationFromPointer(100, 0, 100, 100)).toBe(0);     // up
    expect(rotationFromPointer(200, 100, 100, 100)).toBe(90);  // right
    expect(rotationFromPointer(100, 200, 100, 100)).toBe(180); // down
    expect(rotationFromPointer(0, 100, 100, 100)).toBe(270);   // left
  });

  test('snaps to 15° increments when asked', () => {
    const at = (degFromUp, snap) => rotationFromPointer(
      100 + Math.sin(degFromUp * Math.PI / 180) * 100,
      100 - Math.cos(degFromUp * Math.PI / 180) * 100, 100, 100, snap);
    expect(at(7, 15)).toBe(0);
    expect(at(10, 15)).toBe(15);
    expect(at(46, 15)).toBe(45);
  });
});

// clampRect is the one gate every rect in the editor passes through, and a
// component that was not a number sailed straight past it: Math.min(100,
// undefined) is NaN, and NaN spreads sideways — a rect of `{ x: 10, y: 10 }`
// came back with its VALID x and y destroyed too. On screen that is
// `left: NaN%`, which CSS ignores: the widget sits at the origin, cannot be
// dragged, and gives no hint why.
describe('clampRect · a rect that is not quite a rect', () => {
  test('REGRESSION: a missing size does not destroy the position', () => {
    const r = clampRect({ x: 10, y: 10 });
    for (const k of ['x', 'y', 'w', 'h']) expect(Number.isFinite(r[k])).toBe(true);
    // Full-bleed, which is the schema's own fallback: visible, and obviously
    // in need of attention. A 3% speck would be worse — you cannot find it.
    expect(r).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  test('REGRESSION: text where a number belongs falls back, it does not spread', () => {
    const r = clampRect({ x: 'abc', y: 10, w: 50, h: 20 });
    expect(r).toEqual({ x: 0, y: 10, w: 50, h: 20 });
  });

  test('a well-formed rect is untouched', () => {
    expect(clampRect({ x: 10, y: 10, w: 50, h: 20 })).toEqual({ x: 10, y: 10, w: 50, h: 20 });
  });

  test('the existing coercions are unchanged', () => {
    // null has always meant 0 here, and Infinity has always clamped to the
    // edge rather than falling back — neither is a mistake to "fix".
    expect(clampRect({ x: null, y: null, w: null, h: null })).toEqual({ x: 0, y: 0, w: 3, h: 3 });
    expect(clampRect({ x: Infinity, y: 0, w: 50, h: 20 })).toEqual({ x: 50, y: 0, w: 50, h: 20 });
  });

  test('every component comes back finite whatever went in', () => {
    const junk = [undefined, null, NaN, 'x', {}, [], Infinity, -Infinity, '12'];
    for (const v of junk) {
      for (const k of ['x', 'y', 'w', 'h']) {
        const r = clampRect({ x: 10, y: 10, w: 50, h: 20, [k]: v });
        for (const kk of ['x', 'y', 'w', 'h']) expect(Number.isFinite(r[kk])).toBe(true);
      }
    }
  });
});

// Aligning a widget to the slide — the commonest operation in any slide editor
// and the one this one did not have. The layout presets next door replace the
// whole rect, position AND size, which is a different job; the only way to
// centre something without resizing it was to work out (100 − w) / 2 and type
// it into the X field.
describe('alignRect · move to an edge, keep the size', () => {
  const r = { x: 12, y: 7, w: 40, h: 30 };

  test('the six edges land where their names say', () => {
    expect(alignRect(r, 'left')).toEqual({ x: 0, y: 7, w: 40, h: 30 });
    expect(alignRect(r, 'hcenter')).toEqual({ x: 30, y: 7, w: 40, h: 30 });
    expect(alignRect(r, 'right')).toEqual({ x: 60, y: 7, w: 40, h: 30 });
    expect(alignRect(r, 'top')).toEqual({ x: 12, y: 0, w: 40, h: 30 });
    expect(alignRect(r, 'vmiddle')).toEqual({ x: 12, y: 35, w: 40, h: 30 });
    expect(alignRect(r, 'bottom')).toEqual({ x: 12, y: 70, w: 40, h: 30 });
  });

  test('REGRESSION: the size never changes — that is the whole point', () => {
    for (const edge of ['left', 'hcenter', 'right', 'top', 'vmiddle', 'bottom']) {
      const out = alignRect(r, edge);
      expect(out.w).toBe(r.w);
      expect(out.h).toBe(r.h);
    }
  });

  test('a full-width widget is already centred and stays put', () => {
    expect(alignRect({ x: 5, y: 5, w: 100, h: 20 }, 'hcenter')).toEqual({ x: 0, y: 5, w: 100, h: 20 });
    expect(alignRect({ x: 5, y: 5, w: 100, h: 20 }, 'right')).toEqual({ x: 0, y: 5, w: 100, h: 20 });
  });

  test('an unknown edge changes nothing but still returns a clean rect', () => {
    expect(alignRect(r, 'sideways')).toEqual(r);
    expect(alignRect(r, undefined)).toEqual(r);
  });

  test('it inherits clampRect, so a malformed rect cannot escape through it', () => {
    const out = alignRect({ x: 'a', y: 5 }, 'hcenter');
    for (const k of ['x', 'y', 'w', 'h']) expect(Number.isFinite(out[k])).toBe(true);
  });

  test('aligning twice to the same edge is idempotent', () => {
    const once = alignRect(r, 'bottom');
    expect(alignRect(once, 'bottom')).toEqual(once);
  });
});
