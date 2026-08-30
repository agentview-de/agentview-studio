// Smart guides — even spacing, size matching, margins and the grid.
//
// The existing edge/centre snapping is covered in canvas-math.test.js. This file
// is about the passes added on top, and about the ORDER they run in, which is
// the part that decides whether the canvas feels helpful or possessed: an object
// you can see yourself lining up with must always beat a grid you cannot.

import { test, expect, describe } from './runner.js';
import { computeSnap, SNAP } from '../admin/canvas/canvas-math.js';

const r = (x, y, w, h) => ({ x, y, w, h });
const snap = (rect, opts = {}) => computeSnap({ rect, mode: 'move', ...opts });

// Two cards in a row at the same height, 10 apart: 0..20 and 30..50.
const ROW = [r(0, 40, 20, 20), r(30, 40, 20, 20)];

describe('even spacing · centred between two neighbours', () => {
  test('a rect dropped between them lands on the equal gap', () => {
    // Between 20 and 30 there is room for a 4-wide rect with 3 on each side.
    const out = snap(r(23.5, 40, 4, 20), { others: ROW });
    expect(out.rect.x).toBe(23);
    // …and the two spans that say why.
    expect(out.gapMarks.filter(g => g.axis === 'h')).toHaveLength(2);
    expect(out.gapMarks[0].from).toBe(20);
    expect(out.gapMarks[0].to).toBe(23);
    expect(out.gapMarks[1].from).toBe(27);
    expect(out.gapMarks[1].to).toBe(30);
  });

  test('nothing happens outside the threshold', () => {
    const out = snap(r(23.5 + SNAP + 1, 40, 4, 20), { others: ROW });
    expect(out.gapMarks).toHaveLength(0);
  });

  test('a neighbour in a different BAND is not a neighbour', () => {
    // Same x range, but far above: no shared vertical extent, so pretending
    // they form a row would fire guides at random across the slide.
    const far = [r(0, 0, 20, 5), r(30, 0, 20, 5)];
    const out = snap(r(23.5, 40, 4, 20), { others: far });
    expect(out.gapMarks).toHaveLength(0);
    expect(out.rect.x).toBe(23.5);
  });

  test('the same rule works vertically', () => {
    const col = [r(40, 0, 20, 20), r(40, 30, 20, 20)];
    const out = snap(r(40, 23.5, 20, 4), { others: col });
    expect(out.rect.y).toBe(23);
    expect(out.gapMarks.every(g => g.axis === 'v')).toBe(true);
  });
});

describe('even spacing · repeating an existing rhythm', () => {
  test('a third card takes the gap the first two already have', () => {
    // 0..20 and 30..50 are 10 apart. A third at ~60 should land at exactly 60.
    const out = snap(r(59, 40, 20, 20), { others: ROW });
    expect(out.rect.x).toBe(60);
    expect(out.gapMarks).toHaveLength(1);
    expect(out.gapMarks[0].from).toBe(50);
    expect(out.gapMarks[0].to).toBe(60);
  });

  test('it works on the other side too', () => {
    // Placed before the pair, the same 10 gap puts its right edge at -10… which
    // is off-slide, so use a pair further in: 30..50 and 60..80, gap 10.
    const pair = [r(30, 40, 20, 20), r(60, 40, 20, 20)];
    const out = snap(r(9, 40, 20, 20), { others: pair });
    expect(out.rect.x).toBe(10);
  });

  test('touching or overlapping neighbours describe no rhythm', () => {
    const touching = [r(0, 40, 20, 20), r(20, 40, 20, 20)];
    const out = snap(r(45, 40, 20, 20), { others: touching });
    // The only candidate left is "centred", which needs a neighbour on both
    // sides — there is none to the right, so nothing fires.
    expect(out.gapMarks).toHaveLength(0);
  });
});

describe('spacing never overrides an edge you can see', () => {
  test('an edge snap on an axis suppresses spacing on that axis', () => {
    // 20.5 is within threshold of the left neighbour's right edge (20), which is
    // a line the user can see. That must win over any rhythm.
    const out = snap(r(20.5, 40, 4, 20), { others: ROW });
    expect(out.rect.x).toBe(20);
    expect(out.vLines).toContain(20);
    expect(out.gapMarks.filter(g => g.axis === 'h')).toHaveLength(0);
  });
});

