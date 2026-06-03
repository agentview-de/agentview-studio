// Pure canvas viewport + snap math, extracted from canvas.js into canvas-math.js
// so it runs without a DOM. canvas.js keeps only the thin wrappers that read
// module state, call these, write the result back, and paint guides/transform.
//
// Snap invariant: at deg≠0 the box isn't axis-aligned, so snapping is skipped
// and the rect is only clamped. Otherwise edges/centres within `threshold`
// percent of a canvas third/centre or another widget's edge snap, closest-wins.

import { describe, test, expect } from './runner.js';
import {
  SNAP, clampZoom, zoomAroundPoint, centerTransform, fitTransform,
  widgetTransform, computeSnap,
} from '../admin/canvas/canvas-math.js';

const near = (a, b, eps = 0.001) => Math.abs(a - b) <= eps;

describe('canvas-math · clampZoom', () => {
  test('clamps to [0.1, 4]', () => {
    expect(clampZoom(0)).toBe(0.1);
    expect(clampZoom(99)).toBe(4);
    expect(clampZoom(1.5)).toBe(1.5);
  });
});

describe('canvas-math · fitTransform', () => {
  test('fits stage into viewport at 0.92 margin and centres it', () => {
    const t = fitTransform(1600, 900, 1600, 900);
    expect(near(t.zoom, 0.92)).toBe(true);
    // centred: panX = (vw - sw*zoom)/2
    expect(near(t.panX, (1600 - 1600 * 0.92) / 2)).toBe(true);
    expect(near(t.panY, (900 - 900 * 0.92) / 2)).toBe(true);
  });
  test('picks the limiting axis (tall viewport → width-bound)', () => {
    const t = fitTransform(800, 5000, 1600, 900);
    expect(near(t.zoom, (800 / 1600) * 0.92)).toBe(true);
  });
});

describe('canvas-math · widgetTransform', () => {
  test('zooms a small widget toward it but caps at 2.5×', () => {
    const t = widgetTransform(1600, 900, 1600, 900, { x: 45, y: 45, w: 10, h: 10 });
    expect(t.zoom).toBe(2.5); // tiny widget would exceed the cap → clamped
  });
  test('centres the widget centre in the viewport centre', () => {
    const rect = { x: 0, y: 0, w: 50, h: 50 };
    const t = widgetTransform(1600, 900, 1600, 900, rect);
    const wxc = 1600 * 0.25, wyc = 900 * 0.25; // widget centre in stage px
    expect(near(t.panX, 800 - wxc * t.zoom)).toBe(true);
    expect(near(t.panY, 450 - wyc * t.zoom)).toBe(true);
  });
});

describe('canvas-math · zoomAroundPoint', () => {
  test('keeps the cursor point stationary while zooming', () => {
    const start = { zoom: 1, panX: 0, panY: 0 };
    const t = zoomAroundPoint(400, 300, 2, start);
    expect(t.zoom).toBe(2);
    // The stage coordinate under the cursor before and after must match.
    const before = (400 - start.panX) / start.zoom;
    const after = (400 - t.panX) / t.zoom;
    expect(near(before, after)).toBe(true);
  });
  test('respects the zoom clamp', () => {
    expect(zoomAroundPoint(0, 0, 100, { zoom: 1, panX: 0, panY: 0 }).zoom).toBe(4);
    expect(zoomAroundPoint(0, 0, 0.001, { zoom: 1, panX: 0, panY: 0 }).zoom).toBe(0.1);
  });
});

describe('canvas-math · centerTransform', () => {
  test('centres the canvas at the given zoom', () => {
    const t = centerTransform(1000, 800, 1600, 900, 0.5);
    expect(near(t.panX, (1000 - 1600 * 0.5) / 2)).toBe(true);
    expect(near(t.panY, (800 - 900 * 0.5) / 2)).toBe(true);
  });
});

describe('canvas-math · computeSnap', () => {
  test('rotated boxes are only clamped, never snapped (no guides)', () => {
    const out = computeSnap({ rect: { x: 10.04, y: 20.06, w: 30, h: 30 }, mode: 'move', rotated: true });
    expect(out.vLines).toHaveLength(0);
    expect(out.hLines).toHaveLength(0);
    expect(out.rect.x).toBe(10);   // clampRect rounds to 0.1
    expect(out.rect.y).toBe(20.1);
  });

  test('move snaps the left edge to canvas centre when within threshold', () => {
    // x=49 is within 1.5 of the centre line 50 → snap to 50.
    const out = computeSnap({ rect: { x: 49, y: 0, w: 10, h: 10 }, mode: 'move', others: [] });
    expect(out.rect.x).toBe(50);
    expect(out.vLines).toContain(50);
  });

  test('no snap when nothing is within threshold (just clamp)', () => {
    const out = computeSnap({ rect: { x: 20, y: 30, w: 10, h: 10 }, mode: 'move', others: [] });
    expect(out.rect.x).toBe(20);
    expect(out.vLines).toHaveLength(0);
    expect(out.hLines).toHaveLength(0);
  });

  test('snaps to another widget edge', () => {
    // other widget right edge at x=40; our left edge at 40.8 → snaps to 40.
    const others = [{ x: 10, y: 10, w: 30, h: 30 }]; // right edge = 40
    const out = computeSnap({ rect: { x: 40.8, y: 70, w: 10, h: 10 }, mode: 'move', others });
    expect(out.rect.x).toBe(40);
    expect(out.vLines).toContain(40);
  });

  test('east resize snaps the right edge and changes width, not x', () => {
    // right edge x+w = 49.2 → snaps to 50; x stays 10 → w becomes 40.
    const out = computeSnap({ rect: { x: 10, y: 70, w: 39.2, h: 10 }, mode: 'e', others: [] });
    expect(out.rect.x).toBe(10);
    expect(out.rect.w).toBe(40);
    expect(out.vLines).toContain(50);
  });

  test('tryAxis picks the closest of several candidate lines on one edge', () => {
    // West-resize only touches the left edge (no centre/right pass to override).
    // Left edge x=50.4: canvas centre 50 (0.4 away) beats an other-edge 51.2 (0.8).
    const others = [{ x: 51.2, y: 0, w: 0.0001, h: 10 }];
    const out = computeSnap({ rect: { x: 50.4, y: 80, w: 5, h: 5 }, mode: 'w', others });
    expect(out.rect.x).toBe(50);   // snapped left edge to the nearer centre line
    expect(out.rect.w).toBe(5.4);  // west resize grows width to keep the right edge
  });

  test('SNAP threshold export is the documented 1.5%', () => {
    expect(SNAP).toBe(1.5);
  });
});
