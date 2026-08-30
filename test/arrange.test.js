// Align / distribute / match-size / group-move — the arrange math behind a
// multi-widget selection.
//
// This is the part of multi-select that cannot be reviewed by looking at it: an
// off-by-one in an align rule shifts things by a pixel you will not notice until
// a customer's slide is on a wall, and the group-move clamp only misbehaves at
// the slide edge, which is exactly where nobody drags while testing by hand.

import { test, expect, describe } from './runner.js';
import {
  boundsOf, alignRects, distributeRects, matchSize, moveRects, scaleRects,
  ALIGN_MODES, DISTRIBUTE_AXES, MATCH_DIMS,
} from '../admin/canvas/arrange.js';

const r = (x, y, w, h) => ({ x, y, w, h });
// Three widgets of different sizes, scattered — the case every rule has to
// handle, and the one where "align to the bounding box" differs from every
// simpler rule you might reach for.
const SCATTER = [r(10, 10, 20, 10), r(40, 30, 30, 20), r(15, 60, 10, 15)];

describe('boundsOf', () => {
  test('the box that contains them all', () => {
    expect(boundsOf(SCATTER)).toEqual({ x: 10, y: 10, w: 60, h: 65 });
  });
  test('one rect is its own bounds', () => {
    expect(boundsOf([r(5, 6, 7, 8)])).toEqual({ x: 5, y: 6, w: 7, h: 8 });
  });
  test('nothing selected has no bounds — not a zero-sized box at the origin', () => {
    expect(boundsOf([])).toBe(null);
    expect(boundsOf(null)).toBe(null);
  });
});

describe('alignRects', () => {
  test('left / right / centre use the SELECTION bounds, not the slide', () => {
    // The leftmost of the three is at x=10, so "align left" brings them to 10 —
    // aligning to the slide would fling all three to x=0.
    expect(alignRects(SCATTER, 'left').map(a => a.x)).toEqual([10, 10, 10]);
    // bounds.x + bounds.w = 70 → each rect's right edge lands there.
    expect(alignRects(SCATTER, 'right').map(a => a.x)).toEqual([50, 40, 60]);
    // centre of the bounds is x=40 → x = 40 - w/2.
    expect(alignRects(SCATTER, 'hcenter').map(a => a.x)).toEqual([30, 25, 35]);
  });

  test('top / bottom / middle do the same on the other axis', () => {
    expect(alignRects(SCATTER, 'top').map(a => a.y)).toEqual([10, 10, 10]);
    expect(alignRects(SCATTER, 'bottom').map(a => a.y)).toEqual([65, 55, 60]);
    expect(alignRects(SCATTER, 'vmiddle').map(a => a.y)).toEqual([37.5, 32.5, 35]);
  });

  test('the other axis is left alone', () => {
    expect(alignRects(SCATTER, 'left').map(a => a.y)).toEqual(SCATTER.map(a => a.y));
    expect(alignRects(SCATTER, 'top').map(a => a.x)).toEqual(SCATTER.map(a => a.x));
  });

  test('sizes are never touched — align moves, it does not resize', () => {
    for (const mode of ALIGN_MODES) {
      const out = alignRects(SCATTER, mode);
      expect(out.map(a => [a.w, a.h])).toEqual(SCATTER.map(a => [a.w, a.h]));
    }
  });

  test('an unknown mode is a copy, not a crash and not a mutation', () => {
    const out = alignRects(SCATTER, 'sideways');
    expect(out).toEqual(SCATTER);
    expect(out[0]).notToBe(SCATTER[0]);
  });

  test('the input is never mutated', () => {
    const input = SCATTER.map(a => ({ ...a }));
    alignRects(input, 'right');
    expect(input).toEqual(SCATTER);
  });

  test('nothing escapes the slide', () => {
    const wide = [r(0, 0, 90, 10), r(50, 40, 60, 10)];
    for (const a of alignRects(wide, 'right')) {
      expect(a.x >= 0 && a.x + a.w <= 100.001).toBe(true);
    }
  });
});

