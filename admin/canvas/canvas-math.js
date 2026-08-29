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

// Snap a rect (percent of slide) to the canvas thirds/centre and to other
// widgets' edges/centres, closest-line-wins within `threshold`. Mirrors the
// editor's drag/resize behaviour exactly, including the sequential left→right→
// centre passes for a move (a later pass can override an earlier one).
//
//   rect    {x,y,w,h} in percent
//   mode    undefined|'move' for a move; otherwise a resize handle ('e','nw',…)
//   rotated true → axis-aligned snap lines don't apply; only clamp, no guides
//   others  array of other widgets' rects [{x,y,w,h}] supplying snap lines
//
// Returns { rect: clampedSnappedRect, vLines, hLines } — the guide line
// positions (percent) the caller should paint, in the order they were matched.
export function computeSnap({ rect, mode, rotated = false, others = [], threshold = SNAP }) {
  if (rotated) return { rect: clampRect(rect), vLines: [], hLines: [] };

  const r = { ...rect };
  const vx = [0, 50, 100], vy = [0, 50, 100];
  for (const o of others) {
    vx.push(o.x, o.x + o.w, o.x + o.w / 2);
    vy.push(o.y, o.y + o.h, o.y + o.h / 2);
  }
  const vLines = [], hLines = [];

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

  return { rect: clampRect(r), vLines, hLines };
}
