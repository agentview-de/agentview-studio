// Pure canvas viewport + snap math. Extracted from canvas.js so it can be unit-
// tested without a DOM: the zoom clamp, fit/centre/zoom-around/zoom-to-widget
// transform computations, and the edge/centre snapping. canvas.js keeps the thin
// wrappers that read module state, call these, write the result back, and do the
// DOM side-effects (painting guides, applying the CSS transform).

import { clampRect } from './widget-frame.js';

export const SNAP = 1.5;                 // snap threshold, percent of slide
export const ZOOM_MIN = 0.1, ZOOM_MAX = 4;

// A zoom that is not a number is not a zoom. NaN used to pass through
// Math.min/Math.max untouched, and the canvas keeps `zoom` in module state —
// so ONE bad value poisoned every later pan and zoom and left the stage dead
// until the page was reloaded.
export function clampZoom(z) {
  if (!Number.isFinite(z)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

// Fit the whole stage (sw×sh px) into the viewport (vw×vh px) at a 0.92 margin
// and centre it. Returns { zoom, panX, panY }.
export function fitTransform(vw, vh, sw, sh) {
  // Clamped like every other zoom in this module. It was not, so "Fit" on a
  // narrow window produced 7% — below the 10% the zoom buttons can reach, so
  // pressing "−" jumped the canvas UP — and a playlist with a small canvas
  // size produced 3680%.
  const zoom = clampZoom(Math.min(vw / sw, vh / sh) * 0.92);
  return { zoom, panX: (vw - sw * zoom) / 2, panY: (vh - sh * zoom) / 2 };
}

// Pan so the stage (cw×ch design px) is centred in the viewport at `zoom`.
export function centerTransform(vw, vh, cw, ch, zoom) {
  return { panX: (vw - cw * zoom) / 2, panY: (vh - ch * zoom) / 2 };
}

// Multiply the zoom by `factor` while keeping the stage point under (px, py) —
// viewport pixels — visually stationary. Returns the new { zoom, panX, panY }.
export function zoomAroundPoint(px, py, factor, { zoom, panX, panY }) {
  // Sanitised on the way IN as well as out. This divides by the previous zoom,
  // so a state that had already gone bad stayed bad no matter what the user
  // did next — the whole point of the clamp is that one bad value cannot
  // outlive the gesture that produced it.
  const prev = clampZoom(zoom);
  const ox = Number.isFinite(panX) ? panX : 0;
  const oy = Number.isFinite(panY) ? panY : 0;
  const nz = clampZoom(prev * factor);
  return {
    zoom: nz,
    panX: px - ((px - ox) * nz) / prev,
    panY: py - ((py - oy) * nz) / prev,
  };
}

// Zoom + pan so a widget rect (percent of slide) fills ~80% of the viewport,
// centred, capped at 2.5× so contenteditable stays crisp. sw/sh are stage px.
export function widgetTransform(vw, vh, sw, sh, rect) {
  // Through clampRect first: this is reached from inline-edit with whatever
  // rect the widget carries, and a malformed one (an import, a hand-edited
  // file) turned the zoom AND the pan into NaN — which the canvas then kept.
  const r = clampRect(rect);
  const ww = sw * (r.w / 100), wh = sh * (r.h / 100);
  const wx = sw * (r.x / 100), wy = sh * (r.y / 100);
  const fit = Math.min(vw / ww, vh / wh) * 0.8;
  const zoom = clampZoom(Math.min(fit, 2.5));
  const wxc = wx + ww / 2, wyc = wy + wh / 2;
  return { zoom, panX: vw / 2 - wxc * zoom, panY: vh / 2 - wyc * zoom };
}

// Do two rects overlap on the axis PERPENDICULAR to `axis`? This is what makes
// spacing guides feel right instead of firing at random: two widgets are only
// "in the same row" for horizontal spacing purposes if they actually share some
// vertical extent. Without it, a caption at the bottom of the slide would offer
// to space itself evenly against a headline at the top.
function sharesBand(a, b, axis) {
  const [p, sz] = axis === 'h' ? ['y', 'h'] : ['x', 'w'];
  return a[p] < b[p] + b[sz] && a[p] + a[sz] > b[p];
}

// The gaps that already exist between neighbouring widgets in the moving rect's
// band, on one axis. Dragging a third card next to two evenly spaced ones should
// offer the SAME gap — that is the rhythm the eye is looking for, and matching it
// by hand is exactly the fiddly work a guide should do for you.
function existingGaps(r, others, axis) {
  const [p, sz] = axis === 'h' ? ['x', 'w'] : ['y', 'h'];
  const band = others.filter(o => sharesBand(r, o, axis)).sort((a, b) => a[p] - b[p]);
  const gaps = [];
  for (let i = 1; i < band.length; i++) {
    const g = band[i][p] - (band[i - 1][p] + band[i - 1][sz]);
    // Overlapping or touching neighbours describe no rhythm worth matching.
    if (g > 0.5) gaps.push(g);
  }
  return gaps;
}

// Candidate positions for the moving rect that produce a MEANINGFUL spacing, on
// one axis. Two kinds, both of which PowerPoint and Figma offer:
//
//   centred  — equal gap to the neighbour on each side
//   rhythm   — the same gap as one that already exists in this band
//
// Each candidate carries the gap it would create and the two neighbours it
// relates to, so the caller can draw the little end-capped spans that say WHY
// the thing snapped there.
function spacingCandidates(r, others, axis) {
  const [p, sz] = axis === 'h' ? ['x', 'w'] : ['y', 'h'];
  const band = others.filter(o => sharesBand(r, o, axis));
  const before = band.filter(o => o[p] + o[sz] <= r[p] + r[sz]).sort((a, b) => (b[p] + b[sz]) - (a[p] + a[sz]));
  const after = band.filter(o => o[p] >= r[p]).sort((a, b) => a[p] - b[p]);
  const out = [];

  // Centred between the nearest neighbour on each side.
  if (before.length && after.length) {
    const A = before[0], B = after[0];
    const aEnd = A[p] + A[sz], bStart = B[p];
    const pos = (aEnd + bStart - r[sz]) / 2;
    const gap = pos - aEnd;
    if (gap > 0.5) out.push({ pos, gap, a: A, b: B, kind: 'centre' });
  }
  // Repeat an existing rhythm on either side of the nearest neighbour.
  for (const g of existingGaps(r, others, axis)) {
    if (before.length) {
      const A = before[0];
      out.push({ pos: A[p] + A[sz] + g, gap: g, a: A, b: null, kind: 'rhythm' });
    }
    if (after.length) {
      const B = after[0];
      out.push({ pos: B[p] - g - r[sz], gap: g, a: null, b: B, kind: 'rhythm' });
    }
  }
  return out;
}

// Snap a rect (percent of slide) to the canvas thirds/centre, to other widgets'
// edges/centres, to even SPACING between neighbours, to another widget's SIZE
// while resizing, and finally to a grid. Closest-line-wins within `threshold`.
// Mirrors the editor's drag/resize behaviour exactly, including the sequential
// left→right→centre passes for a move (a later pass can override an earlier one).
//
//   rect      {x,y,w,h} in percent
//   mode      undefined|'move' for a move; otherwise a resize handle ('e','nw',…)
//   rotated   true → axis-aligned snap lines don't apply; only clamp, no guides
//   others    array of other widgets' rects [{x,y,w,h}] supplying snap lines
//   grid      >0 → snap to multiples of this many percent (0 = off)
//   margin    >0 → also offer lines at `margin` and 100-margin on both axes
//   enabled   false → no snapping at all, just the clamp (hold a modifier)
//
// Precedence, strongest first: edges/centres → spacing → size → grid. An object
// snap always beats the grid, because the grid is a convenience and the object
// is the thing you are actually lining up with.
//
// Returns { rect, vLines, hLines, gapMarks } — the guide positions (percent) the
// caller should paint, plus the spacing spans that explain a spacing snap.
export function computeSnap({
  rect, mode, rotated = false, others = [], threshold = SNAP,
  grid = 0, margin = 0, enabled = true,
}) {
  if (rotated || !enabled) return { rect: clampRect(rect), vLines: [], hLines: [], gapMarks: [] };

  const r = { ...rect };
  const vx = [0, 50, 100], vy = [0, 50, 100];
  if (margin > 0 && margin < 50) { vx.push(margin, 100 - margin); vy.push(margin, 100 - margin); }
  for (const o of others) {
    vx.push(o.x, o.x + o.w, o.x + o.w / 2);
    vy.push(o.y, o.y + o.h, o.y + o.h / 2);
  }
  const vLines = [], hLines = [], gapMarks = [];

  // Best match within threshold (closest line wins). null if nothing in range.
  const tryAxis = (val, lines) => {
    let best = null, bestDist = threshold + 0.001;
    for (const L of lines) {
      const d = Math.abs(val - L);
      if (d < bestDist) { best = L; bestDist = d; }
    }
    return best;
  };

  const isMove = !mode || mode === 'move';
  const isE = !isMove && mode.includes('e');
  const isW = !isMove && mode.includes('w');
  const isN = !isMove && mode.includes('n');
  const isS = !isMove && mode.includes('s');

  // Horizontal — left edge / right edge / centre.
  if (isMove || isW) {
    const sl = tryAxis(r.x, vx);
    if (sl != null) {
      if (isMove) r.x = sl;
      else { r.w = r.x + r.w - sl; r.x = sl; }
      vLines.push(sl);
    }
  }
  if (isMove || isE) {
    const sr = tryAxis(r.x + r.w, vx);
    if (sr != null) {
      if (isMove) r.x = sr - r.w;
      else r.w = sr - r.x;
      vLines.push(sr);
    }
  }
  if (isMove) {
    const sc = tryAxis(r.x + r.w / 2, vx);
    if (sc != null) { r.x = sc - r.w / 2; vLines.push(sc); }
  }

  // Vertical — top / bottom / middle.
  if (isMove || isN) {
    const st = tryAxis(r.y, vy);
    if (st != null) {
      if (isMove) r.y = st;
      else { r.h = r.y + r.h - st; r.y = st; }
      hLines.push(st);
    }
  }
  if (isMove || isS) {
    const sb = tryAxis(r.y + r.h, vy);
    if (sb != null) {
      if (isMove) r.y = sb - r.h;
      else r.h = sb - r.y;
      hLines.push(sb);
    }
  }
  if (isMove) {
    const sm = tryAxis(r.y + r.h / 2, vy);
    if (sm != null) { r.y = sm - r.h / 2; hLines.push(sm); }
  }

  // ---- spacing ----
  // Only when the edges found nothing on that axis: an edge you are lining up
  // with is a stronger intent than a rhythm you might be making.
  const applySpacing = (axis) => {
    const [p, sz] = axis === 'h' ? ['x', 'w'] : ['y', 'h'];
    let best = null, bestDist = threshold + 0.001;
    for (const c of spacingCandidates(r, others, axis)) {
      const d = Math.abs(r[p] - c.pos);
      if (d < bestDist) { best = c; bestDist = d; }
    }
    if (!best) return;
    r[p] = best.pos;
    // The spans to draw: one on each side that actually has a neighbour. `cross`
    // is the centre of the moving rect on the other axis — the line the caller
    // draws the span along.
    const cross = axis === 'h' ? r.y + r.h / 2 : r.x + r.w / 2;
    if (best.a) gapMarks.push({ axis, from: best.a[p] + best.a[sz], to: r[p], cross });
    if (best.b) gapMarks.push({ axis, from: r[p] + r[sz], to: best.b[p], cross });
    // A centred candidate has BOTH sides by construction; a rhythm one has the
    // side it was measured from. The second span for a rhythm snap is the pair
    // it copied, which the caller does not need in order to understand it.
  };
  if (isMove && !vLines.length) applySpacing('h');
  if (isMove && !hLines.length) applySpacing('v');

  // ---- size match (resize only) ----
  // Dragging a card to the same width as its neighbour is the other half of
  // "make these look like a set", and eyeballing it is exactly as hard as
  // eyeballing the spacing.
  const applySize = (axis) => {
    const [p, sz] = axis === 'h' ? ['x', 'w'] : ['y', 'h'];
    const growEnd = axis === 'h' ? isE : isS;      // which edge the pointer holds
    const growStart = axis === 'h' ? isW : isN;
    if (!growEnd && !growStart) return;
    let best = null, bestDist = threshold + 0.001;
    for (const o of others) {
      const d = Math.abs(r[sz] - o[sz]);
      if (d < bestDist) { best = o[sz]; bestDist = d; }
    }
    if (best == null) return;
    // The dragged edge moves; the opposite one stays exactly where it is, which
    // is the same promise a resize makes everywhere else.
    if (growStart) r[p] = r[p] + r[sz] - best;
    r[sz] = best;
  };
  if (!isMove && !vLines.length) applySize('h');
  if (!isMove && !hLines.length) applySize('v');

  // ---- grid ----
  // Weakest, and off by default. It only acts on the axes nothing else claimed,
  // so turning the grid on never overrides an alignment you can see.
  if (grid > 0) {
    const q = v => Math.round(v / grid) * grid;
    if (isMove) {
      if (!vLines.length && !gapMarks.some(g => g.axis === 'h')) r.x = q(r.x);
      if (!hLines.length && !gapMarks.some(g => g.axis === 'v')) r.y = q(r.y);
    } else {
      if (!vLines.length) {
        if (isE) r.w = Math.max(grid, q(r.x + r.w) - r.x);
        else if (isW) { const right = r.x + r.w; r.x = q(r.x); r.w = Math.max(grid, right - r.x); }
      }
      if (!hLines.length) {
        if (isS) r.h = Math.max(grid, q(r.y + r.h) - r.y);
        else if (isN) { const bottom = r.y + r.h; r.y = q(r.y); r.h = Math.max(grid, bottom - r.y); }
      }
    }
  }

  return { rect: clampRect(r), vLines, hLines, gapMarks };
}
