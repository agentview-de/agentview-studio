// Arrange math for a multi-widget selection — align, distribute, match size,
// and the group move. DOM-free on purpose: this is the part that is easy to get
// subtly wrong and impossible to eyeball, so it lives where a headless test can
// reach it (test/arrange.test.js). canvas.js owns the pixels.
//
// Everything here speaks the same rect the rest of the editor does:
// `{ x, y, w, h }` in PERCENT of the slide. Every function is pure — it returns
// a fresh array of rects in the same order it was given, and never mutates its
// input.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = v => Math.round(v * 1000) / 1000;   // kill float dust in the JSON

export const ALIGN_MODES = Object.freeze(['left', 'hcenter', 'right', 'top', 'vmiddle', 'bottom']);
export const DISTRIBUTE_AXES = Object.freeze(['h', 'v']);
export const MATCH_DIMS = Object.freeze(['w', 'h', 'both']);

// The bounding box of a set of rects. Null for an empty set — a caller with
// nothing selected has nothing to align to.
export function boundsOf(rects) {
  if (!Array.isArray(rects) || !rects.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Align every rect to the SELECTION's bounding box — the PowerPoint rule. Not to
// the slide: aligning three widgets left should bring them to the leftmost of
// the three, not fling all three to the slide edge.
export function alignRects(rects, mode) {
  if (!ALIGN_MODES.includes(mode)) return rects.map(r => ({ ...r }));
  const b = boundsOf(rects);
  if (!b) return [];
  return rects.map(r => {
    const out = { ...r };
    switch (mode) {
      case 'left':    out.x = b.x; break;
      case 'hcenter': out.x = b.x + (b.w - r.w) / 2; break;
      case 'right':   out.x = b.x + b.w - r.w; break;
      case 'top':     out.y = b.y; break;
      case 'vmiddle': out.y = b.y + (b.h - r.h) / 2; break;
      case 'bottom':  out.y = b.y + b.h - r.h; break;
    }
    out.x = round(clamp(out.x, 0, 100 - out.w));
    out.y = round(clamp(out.y, 0, 100 - out.h));
    return out;
  });
}

// Even GAPS, not even centres.
//
// Both readings of "distribute" exist in the wild (Illustrator ships them as two
// separate buttons). Equal gaps is the one that looks right to the eye when the
// objects have different widths, which is the case that made you reach for the
// button: three cards of 20/40/20 spread over a row read as evenly placed when
// the WHITESPACE matches, not when the centres do. The two outermost rects never
// move — they define the span, exactly as they do in PowerPoint.
//
// Fewer than three rects is a no-op: with two, the gap is already "even".
export function distributeRects(rects, axis) {
  if (!DISTRIBUTE_AXES.includes(axis) || rects.length < 3) return rects.map(r => ({ ...r }));
  const pos = axis === 'h' ? 'x' : 'y';
  const size = axis === 'h' ? 'w' : 'h';

  // Work on an index-sorted view so the result keeps the caller's order — the
  // caller pairs these rects back up with widgets by index.
  const order = rects.map((r, i) => i).sort((a, b) => rects[a][pos] - rects[b][pos]);
  const first = rects[order[0]];
  const last = rects[order[order.length - 1]];
  const span = (last[pos] + last[size]) - first[pos];
  const totalSize = order.reduce((sum, i) => sum + rects[i][size], 0);
  // A negative gap is not an error: it is what "distribute" means when the
  // objects are wider than the span they have to share, and PowerPoint overlaps
  // them the same way.
  const gap = (span - totalSize) / (order.length - 1);

  const out = rects.map(r => ({ ...r }));
  let cursor = first[pos];
  for (const i of order) {
    out[i][pos] = round(clamp(cursor, 0, 100 - out[i][size]));
    cursor += rects[i][size] + gap;
  }
  return out;
}

// Match every rect's width / height / both to the FIRST rect in the list.
//
// The first one is the anchor because the caller passes the selection with the
// PRIMARY widget first — the one you clicked last, which is the one whose size
// you were looking at when you decided the others should match it. Growing
// happens around the rect's top-left, the same corner a resize handle drags
// from, so nothing jumps to a new part of the slide.
export function matchSize(rects, dim) {
  if (!MATCH_DIMS.includes(dim) || rects.length < 2) return rects.map(r => ({ ...r }));
  const [anchor] = rects;
  return rects.map((r, i) => {
    if (i === 0) return { ...r };
    const out = { ...r };
    if (dim === 'w' || dim === 'both') out.w = anchor.w;
    if (dim === 'h' || dim === 'both') out.h = anchor.h;
    // Clamp the POSITION, not the size: shrinking a matched widget to fit the
    // slide edge would defeat the point of matching it in the first place.
    out.w = round(clamp(out.w, 1, 100));
    out.h = round(clamp(out.h, 1, 100));
    out.x = round(clamp(out.x, 0, 100 - out.w));
    out.y = round(clamp(out.y, 0, 100 - out.h));
    return out;
  });
}

// Resize a whole selection by resizing its BOUNDING BOX, carrying every member
// along proportionally — the thing that makes a group behave like one object
// rather than like several objects that happen to be selected.
//
// Each member keeps its position and size as a FRACTION of the box, so a
// three-widget card layout scaled to half the slide is still the same layout,
// just smaller. A member sitting a third of the way across stays a third of the
// way across; a member half as wide as the box stays half as wide.
//
// Degenerate boxes (zero width or height) are passed through untouched: there is
// no fraction to preserve, and dividing by the box would send every rect to NaN
// — which renders as `left: NaN%` and a widget that cannot be dragged back.
export function scaleRects(rects, from, to) {
  if (!from || !to || !(from.w > 0) || !(from.h > 0)) return rects.map(r => ({ ...r }));
  const sx = to.w / from.w;
  const sy = to.h / from.h;
  return rects.map(r => {
    const out = {
      x: to.x + (r.x - from.x) * sx,
      y: to.y + (r.y - from.y) * sy,
      w: r.w * sx,
      h: r.h * sy,
    };
    // MIN matches widget-frame.js's clampRect: a member must not be scaled out
    // of existence, and one that hits the floor keeps its position rather than
    // being dragged around by a size it no longer has.
    out.w = Math.max(3, Math.min(100, out.w));
    out.h = Math.max(3, Math.min(100, out.h));
    out.x = round(clamp(out.x, 0, 100 - out.w));
    out.y = round(clamp(out.y, 0, 100 - out.h));
    out.w = round(out.w);
    out.h = round(out.h);
    return out;
  });
}

// Move a whole selection by (dx, dy), clamping the GROUP rather than each rect.
//
// This is the difference between dragging a selection and dragging a pile of
// widgets that happen to be selected: clamp each rect on its own and the first
// one to reach the slide edge stops while the rest keep going, so the layout you
// carefully arranged arrives at the edge deformed. Clamping the delta against
// the bounding box keeps every relative position exactly as it was.
export function moveRects(rects, dx, dy) {
  const b = boundsOf(rects);
  if (!b) return [];
  const ddx = clamp(dx, -b.x, 100 - (b.x + b.w));
  const ddy = clamp(dy, -b.y, 100 - (b.y + b.h));
  return rects.map(r => ({ ...r, x: round(r.x + ddx), y: round(r.y + ddy) }));
}

// Turn a TOP-FIRST list of widget ids (the Layers panel's order, highest z at
// the top) into the z each one should carry.
//
// The reversal is the whole point and the easy thing to get backwards: a layers
// list reads top-of-stack downward, while z counts upward, so the LAST row is
// the bottom of the stack and gets z 0. Re-stamping every id rather than
// patching the one that moved is deliberate — it keeps the numbers dense and
// free of the ties that make stacking order ambiguous (two widgets at the same
// z are ordered by whatever the DOM happens to do, which is not a decision
// anybody made).
export function zOrderFromTopFirst(idsTopFirst) {
  const out = new Map();
  const rows = [...(idsTopFirst ?? [])];
  rows.reverse();
  rows.forEach((id, i) => out.set(id, i));
  return out;
}
