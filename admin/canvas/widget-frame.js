// Per-widget pointer interaction: move + 8-handle resize, in percent units.
// Zoom-correct because all math is done against the stage's ON-SCREEN rect
// (which already includes the CSS scale).

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MIN = 3; // minimum widget size in percent

export function addHandles(frameEl, rotateTitle = '') {
  for (const dir of HANDLES) {
    const h = document.createElement('div');
    h.className = `avs-handle avs-handle-${dir}`;
    h.dataset.dir = dir;
    frameEl.appendChild(h);
  }
  // Rotation handle — a knob above the top edge (CSS draws the stem). Only
  // visible when the frame is selected (same as the resize handles).
  const rot = document.createElement('div');
  rot.className = 'avs-rotate-handle';
  if (rotateTitle) rot.title = rotateTitle;
  frameEl.appendChild(rot);
}

// Wire interaction on a frame. Callbacks get percent rects.
//   getStageRect() -> DOMRect of the (scaled) stage
//   getRect()      -> current { x, y, w, h }
//   onChange(rect, phase, mode, opts)  phase: 'move' | 'end';
//                      opts.noSnap is true while Alt is held (snapping off)
//   onSelect(event)  — the pointerdown, so the caller can read shift/meta
//   onTap()          — pointer released without moving anything. A drag and a
//                      click are different intents on a multi-selection (drag
//                      the group vs. narrow the selection to this one), and
//                      `click` fires for both, so the distinction is made here
//                      where the movement is already known.
export function makeInteractive(frameEl, { getStageRect, getRect, getRotation, onChange, onSelect, onTap, onRotate }) {
  let mode = null;        // 'move' | dir | 'rotate' | 'gesture'
  let startRect = null;
  let startRot = 0;
  let startX = 0, startY = 0;
  let badge = null;
  // Two-finger gesture on the widget itself: turn and scale at once, the way
  // Keynote and PowerPoint do it. The rotation handle is a 11px knob — fine
  // for a mouse, a poor target for a thumb — and pinching an object is what
  // people try first on a touchscreen. Only touch pointers are collected, so
  // a mouse keeps the single-pointer paths untouched.
  const pts = new Map();  // pointerId → {x, y}
  let gesture = null;     // {span, angle, rect, rot} captured when the 2nd finger lands

  const spanOf = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleOf = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  // Fingers can cross the ±180° seam mid-turn; without normalising, the widget
  // would snap a full circle the moment they do.
  const wrapDeg = d => ((d + 180) % 360 + 360) % 360 - 180;

  function startGesture() {
    const [a, b] = [...pts.values()];
    const span = spanOf(a, b);
    if (!span) return false;
    gesture = { span, angle: angleOf(a, b), rect: { ...getRect() }, rot: getRotation?.() ?? 0 };
    mode = 'gesture';
    window.addEventListener('pointermove', onMove);
    return true;
  }

  function ensureBadge() {
    if (!badge) { badge = document.createElement('div'); badge.className = 'avs-size-badge'; frameEl.appendChild(badge); }
    return badge;
  }
  function showBadge(r) {
    ensureBadge().textContent = mode === 'move'
      ? `${Math.round(r.x)}, ${Math.round(r.y)}`
      : `${Math.round(r.w)} × ${Math.round(r.h)} %`;
  }
  function showRotBadge(deg) { ensureBadge().textContent = `${Math.round(deg)}°`; }
  function hideBadge() { badge?.remove(); badge = null; }

  function onDown(e) {
    if (e.button !== 0) return;
    const handle = e.target.closest('.avs-handle');
    const rotateHandle = e.target.closest('.avs-rotate-handle');
    // Inline-edit mode puts the widget body into contenteditable. Clicks inside
    // it must reach the browser (caret / drag-select); the resize + rotate
    // handles sit outside the body, so they still work.
    if (!handle && !rotateHandle && e.target.closest('[contenteditable="true"]')) return;
    if (e.pointerType === 'touch') {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Second finger down: whatever single-finger drag was running is
      // abandoned mid-flight — the rect it was building is replaced by the
      // gesture's own snapshot, so nothing jumps.
      if (pts.size === 2) {
        e.preventDefault();
        e.stopPropagation();
        if (startGesture()) {
          window.addEventListener('pointerup', onUp, { once: true });
          return;
        }
      }
    }
    mode = rotateHandle ? 'rotate' : handle ? handle.dataset.dir : 'move';
    startRect = { ...getRect() };
    startRot = getRotation?.() ?? 0;
    startX = e.clientX; startY = e.clientY;
    onSelect?.(e);
    e.preventDefault();
    e.stopPropagation();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    // Capture keeps the drag alive when the pointer leaves the frame — an
    // improvement, not a requirement, and the listeners above are already
    // wired. It THROWS when the pointer id is no longer active (a release that
    // beat us here, a synthetic event), and an uncaught NotFoundError out of a
    // pointerdown handler helps nobody.
    try { frameEl.setPointerCapture?.(e.pointerId); } catch { /* drag works without it */ }
  }

  function onMove(e) {
    if (!mode) return;
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'gesture') {
      // A finger lifted mid-gesture: hold the last state rather than acting on
      // half a gesture. onUp commits what is already applied.
      if (pts.size !== 2) return;
      const [a, b] = [...pts.values()];
      const span = spanOf(a, b);
      const scale = span / gesture.span;
      // Scale about the widget's own centre, so it grows under the fingers
      // instead of drifting away from them.
      const cx = gesture.rect.x + gesture.rect.w / 2;
      const cy = gesture.rect.y + gesture.rect.h / 2;
      const w = Math.max(MIN, gesture.rect.w * scale);
      const h = Math.max(MIN, gesture.rect.h * scale);
      onChange?.(clampRect({ x: cx - w / 2, y: cy - h / 2, w, h }), 'move', 'move', { noSnap: true });
      const deg = gesture.rot + wrapDeg(angleOf(a, b) - gesture.angle);
      onRotate?.(deg, 'move');
      showRotBadge(deg);
      return;
    }
    if (mode === 'rotate') {
      // The (rotated) frame's bbox centre is the rotation pivot and stays put,
      // so it's a stable reference for the pointer angle. Shift snaps to 15°.
      const fr = frameEl.getBoundingClientRect();
      const deg = rotationFromPointer(e.clientX, e.clientY, fr.left + fr.width / 2, fr.top + fr.height / 2, e.shiftKey ? 15 : 0);
      onRotate?.(deg, 'move');
      showRotBadge(deg);
      return;
    }
    const sr = getStageRect();
    if (mode === 'move') {
      // Translation is rotation-invariant — add the screen delta straight onto x/y.
      const dx = ((e.clientX - startX) / sr.width) * 100;
      const dy = ((e.clientY - startY) / sr.height) * 100;
      const cr = clampRect({ ...startRect, x: startRect.x + dx, y: startRect.y + dy });
      // The modifier state has to travel WITH the event: holding Alt suspends
      // snapping for the rest of the drag, and the caller has no other way to
      // know — it sees a rect, not a keyboard.
      onChange?.(cr, 'move', mode, { noSnap: e.altKey });
      showBadge(cr);
      return;
    }
    // Resize — rotation-aware: resize along the widget's own axes, keeping the
    // opposite corner/edge anchored on screen (Figma/PowerPoint feel).
    const cr = clampRect(resizeRotated({
      startRect, mode,
      dxPx: e.clientX - startX, dyPx: e.clientY - startY,
      deg: startRot, stageW: sr.width, stageH: sr.height,
    }));
    onChange?.(cr, 'move', mode, { noSnap: e.altKey });
    showBadge(cr);
  }

  function onUp(e) {
    if (e?.pointerId != null) pts.delete(e.pointerId);
    // Two fingers, one lifted: the gesture is over, but the other finger is
    // still down. Wait for it rather than starting a one-finger drag from a
    // stale reference point.
    if (mode === 'gesture' && pts.size > 0) {
      window.addEventListener('pointerup', onUp, { once: true });
      return;
    }
    window.removeEventListener('pointermove', onMove);
    if (mode === 'gesture') {
      const cur = clampRect(getRect());
      if (startRect == null || !rectsEqual(gesture?.rect ?? cur, cur)) onChange?.(cur, 'end', 'move');
      if ((getRotation?.() ?? 0) !== (gesture?.rot ?? 0)) onRotate?.(getRotation?.() ?? 0, 'end');
      hideBadge();
      mode = null; startRect = null; gesture = null;
      return;
    }
    if (mode === 'rotate') {
      // Commit only on a real change — a bare click on the handle is a no-op
      // and shouldn't push an undo entry.
      if ((getRotation?.() ?? 0) !== startRot) onRotate?.(getRotation?.() ?? 0, 'end');
    } else if (mode) {
      // Only fire 'end' if the rect actually changed — a plain click on the
      // selected widget should NOT register as a move (no-op undo entry).
      const cur = clampRect(getRect());
      if (startRect && !rectsEqual(startRect, cur)) onChange?.(cur, 'end', mode);
      else onTap?.();
    }
    hideBadge();
    mode = null; startRect = null;
  }

  function rectsEqual(a, b) {
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  }

  frameEl.addEventListener('pointerdown', onDown);
  return () => {
    frameEl.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
  };
}