describe('distributeRects', () => {
  test('equal GAPS, not equal centres', () => {
    // Widths 10 / 30 / 20 spanning x=0..100. Total width 60, two gaps → 20 each.
    // The three widths must all DIFFER for this test to be worth anything: with
    // a symmetric set (10 / 30 / 10) equal gaps and equal centres coincide, and
    // the assertion below would pass against either implementation.
    const out = distributeRects([r(0, 0, 10, 10), r(20, 0, 30, 10), r(80, 0, 20, 10)], 'h');
    expect(out.map(a => a.x)).toEqual([0, 30, 80]);
    // The whitespace between neighbours is identical…
    expect(out[1].x - (out[0].x + out[0].w)).toBe(20);
    expect(out[2].x - (out[1].x + out[1].w)).toBe(20);
    // …which is exactly what equal CENTRES would not have produced here.
    const centres = out.map(a => a.x + a.w / 2);
    expect(centres[1] - centres[0]).notToBe(centres[2] - centres[1]);
  });

  test('the two outermost never move — they define the span', () => {
    // Deliberately NOT the SCATTER fixture: its three rects are already evenly
    // spaced vertically, so every assertion about a vertical distribute would
    // pass without the function doing anything at all.
    const uneven = [r(0, 0, 10, 10), r(0, 15, 10, 20), r(0, 80, 10, 10)];
    const out = distributeRects(uneven, 'v');
    expect(out[0].y).toBe(0);                     // topmost, unmoved
    expect(out[2].y).toBe(80);                    // bottommost, unmoved
    // Total height 40 across a span of 90 → two gaps of 25, so the middle rect
    // starts at 0 + 10 + 25.
    expect(out[1].y).toBe(35);                    // the middle one is what moves
  });

  test('it works on rects given in any order, and keeps the caller order', () => {
    // Index 0 is the RIGHTMOST here; the result must still describe index 0.
    const jumbled = [r(90, 0, 10, 10), r(0, 0, 10, 10), r(20, 0, 30, 10)];
    const out = distributeRects(jumbled, 'h');
    expect(out[0].x).toBe(90);
    expect(out[1].x).toBe(0);
    expect(out[2].x).toBe(35);
  });

  test('fewer than three is a no-op — with two, the gap is already even', () => {
    const two = [r(0, 0, 10, 10), r(50, 0, 10, 10)];
    expect(distributeRects(two, 'h')).toEqual(two);
    expect(distributeRects([two[0]], 'h')).toEqual([two[0]]);
  });

  test('objects wider than their span overlap rather than refusing', () => {
    // 3 × 40 wide inside a span of 60: the gap is negative and they overlap,
    // which is what PowerPoint does too. It must not throw or clamp to a pile.
    const tight = [r(0, 0, 40, 10), r(10, 0, 40, 10), r(20, 0, 40, 10)];
    const out = distributeRects(tight, 'h');
    expect(out[0].x).toBe(0);
    expect(out[2].x + out[2].w).toBe(60);
    expect(out[1].x < out[0].x + out[0].w).toBe(true);
  });

  test('an unknown axis is a copy', () => {
    expect(distributeRects(SCATTER, 'diagonal')).toEqual(SCATTER);
  });

  test('vertical is the same rule on y/h', () => {
    const col = [r(0, 0, 10, 10), r(0, 20, 10, 30), r(0, 90, 10, 10)];
    expect(distributeRects(col, 'v').map(a => a.y)).toEqual([0, 35, 90]);
  });
});

describe('matchSize', () => {
  // The FIRST rect is the anchor: the caller passes the primary (the one you
  // clicked last) first, because that is the one whose size you were looking at
  // when you decided the others should match it.
  test('everything takes the first rect\'s width', () => {
    const out = matchSize(SCATTER, 'w');
    expect(out.map(a => a.w)).toEqual([20, 20, 20]);
    expect(out.map(a => a.h)).toEqual([10, 20, 15]);   // height untouched
  });

  test('height, and both', () => {
    expect(matchSize(SCATTER, 'h').map(a => a.h)).toEqual([10, 10, 10]);
    expect(matchSize(SCATTER, 'both').map(a => [a.w, a.h]))
      .toEqual([[20, 10], [20, 10], [20, 10]]);
  });

  test('the anchor itself never moves or resizes', () => {
    for (const dim of MATCH_DIMS) {
      expect(matchSize(SCATTER, dim)[0]).toEqual(SCATTER[0]);
    }
  });

  test('growing near the edge moves the widget in, it does not shrink it back', () => {
    // The point of "match width" is that the widths END UP EQUAL. Clamping the
    // size instead of the position would silently break that.
    const out = matchSize([r(0, 0, 40, 10), r(80, 0, 10, 10)], 'w');
    expect(out[1].w).toBe(40);
    expect(out[1].x).toBe(60);
  });

  test('fewer than two is a no-op', () => {
    expect(matchSize([SCATTER[0]], 'w')).toEqual([SCATTER[0]]);
  });
});

describe('moveRects', () => {
  test('every rect moves by the same delta', () => {
    const out = moveRects(SCATTER, 5, -5);
    expect(out.map(a => [a.x, a.y])).toEqual([[15, 5], [45, 25], [20, 55]]);
  });

  test('REGRESSION: the GROUP is clamped, not each rect', () => {
    // This is the whole reason this function exists. Two widgets 20 apart,
    // dragged 50 left: the left one can only travel 10 before it hits x=0, so
    // BOTH must stop after 10. Clamping each rect on its own would park the
    // left one at 0 and let the right one keep going to 20 — the arrangement
    // arrives at the slide edge deformed.
    const pair = [r(10, 50, 10, 10), r(60, 50, 10, 10)];
    const out = moveRects(pair, -50, 0);
    expect(out.map(a => a.x)).toEqual([0, 50]);
    expect(out[1].x - out[0].x).toBe(pair[1].x - pair[0].x);
  });

  test('the same on the right edge, and on both axes at once', () => {
    const pair = [r(10, 10, 10, 10), r(80, 70, 10, 10)];
    const out = moveRects(pair, 50, 50);
    expect(out.map(a => [a.x, a.y])).toEqual([[20, 30], [90, 90]]);
  });

  test('sizes are never touched', () => {
    expect(moveRects(SCATTER, 3, 3).map(a => [a.w, a.h]))
      .toEqual(SCATTER.map(a => [a.w, a.h]));
  });

  test('an empty selection moves nothing', () => {
    expect(moveRects([], 5, 5)).toEqual([]);
  });

  test('the input is never mutated', () => {
    const input = SCATTER.map(a => ({ ...a }));
    moveRects(input, 9, 9);
    expect(input).toEqual(SCATTER);
  });
});

