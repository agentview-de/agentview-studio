// Pure canvas viewport + snap math. Extracted from canvas.js so it can be unit-
// tested without a DOM: the zoom clamp, fit/centre/zoom-around/zoom-to-widget
// transform computations, and the edge/centre snapping. canvas.js keeps the thin
// wrappers that read module state, call these, write the result back, and do the
// DOM side-effects (painting guides, applying the CSS transform).

import { clampRect } from './widget-frame.js';

export const SNAP = 1.5;                 // snap threshold, percent of slide
export const ZOOM_MIN = 0.1, ZOOM_MAX = 4;

export function clampZoom(z) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

// Fit the whole stage (sw×sh px) into the viewport (vw×vh px) at a 0.92 margin
// and centre it. Returns { zoom, panX, panY }.
export function fitTransform(vw, vh, sw, sh) {
  const zoom = Math.min(vw / sw, vh / sh) * 0.92;
  return { zoom, panX: (vw - sw * zoom) / 2, panY: (vh - sh * zoom) / 2 };
}

// Pan so the stage (cw×ch design px) is centred in the viewport at `zoom`.
export function centerTransform(vw, vh, cw, ch, zoom) {
  return { panX: (vw - cw * zoom) / 2, panY: (vh - ch * zoom) / 2 };
}

// Multiply the zoom by `factor` while keeping the stage point under (px, py) —
// viewport pixels — visually stationary. Returns the new { zoom, panX, panY }.
export function zoomAroundPoint(px, py, factor, { zoom, panX, panY }) {
  const nz = clampZoom(zoom * factor);
  return {
    zoom: nz,
    panX: px - ((px - panX) * nz) / zoom,
    panY: py - ((py - panY) * nz) / zoom,
  };
}

// Zoom + pan so a widget rect (percent of slide) fills ~80% of the viewport,
// centred, capped at 2.5× so contenteditable stays crisp. sw/sh are stage px.
export function widgetTransform(vw, vh, sw, sh, rect) {
  const ww = sw * (rect.w / 100), wh = sh * (rect.h / 100);
  const wx = sw * (rect.x / 100), wy = sh * (rect.y / 100);
  const fit = Math.min(vw / ww, vh / wh) * 0.8;
  const zoom = Math.min(fit, 2.5);
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