// Every rect in the editor passes through here, including ones that came from
// an imported or hand-edited playlist. A component that was not a number used
// to sail straight through — Math.min(100, undefined) is NaN — and NaN spreads:
// `{ x: 10, y: 10 }` with no size came out with its VALID x and y destroyed
// too, and a widget positioned at `left: NaN%` sits at the origin and refuses
// to be dragged. A missing size falls back to the schema's own full-bleed
// rect: visible, and obviously in need of attention.
export function clampRect(r) {
  const num = (v, fallback) => { const n = +v; return Number.isNaN(n) ? fallback : n; };
  const out = { ...r };
  out.w = Math.max(MIN, Math.min(100, num(out.w, 100)));
  out.h = Math.max(MIN, Math.min(100, num(out.h, 100)));
  out.x = Math.max(0, Math.min(100 - out.w, num(out.x, 0)));
  out.y = Math.max(0, Math.min(100 - out.h, num(out.y, 0)));
  // round to 0.1% for tidy JSON
  for (const k of ['x', 'y', 'w', 'h']) out[k] = Math.round(out[k] * 10) / 10;
  return out;
}

// ---- pure geometry (shared by makeInteractive; unit-tested in test/canvas-geo.test.js) ----

// Resize a (possibly rotated) rect by a screen-pixel pointer delta, keeping the
// edge/corner OPPOSITE the dragged handle fixed on screen — the Figma/PowerPoint
// behaviour. Rects are percent of the stage; `stageW`/`stageH` are the stage's
// on-screen px size (so the px<->percent conversion matches what the user sees,
// zoom included). At deg=0 it reduces exactly to plain axis-aligned resize,
// including the MIN-size edge handling.
export function resizeRotated({ startRect, mode, dxPx, dyPx, deg = 0, stageW, stageH }) {
  const { x, y, w, h } = startRect;
  const hasE = mode.includes('e'), hasW = mode.includes('w');
  const hasN = mode.includes('n'), hasS = mode.includes('s');
  const th = (deg * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th);
  // Pointer delta projected onto the widget's own (rotated) axes (px), then
  // expressed as a percent of the matching stage dimension so it adds onto w/h.
  const pdx = ((dxPx * cos + dyPx * sin) / stageW) * 100;
  const pdy = ((-dxPx * sin + dyPx * cos) / stageH) * 100;
  const clampSize = v => Math.max(MIN, Math.min(100, v));
  const w1 = clampSize(w + (hasE ? pdx : hasW ? -pdx : 0));
  const h1 = clampSize(h + (hasS ? pdy : hasN ? -pdy : 0));
  // Keep the opposite side fixed: anchor offset from centre points toward the
  // FIXED side. Map old & new anchor through R(θ) (px; x via stageW, y via
  // stageH) and shift the centre by the difference so the anchor stays put.
  const signX = hasE ? -1 : hasW ? 1 : 0;
  const signY = hasS ? -1 : hasN ? 1 : 0;
  const ax0 = (signX * w / 2 / 100) * stageW, ay0 = (signY * h / 2 / 100) * stageH;
  const ax1 = (signX * w1 / 2 / 100) * stageW, ay1 = (signY * h1 / 2 / 100) * stageH;
  const dax = ax0 - ax1, day = ay0 - ay1;
  const shiftX = dax * cos - day * sin;
  const shiftY = dax * sin + day * cos;
  const cx = x + w / 2 + (shiftX / stageW) * 100;
  const cy = y + h / 2 + (shiftY / stageH) * 100;
  return { x: cx - w1 / 2, y: cy - h1 / 2, w: w1, h: h1 };
}