describe('size matching on resize', () => {
  const OTHER = [r(60, 0, 25, 40)];

  test('dragging the east edge snaps the WIDTH to a neighbour', () => {
    const out = computeSnap({ rect: r(0, 60, 24.2, 10), mode: 'e', others: OTHER });
    expect(out.rect.w).toBe(25);
    expect(out.rect.x).toBe(0);          // the anchored edge does not move
  });

  test('dragging the west edge keeps the RIGHT edge anchored', () => {
    // Right edge at 40; matching width 25 must put x at 15.
    const out = computeSnap({ rect: r(15.8, 60, 24.2, 10), mode: 'w', others: OTHER });
    expect(out.rect.w).toBe(25);
    expect(out.rect.x + out.rect.w).toBe(40);
  });

  test('height matches the same way', () => {
    const out = computeSnap({ rect: r(0, 55, 10, 39.1), mode: 's', others: OTHER });
    expect(out.rect.h).toBe(40);
  });

  test('a move never resizes anything', () => {
    const out = computeSnap({ rect: r(0, 60, 24.2, 10), mode: 'move', others: OTHER });
    expect(out.rect.w).toBe(24.2);
  });
});

describe('margins', () => {
  test('a margin adds lines on both axes', () => {
    const out = snap(r(4.4, 4.4, 20, 20), { margin: 5 });
    expect(out.rect.x).toBe(5);
    expect(out.rect.y).toBe(5);
  });

  test('the far side too', () => {
    const out = snap(r(74.4, 10, 20, 20), { margin: 5 });
    expect(out.rect.x + out.rect.w).toBe(95);
  });

  test('a nonsense margin is ignored rather than trusted', () => {
    // 60 would put the "near" line past the "far" one.
    const out = snap(r(4.4, 4.4, 20, 20), { margin: 60 });
    expect(out.rect.x).toBe(4.4);
    expect(snap(r(4.4, 4.4, 20, 20), { margin: -5 }).rect.x).toBe(4.4);
  });
});

describe('grid', () => {
  test('off by default — a rect in open space is left alone', () => {
    expect(snap(r(23.7, 41.3, 10, 10)).rect.x).toBe(23.7);
  });

  test('a move quantises both axes', () => {
    const out = snap(r(23.7, 41.3, 10, 10), { grid: 5 });
    expect(out.rect.x).toBe(25);
    expect(out.rect.y).toBe(40);
  });

  test('a resize quantises the dragged EDGE, not the anchored one', () => {
    const out = computeSnap({ rect: r(12, 60, 21.3, 10), mode: 'e', grid: 5 });
    expect(out.rect.x).toBe(12);                       // anchored
    expect(out.rect.x + out.rect.w).toBe(35);          // dragged edge on the grid
  });

  test('an object snap always beats the grid', () => {
    // x=19.6 is within threshold of the neighbour's edge at 20; the grid would
    // have pulled it to 20 as well, so use a case where they DISAGREE: a
    // neighbour edge at 30 with a grid of 4 (nearest multiple 28).
    const out = snap(r(30.4, 40, 10, 20), { others: [r(0, 40, 30, 20)], grid: 4 });
    expect(out.rect.x).toBe(30);
  });

  test('spacing also beats the grid', () => {
    const out = snap(r(23.5, 40, 4, 20), { others: ROW, grid: 4 });
    expect(out.rect.x).toBe(23);
  });
});

describe('the escape hatch', () => {
  test('enabled:false clamps and nothing else', () => {
    const out = computeSnap({
      rect: r(49.6, 0.3, 10, 10), mode: 'move', others: ROW, grid: 5, margin: 5, enabled: false,
    });
    expect(out.rect.x).toBe(49.6);
    expect(out.rect.y).toBe(0.3);
    expect(out.vLines).toHaveLength(0);
    expect(out.gapMarks).toHaveLength(0);
  });

  test('a rotated widget is still exempt, and reports no marks', () => {
    const out = computeSnap({ rect: r(49.6, 0.3, 10, 10), mode: 'move', rotated: true, others: ROW });
    expect(out.rect.x).toBe(49.6);
    expect(out.gapMarks).toHaveLength(0);
  });
});
