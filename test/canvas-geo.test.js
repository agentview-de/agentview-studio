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
import { resizeRotated, rotationFromPointer } from '../admin/canvas/widget-frame.js';

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