// Rotation in degrees ([0,360)) implied by a pointer at (px,py) about centre
// (cx,cy). The handle sits at the widget's TOP, so 0° = pointer straight up.
// `snapDeg` (e.g. 15) snaps to the nearest increment when truthy.
export function rotationFromPointer(px, py, cx, cy, snapDeg = 0) {
  let deg = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90;
  if (snapDeg) deg = Math.round(deg / snapDeg) * snapDeg;
  return ((deg % 360) + 360) % 360;
}

// Move a widget to an edge or centre of the slide WITHOUT resizing it.
//
// The layout presets next door replace the whole rect — position and size —
// which is a different job. "Centre this on the slide" is the commonest
// operation in any slide editor and the only way to do it here was to work out
// (100 - w) / 2 and type it into the X field.
//
// Percent of the slide throughout, so alignment is resolution-independent: a
// widget centred here is centred on a 4K wall and on a phone-shaped portrait
// screen alike.
//
// @param {{x:number,y:number,w:number,h:number}} rect
// @param {'left'|'hcenter'|'right'|'top'|'vmiddle'|'bottom'} edge
// @returns {object} a new rect; unknown edges return the input unchanged
export function alignRect(rect, edge) {
  const r = clampRect(rect);
  switch (edge) {
    case 'left':    r.x = 0; break;
    case 'hcenter': r.x = (100 - r.w) / 2; break;
    case 'right':   r.x = 100 - r.w; break;
    case 'top':     r.y = 0; break;
    case 'vmiddle': r.y = (100 - r.h) / 2; break;
    case 'bottom':  r.y = 100 - r.h; break;
    default: return r;
  }
  return clampRect(r);
}
