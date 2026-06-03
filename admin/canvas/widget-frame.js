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
//   onChange(rect, phase)  phase: 'move' | 'end'
//   onSelect()
export function makeInteractive(frameEl, { getStageRect, getRect, getRotation, onChange, onSelect, onRotate }) {
  let mode = null;        // 'move' | dir | 'rotate'
  let startRect = null;
  let startRot = 0;
  let startX = 0, startY = 0;
  let badge = null;

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
    mode = rotateHandle ? 'rotate' : handle ? handle.dataset.dir : 'move';
    startRect = { ...getRect() };
    startRot = getRotation?.() ?? 0;
    startX = e.clientX; startY = e.clientY;
    onSelect?.();
    e.preventDefault();
    e.stopPropagation();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    frameEl.setPointerCapture?.(e.pointerId);
  }

  function onMove(e) {
    if (!mode) return;
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
      onChange?.(cr, 'move', mode);
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
    onChange?.(cr, 'move', mode);
    showBadge(cr);
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove);
    if (mode === 'rotate') {
      // Commit only on a real change — a bare click on the handle is a no-op
      // and shouldn't push an undo entry.
      if ((getRotation?.() ?? 0) !== startRot) onRotate?.(getRotation?.() ?? 0, 'end');
    } else if (mode) {
      // Only fire 'end' if the rect actually changed — a plain click on the
      // selected widget should NOT register as a move (no-op undo entry).
      const cur = clampRect(getRect());
      if (startRect && !rectsEqual(startRect, cur)) onChange?.(cur, 'end', mode);
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

export function clampRect(r) {
  const out = { ...r };
  out.w = Math.max(MIN, Math.min(100, out.w));
  out.h = Math.max(MIN, Math.min(100, out.h));
  out.x = Math.max(0, Math.min(100 - out.w, out.x));
  out.y = Math.max(0, Math.min(100 - out.h, out.y));
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