describe('scaleRects', () => {
  // Resizing a selection's bounding box has to carry every member along as a
  // FRACTION of the box, or "resize the group" is just "resize one widget and
  // strand the others".
  const BOX = { x: 0, y: 0, w: 100, h: 100 };

  test('halving the box halves everything inside it', () => {
    const out = scaleRects(SCATTER, BOX, { x: 0, y: 0, w: 50, h: 50 });
    expect(out).toEqual([
      { x: 5, y: 5, w: 10, h: 5 },
      { x: 20, y: 15, w: 15, h: 10 },
      { x: 7.5, y: 30, w: 5, h: 7.5 },
    ]);
  });

  test('the layout is preserved, not just the sizes', () => {
    // A member a third of the way across stays a third of the way across, and a
    // member half as wide as the box stays half as wide. That is the property
    // that makes the scaled group still look like the group.
    const src = [{ x: 33, y: 0, w: 50, h: 10 }];
    const out = scaleRects(src, BOX, { x: 10, y: 10, w: 40, h: 40 });
    // Compared with a tolerance, not exactly: the rects are rounded to three
    // decimals on the way out (tidy JSON), so the fraction comes back a float
    // hair away from the one that went in. A pixel of drift on a 4K wall is a
    // fifth of a millimetre; an exact-equality test here would only be
    // measuring IEEE-754.
    const near = (a, b) => Math.abs(a - b) < 1e-6;
    expect(near((out[0].x - 10) / 40, 33 / 100)).toBe(true);
    expect(near(out[0].w / 40, 50 / 100)).toBe(true);
  });

  test('moving the box without resizing it is a pure translation', () => {
    const out = scaleRects(SCATTER, BOX, { x: 0, y: 0, w: 100, h: 100 });
    expect(out).toEqual(SCATTER);
  });

  test('a member never shrinks below the canvas minimum', () => {
    // 3 % matches clampRect in widget-frame.js: a widget scaled to nothing is
    // unselectable, so it could never be scaled back up.
    const out = scaleRects([{ x: 0, y: 0, w: 10, h: 10 }], BOX, { x: 0, y: 0, w: 5, h: 5 });
    expect(out[0].w).toBe(3);
    expect(out[0].h).toBe(3);
  });

  test('a degenerate source box is passed through, never divided by', () => {
    // Dividing by a zero-width box sends every rect to NaN, and a widget at
    // `left: NaN%` sits at the origin and refuses to be dragged back.
    const flat = { x: 10, y: 10, w: 0, h: 20 };
    expect(scaleRects(SCATTER, flat, BOX)).toEqual(SCATTER);
    expect(scaleRects(SCATTER, null, BOX)).toEqual(SCATTER);
    expect(scaleRects(SCATTER, BOX, null)).toEqual(SCATTER);
  });

  test('nothing escapes the slide', () => {
    const out = scaleRects(SCATTER, BOX, { x: 60, y: 60, w: 100, h: 100 });
    for (const a of out) {
      expect(a.x >= 0 && a.x + a.w <= 100.001).toBe(true);
      expect(a.y >= 0 && a.y + a.h <= 100.001).toBe(true);
    }
  });

  test('the input is never mutated', () => {
    const input = SCATTER.map(a => ({ ...a }));
    scaleRects(input, BOX, { x: 0, y: 0, w: 50, h: 50 });
    expect(input).toEqual(SCATTER);
  });
});

describe('the exported vocabularies match what the functions accept', () => {
  test('every ALIGN_MODE actually does something', () => {
    for (const mode of ALIGN_MODES) {
      expect(alignRects(SCATTER, mode)).notToEqual(SCATTER);
    }
  });
  test('every DISTRIBUTE_AXIS and MATCH_DIM is handled', () => {
    // SCATTER is already evenly spread on y, so it cannot prove the 'v' axis
    // does anything. This fixture is uneven on BOTH axes.
    const uneven = [r(0, 0, 10, 10), r(20, 15, 30, 20), r(85, 80, 15, 10)];
    for (const axis of DISTRIBUTE_AXES) expect(distributeRects(uneven, axis)).notToEqual(uneven);
    for (const dim of MATCH_DIMS) expect(matchSize(SCATTER, dim)).notToEqual(SCATTER);
  });
});
