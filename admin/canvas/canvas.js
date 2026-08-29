// Zoomable / pannable editor canvas. Renders the active slide's widgets as
// positioned frames with LIVE plugin previews. Each plugin renders ONCE; drag
// and resize only move the frame (CSS) + model rect — never re-render — so the
// canvas stays smooth. Snap guides align to canvas thirds/center and to other
// widgets' edges.

import { state, commit, subscribe } from '../store.js';
import { get as getPlugin } from '../../shared/plugins/registry.js';
import { createWidget, resolveCanvas } from '../../shared/slide-schema.js';
import { mountWidget, widgetSlotZ } from '../../shared/widget-host.js';
import { isStored, offlineSlugFor } from '../../shared/offline-data.js';
import { getOfflinePreview, setOfflinePreview } from '../offline-preview.js';
import { slots } from '../api.js';
import { applyDesign } from '../../shared/designs.js';
import { applySlideBackground, applySlideContrast, applyWidgetBg, isPainted } from '../../shared/background.js';
import { playBuildOnce, applyLoop, clearLoop, isLoop } from '../../shared/animations.js';
import { addHandles, makeInteractive, clampRect } from './widget-frame.js';
import { clampZoom, fitTransform, centerTransform, zoomAroundPoint, widgetTransform, computeSnap } from './canvas-math.js';
import { usesNetwork } from '../../shared/plugin-network.js';
import {
  isLivePreview, enableLivePreview, disableLivePreview, resetLivePreviews,
  mountPrivacyPlaceholder, configureLivePreview,
} from './live-preview.js';
import { enterInlineTextEdit, exitInlineTextEdit } from './inline-text-edit.js';
import { openContextMenu } from '../ui/context-menu.js';
import { open as openPalette } from '../ui/command-palette.js';
import { openModal } from '../ui/modal.js';
import { mountBackgroundEditor } from '../panels/background-editor.js';
import { pickAsset } from '../ui/asset-library.js';
import { t, tx } from '../i18n.js';
import { escapeHtml } from '../../shared/utils/escape.js';
import { widgetIcon } from '../../shared/data/widget-icons.js';
import { uiIconSvg } from '../../shared/data/ui-icons.js';
import { fieldOwns } from '../shortcuts.js';

const BASE_W = 1600, BASE_H = 900;          // 16:9 design space

let viewport, stageWrap, stage, guides, zoomLabel;
let zoom = 1, panX = 0, panY = 0;
let frames = new Map();                      // widgetId -> { frameEl, dispose }
let onSelectCb = null;
let canvasW = BASE_W, canvasH = BASE_H;   // design space in px, driven by playlist.canvas

export function mountCanvas(host, { onSelect } = {}) {
  onSelectCb = onSelect;
  // Wire the live-preview registry's re-render hooks (kept out of its import
  // graph so canvas ↔ live-preview don't form a cycle).
  configureLivePreview({ refreshWidget, renderSlide });
  host.classList.add('avs-canvas');
  host.innerHTML = `
    <div class="avs-canvas-toolbar">
      <div class="avs-zoom-cluster">
        <button class="avs-iconbtn" data-z="out" title="${t('canvas.zoomOut')}">−</button>
        <button class="avs-zoom-label" data-z="reset">100%</button>
        <button class="avs-iconbtn" data-z="in" title="${t('canvas.zoomIn')}">+</button>
        <button class="avs-chip" data-z="fit">${t('canvas.fit')}</button>
      </div>
      <div class="avs-canvas-hint">${t('canvas.hint')}</div>
    </div>
    <div class="avs-canvas-scroller">
      <div class="avs-stage-wrap">
        <div class="avs-stage"></div>
        <div class="avs-guides"></div>
      </div>
    </div>`;

  viewport = host.querySelector('.avs-canvas-scroller');
  stageWrap = host.querySelector('.avs-stage-wrap');
  stage = host.querySelector('.avs-stage');
  guides = host.querySelector('.avs-guides');
  zoomLabel = host.querySelector('.avs-zoom-label');

  host.querySelector('[data-z="in"]').addEventListener('click', () => setZoom(zoom * 1.2));
  host.querySelector('[data-z="out"]').addEventListener('click', () => setZoom(zoom / 1.2));
  host.querySelector('[data-z="reset"]').addEventListener('click', () => { setZoom(1); center(); });
  host.querySelector('[data-z="fit"]').addEventListener('click', zoomToFit);

  // Wheel: pan by default, zoom with ctrl/meta (around cursor).
  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = viewport.getBoundingClientRect();
      zoomAround(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    } else {
      panX -= e.shiftKey ? e.deltaY : e.deltaX;
      panY -= e.shiftKey ? 0 : e.deltaY;
      applyTransform();
    }
  }, { passive: false });

  // Any pointerdown outside a widget frame → deselect, no matter where in the
  // canvas it lands. The narrow `e.target === stage` check used to miss clicks
  // on the surrounding gray viewport area, on overlay children (e.g. the snap
  // guides layer), or on the empty band between the slide and the viewport
  // edge — making the inspector feel sticky once a widget was selected.
  viewport.addEventListener('pointerdown', e => {
    // Only treat as a deselect when no widget frame was hit. Clicks inside a
    // frame are handled by `makeInteractive` (selects that widget instead).
    if (!e.target.closest('.avs-widget-frame')) selectWidget(null);
  });
  // Double-click on empty stage → add a text widget at the click point.
  stage.addEventListener('dblclick', e => {
    if (e.target !== stage) return;
    const sr = stage.getBoundingClientRect();
    const x = ((e.clientX - sr.left) / sr.width) * 100;
    const y = ((e.clientY - sr.top) / sr.height) * 100;
    addWidgetAt('text', clampRect({ x: x - 20, y: y - 10, w: 40, h: 20 }));
  });

  // Double-click on a text widget enters inline edit mode (contenteditable
  // body + floating toolbar). Separate handler from the empty-stage one
  // above — both can co-exist since they target disjoint hit targets.
  stage.addEventListener('dblclick', e => {
    const frameEl = e.target.closest?.('.avs-widget-frame');
    if (!frameEl?.dataset.id) return;
    const slide = activeSlide();
    const widget = slide?.widgets.find(w => w.id === frameEl.dataset.id);
    if (widget?.type === 'text') enterInlineEdit(widget, frameEl);
  });

  // Drag-from-library to the canvas. Library tiles set `avs/widget-type` on
  // dragstart; we accept the drop and place the widget at the drop point
  // (centred on the cursor). dragover must preventDefault to allow drop.
  stage.addEventListener('dragover', e => {
    const types = e.dataTransfer?.types;
    if (!types?.includes('avs/widget-type') && !types?.includes('avs/custom-id')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    stage.classList.add('avs-stage-dragover');
  });
  stage.addEventListener('dragleave', e => {
    if (e.target === stage) stage.classList.remove('avs-stage-dragover');
  });
  stage.addEventListener('drop', e => {
    stage.classList.remove('avs-stage-dragover');
    // dataTransfer is only valid synchronously — read everything now.
    const customId = e.dataTransfer?.getData('avs/custom-id');
    const type = e.dataTransfer?.getData('avs/widget-type');
    if (!customId && !type) return;
    e.preventDefault();
    const sr = stage.getBoundingClientRect();
    const x = ((e.clientX - sr.left) / sr.width) * 100;
    const y = ((e.clientY - sr.top) / sr.height) * 100;
    const rect = clampRect({ x: x - 20, y: y - 15, w: 40, h: 30 });
    if (customId) {
      // A saved "My widget" — resolve it lazily so the canvas doesn't pull the
      // custom-widget store into its static module graph.
      import('../../shared/custom-widgets.js').then(({ get }) => {
        const entry = get(customId);
        if (!entry) return;
        if (entry.kind === 'composite') addComposite(entry.widgets);
        else addWidgetAt(entry.baseType ?? 'custom', rect, entry.content);
      });
      return;
    }
    // Centre the default-sized widget on the drop point so the cursor
    // matches the visual placement.
    addWidgetAt(type, rect);
  });

  // Right-click → context menu. Over a widget: widget actions (select it first).
  // Over empty canvas: add / paste / slide-bg actions at the click point.
  stage.addEventListener('contextmenu', e => {
    e.preventDefault();
    const frameEl = e.target.closest?.('.avs-widget-frame');
    const sr = stage.getBoundingClientRect();
    const pt = { x: ((e.clientX - sr.left) / sr.width) * 100, y: ((e.clientY - sr.top) / sr.height) * 100 };
    if (frameEl?.dataset.id) {
      selectWidget(frameEl.dataset.id);
      openContextMenu(e.clientX, e.clientY, widgetMenuItems(frameEl.dataset.id));
    } else {
      selectWidget(null);
      openContextMenu(e.clientX, e.clientY, canvasMenuItems(pt));
    }
  });

  // Re-render only when the active slide changes. Geometry / content / theme
  // edits use targeted updates (setWidgetGeometry / refreshWidget / applyTheme)
  // so dragging never re-runs plugins. Structural changes (add/remove/design/
  // undo) call renderSlide() explicitly.
  subscribe('ui', p => { if (p === 'ui.activeSlideId') renderSlide(); });
  // Canvas pixel size follows the playlist's canvas { w, h }. Re-applied on any
  // playlist change, but only when the dimensions actually differ (see
  // applyCanvasSizeFromState) so normal edits don't disturb zoom/pan.
  subscribe('playlist', applyCanvasSizeFromState);

  applyCanvasSizeFromState();
  renderSlide();
  requestAnimationFrame(zoomToFit);
  setTimeout(zoomToFit, 120); // fallback once layout settles
  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(zoomToFit, 100); });

  return { renderSlide, refreshWidget, zoomToFit, setCanvasSize, dispose };
}

function activeSlide() {
  const pl = state.playlist;
  if (!pl) return null;
  return pl.slides.find(s => s.id === state.ui.activeSlideId) ?? pl.slides[0] ?? null;
}

export function setCanvasSize(w, h) {
  canvasW = Math.max(1, Math.round(+w)) || BASE_W;
  canvasH = Math.max(1, Math.round(+h)) || BASE_H;
  if (!stage) return;
  stage.style.width = canvasW + 'px';
  stage.style.height = canvasH + 'px';
  zoomToFit();
}

// Apply the playlist's stored canvas size to the stage. No-op when unchanged so
// it can be wired to every playlist mutation without thrashing zoom/pan.
function applyCanvasSizeFromState() {
  const cv = resolveCanvas(state.playlist?.canvas);
  if (cv.w === canvasW && cv.h === canvasH) return;
  setCanvasSize(cv.w, cv.h);
}

function teardownFrames() {
  for (const { dispose } of frames.values()) { try { dispose(); } catch {} }
  frames.clear();
}

export function renderSlide() {
  if (!stage) return;
  teardownFrames();
  stage.replaceChildren();
  guides.replaceChildren();
  const slide = activeSlide();
  // Apply theme to the stage so previews look like the live render.
  stage.className = 'avs-stage';
  const theme = slide?.theme ?? state.playlist?.defaults?.theme ?? 'minimal-dark';
  if (theme) stage.classList.add(`bb-theme-${theme}`);
  if (!slide) return;
  // Slide background layer (behind all widgets); falls back to the theme bg.
  const slideBg = document.createElement('div');
  slideBg.className = 'avs-slide-bg';
  applySlideBackground(slideBg, slide.background);
  applySlideContrast(stage, slide.background);
  stage.appendChild(slideBg);
  const widgets = [...(slide.widgets ?? [])].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  for (const w of widgets) buildFrame(slide, w);
  if (!widgets.length) {
    const empty = document.createElement('div');
    empty.className = 'avs-stage-empty';
    empty.textContent = t('canvas.emptySlide');
    stage.appendChild(empty);
  }
  reflectSelection();
}

// ONE stacking formula for EVERY render/update path here AND in the player —
// see widgetSlotZ (shared/widget-host.js) for the rationale and the past bug it
// guards against. Aliased locally so the frame-order call sites stay terse.
const frameZ = widgetSlotZ;

// Insert (or move) a frame so the stage's DOM order always ascends by z. This
// keeps a single-frame refreshWidget() consistent with a full renderSlide():
// when two frames share a z-index, the SAME one wins the tie either way.
// refreshWidget used to append to the end, quietly lifting a refreshed widget
// above its equal-z peers (so editing one widget's content could shove it on
// top of another). insertBefore(node, null) appends.
function insertFrameInOrder(frameEl, widget) {
  const z = frameZ(widget);
  let ref = null;
  for (const el of stage.querySelectorAll('.avs-widget-frame')) {
    if (el === frameEl) continue;
    if ((+el.style.zIndex || 0) > z) { ref = el; break; }
  }
  // Only touch the DOM when the position is actually wrong (avoids churn on
  // every x/y/w/h keystroke routed through setWidgetGeometry).
  if (frameEl.parentNode !== stage || frameEl.nextSibling !== ref) stage.insertBefore(frameEl, ref);
}

// The DSGVO live-preview registry (opt-in Set + click-to-load placeholder) lives
// in its own module now. Re-exported here so callers that import these from the
// canvas keep working unchanged; mountCanvas wires its re-render callbacks via
// configureLivePreview so the extracted module needs no back-reference to canvas.
export { isLivePreview, enableLivePreview, disableLivePreview, resetLivePreviews };

// Keyboard nudge steps, in percent of the slide. 0.5 % is 8 px on the 1600 px
// design canvas — fine enough to line something up, coarse enough to be useful.
const NUDGE = 0.5;
const NUDGE_COARSE = 5;
// Arrow presses arrive in bursts. Apply each one immediately but fold the run
// into ONE undo entry, the way a drag commits once on release instead of once
// per pointermove.
const NUDGE_COMMIT_MS = 400;

function buildFrame(slide, widget) {
  const frameEl = document.createElement('div');
  frameEl.className = 'avs-widget-frame';
  frameEl.dataset.id = widget.id;
  setGeo(frameEl, widget.rect, widget.rotation ?? 0);
  frameEl.style.zIndex = frameZ(widget); // keep above the slide bg layer

  // The canvas was mouse-only. Delete and D (duplicate) were already bound, but
  // both act on state.ui.selectedWidgetId and nothing could SET that without a
  // click — so the editor's central act, arranging widgets on a slide, had no
  // keyboard path at all. A focusable frame gives Tab a way in; arrows move it.
  frameEl.tabIndex = 0;
  frameEl.setAttribute('role', 'button');
  const plugin = getPlugin(widget.type);
  frameEl.setAttribute('aria-label', `${tx(plugin?.label) ?? widget.type}${widget.title ? ' · ' + widget.title : ''}`);
  frameEl.addEventListener('focus', () => selectWidget(widget.id));

  let nudgeTimer = 0;
  frameEl.addEventListener('keydown', e => {
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!dir) return;
    // The inline text editor makes .bb-body contenteditable INSIDE this frame,
    // so its arrow keys bubble straight into the nudge handler: pressing ← while
    // writing on the canvas slid the widget sideways and left the caret where it
    // was. Same rule as the global shortcuts — a bare key inside a text field
    // belongs to the field. The frame itself is focusable and is not a field, so
    // keyboard nudging still works.
    if (fieldOwns(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? NUDGE_COARSE : NUDGE;
    const r = widget.rect;
    // Alt resizes from the bottom-right instead of moving — the other half of
    // arranging something, and the only part a pointer-less user could not do.
    const next = e.altKey
      ? clampRect({ ...r, w: r.w + dir[0] * step, h: r.h + dir[1] * step })
      : clampRect({ ...r, x: r.x + dir[0] * step, y: r.y + dir[1] * step });
    widget.rect = next;
    setGeo(frameEl, next, widget.rotation ?? 0);
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => commit('move-widget'), NUDGE_COMMIT_MS);
  });

  const bgLayer = document.createElement('div');
  bgLayer.className = 'avs-widget-bg';
  // Theme-aware widget background (shared with the player) — a themed widget
  // falls back to var(--bb-st-bg), a themeless one stays transparent.
  applyWidgetBg(bgLayer, widget);
  frameEl.appendChild(bgLayer);

  const content = document.createElement('div');
  content.className = 'avs-widget-content';
  // Ambient loop previews live on the content layer (overflow-hidden,
  // pointer-events:none) so the effect is WYSIWYG without the frame box itself
  // drifting — alignment + dragging still use the stable box.
  if (isLoop(widget.loop)) applyLoop(content, widget.loop);
  frameEl.appendChild(content);

  const label = document.createElement('div');
  label.className = 'avs-widget-label';
  // innerHTML, not textContent: the icon is SVG markup. The label text is still
  // escaped — it comes from the plugin registry today, but this is the one place
  // a widget's own name could reach the DOM later.
  label.innerHTML = `${widgetIcon(widget.type, escapeHtml(plugin?.icon ?? '◻'), 11)}<span>${escapeHtml(tx(plugin?.label) ?? widget.type)}</span>`;
  frameEl.appendChild(label);

  addHandles(frameEl, t('canvas.rotate'));
  insertFrameInOrder(frameEl, widget);

  // Render the plugin ONCE into the content element (preview mode) through the
  // shared widget-host lifecycle — the exact same code the live player runs.
  // Data-minimisation (DSGVO): a network widget shows a click-to-load placeholder
  // instead of fetching, until the user opts its preview in for this session —
  // that fetch would transmit the device IP to a third-party API. The player is
  // unaffected (it uses its own mount path), so displays always render live.
  //
  // "Provided offline" widgets are the exception: their render reads pre-fetched
  // data from content._offline and never calls the network, so the privacy
  // placeholder doesn't apply. The editor has no slot poller (the player injects
  // _offline itself), so we inject the previewed payload here — from the cache the
  // "Refresh data" action fills, or lazily from the slot on first mount.
  let dispose;
  if (isStored(widget.content)) {
    const preview = getOfflinePreview(widget.id);
    const w = preview ? { ...widget, content: { ...widget.content, _offline: preview } } : widget;
    dispose = mountWidget(w, slide, content, { mode: 'preview', t: k => k });
    if (!preview) loadOfflinePreview(widget.id);
  // usesNetwork asks the plugin about THIS content, not just about its type:
  // a chart with inline data reaches nobody, and a menu whose rows carry
  // remote photos reaches somebody — see shared/plugin-network.js.
  } else if (usesNetwork(plugin, content) && !isLivePreview(widget.id)) {
    dispose = mountPrivacyPlaceholder(content, widget, plugin);
  } else {
    dispose = mountWidget(widget, slide, content, { mode: 'preview', t: k => k });
  }

  const teardown = makeInteractive(frameEl, {
    getStageRect: () => stage.getBoundingClientRect(),
    getRect: () => widget.rect,
    getRotation: () => widget.rotation ?? 0,
    onSelect: () => selectWidget(widget.id),
    onChange: (rect, phase, mode) => {
      const snapped = snap(rect, widget.id, mode);
      widget.rect = snapped;
      setGeo(frameEl, snapped, widget.rotation ?? 0);
      if (phase === 'end') { guides.replaceChildren(); commit('move-widget'); }
    },
    onRotate: (deg, phase) => {
      if (phase === 'end') { commit('rotate-widget'); return; }
      setRotation(widget, frameEl, deg); // live, no plugin re-render
    },
  });

  frames.set(widget.id, { frameEl, dispose: () => { teardown(); dispose(); } });
}

// Lazily read a stored widget's data slot once (so a reload previews the last
// provisioned data, not just after a fresh "Refresh data"). On success, cache it
// and re-render just that frame. Reads the user's OWN agentView slot — no
// third-party fetch, so it's exempt from the live-preview privacy gate.
async function loadOfflinePreview(id) {
  const widget = activeSlide()?.widgets.find(w => w.id === id);
  if (!widget || !isStored(widget.content) || getOfflinePreview(id)) return;
  try {
    const val = await slots.getValue(offlineSlugFor(widget));
    if (val && val.data !== undefined && !getOfflinePreview(id) && frames.has(id)) {
      setOfflinePreview(id, { data: val.data, fetchedAt: val.fetchedAt });
      refreshWidget(id);
    }
  } catch { /* no slot provisioned yet — the placeholder stays */ }
}

export function refreshWidget(id) {
  const slide = activeSlide();
  const widget = slide?.widgets.find(w => w.id === id);
  const frame = frames.get(id);
  if (!slide || !widget || !frame) { renderSlide(); return; }
  // Cheapest correct path: rebuild just this frame.
  frame.dispose();
  frame.frameEl.remove();
  frames.delete(id);
  buildFrame(slide, widget);
  reflectSelection();
}

function setGeo(el, r, rot = 0) {
  el.style.left = r.x + '%'; el.style.top = r.y + '%';
  el.style.width = r.w + '%'; el.style.height = r.h + '%';
  // Container rotation via the standalone CSS `rotate` property (NOT `transform`)
  // so it composes with the `transform` that build/loop animations drive instead
  // of overwriting it. transform-origin defaults to the centre — exactly right.
  el.style.rotate = rot ? rot + 'deg' : '';
}

// Write a rotation onto the model + frame without re-running the plugin. Kept
// out of the JSON when it's a no-op (multiple of 360), mirroring createWidget.
function setRotation(widget, frameEl, deg) {
  const r = Math.round(+deg) || 0;
  if (r % 360 === 0) delete widget.rotation; else widget.rotation = r;
  if (frameEl) frameEl.style.rotate = (widget.rotation ?? 0) ? widget.rotation + 'deg' : '';
}

// Targeted geometry update (from the inspector number fields) — moves the
// frame without re-running the plugin.
export function setWidgetGeometry(id, rect) {
  const slide = activeSlide();
  const widget = slide?.widgets.find(w => w.id === id);
  const frame = frames.get(id);
  if (!widget) return;
  widget.rect = clampRect(rect);
  if (!frame) return;
  // Same stacking formula as buildFrame (no off-by-one), and re-seat the frame
  // in z-order — the inspector's Z field routes through here, so a z change must
  // also fix the DOM order, not just the z-index.
  frame.frameEl.style.zIndex = frameZ(widget);
  setGeo(frame.frameEl, widget.rect, widget.rotation ?? 0);
  insertFrameInOrder(frame.frameEl, widget);
}

// Targeted rotation update (from the inspector R field) — live, no re-render.
export function setWidgetRotation(id, deg) {
  const slide = activeSlide();
  const widget = slide?.widgets.find(w => w.id === id);
  if (!widget) return;
  setRotation(widget, frames.get(id)?.frameEl, deg);
}

// Reshape a widget's box to the LARGEST box of the target [w, h] ratio that fits the
// stage, centered on it. 16:9 / 9:16 / custom each map to one canonical maxed box, so
// the widget fills the slide as much as the ratio allows and toggling is fully
// reversible. Math in stage pixels because rect.w/h are percentages of different axes.
export function fitWidgetToRatio(id, ratio) {
  const slide = activeSlide();
  const widget = slide?.widgets.find(w => w.id === id);
  const rw = ratio?.[0], rh = ratio?.[1];
  if (!widget || !(rw > 0) || !(rh > 0)) return null;
  const [sw, sh] = [canvasW, canvasH];
  const scale = Math.min(sw / rw, sh / rh);
  const nwpx = rw * scale, nhpx = rh * scale;
  setWidgetGeometry(id, {
    ...widget.rect,
    x: (sw - nwpx) / 2 / sw * 100,
    y: (sh - nhpx) / 2 / sh * 100,
    w: nwpx / sw * 100,
    h: nhpx / sh * 100,
  });
  return widget.rect;
}

// Live background updates — repaint only the bg layer, never re-run the plugin.
export function setWidgetBackground(id, bg) {
  const slide = activeSlide();
  const widget = slide?.widgets.find(w => w.id === id);
  if (!widget) return;
  if (isPainted(bg)) widget.background = bg; else delete widget.background;
  const frame = frames.get(id);
  const layer = frame?.frameEl.querySelector('.avs-widget-bg');
  if (!layer) return;
  // Same theme-aware fallback buildFrame + the player use.
  applyWidgetBg(layer, widget);
}
export function setSlideBackground(bg) {
  const slide = activeSlide();
  if (!slide) return;
  if (isPainted(bg)) slide.background = bg; else delete slide.background;
  const layer = stage.querySelector('.avs-slide-bg');
  if (layer) applySlideBackground(layer, slide.background);
  applySlideContrast(stage, slide.background);
}

// Replay a widget's entrance build once on its canvas frame — instant feedback
// from the inspector. Plays on the frame box so it composes cleanly above any
// ambient loop running on the inner content layer.
export function previewWidgetBuild(id) {
  const slide = activeSlide();
  const widget = slide?.widgets.find(w => w.id === id);
  const frame = frames.get(id);
  if (!widget || !frame || !widget.anim) return;
  playBuildOnce(frame.frameEl, widget.anim);
}

// Live-apply a widget's ambient loop to its existing preview — no plugin
// re-render. Toggles the `.bb-loop-*` class on the content layer.
export function applyWidgetLoop(id) {
  const slide = activeSlide();
  const widget = slide?.widgets.find(w => w.id === id);
  const frame = frames.get(id);
  const content = frame?.frameEl.querySelector('.avs-widget-content');
  if (!widget || !content) return;
  clearLoop(content);
  if (isLoop(widget.loop)) applyLoop(content, widget.loop);
}

// Re-apply the active slide's theme to the stage (cheap; previews inherit vars).
export function applyTheme() {
  const slide = activeSlide();
  stage.className = 'avs-stage';
  const theme = slide?.theme ?? state.playlist?.defaults?.theme ?? 'minimal-dark';
  if (theme) stage.classList.add(`bb-theme-${theme}`);
  applySlideContrast(stage, slide?.background);
}

// ---- selection ----
function selectWidget(id) {
  state.ui.selectedWidgetId = id;
  reflectSelection();
  onSelectCb?.(id);
}
function reflectSelection() {
  const sel = state.ui.selectedWidgetId;
  for (const [id, { frameEl }] of frames) {
    frameEl.classList.toggle('avs-frame-selected', id === sel);
  }
}

// ---- add widget ----
function addWidgetAt(type, rect, content) {
  const slide = activeSlide();
  if (!slide) return null;
  const z = (slide.widgets.reduce((m, w) => Math.max(m, w.z ?? 0), 0)) + 1;
  // Seed new widgets with the plugin's defaults so the inspector and canvas
  // start populated (not blank), then layer any caller-supplied content on top.
  const plugin = getPlugin(type);
  const base = plugin?.defaults ? plugin.defaults() : {};
  const finalContent = { ...base, ...(content || {}) };
  const w = createWidget(type, {
    rect, z, content: finalContent,
    contentVersion: plugin?.schemaVersion ?? 1,
  });
  slide.widgets.push(w);
  commit('add-widget');
  renderSlide();
  selectWidget(w.id);
  return w;
}
export function addWidget(type, content) {
  return addWidgetAt(type, clampRect({ x: 30, y: 30, w: 40, h: 30 }), content);
}

// Insert a saved "composite" (several widgets as one unit) onto the active
// slide. Each portable widget keeps its relative rect; ids are regenerated and
// the whole group is stacked above whatever is already on the slide. Returns
// the created widgets (or null if there's no slide / nothing to add).
// Largest z among a slide's widgets (0 when empty) — the base for "insert on top".
const maxZ = slide => (slide?.widgets ?? []).reduce((m, w) => Math.max(m, w.z ?? 0), 0);

// Build a widget for INSERTION from a source widget (duplicate / paste /
// composite). Carries content/title/background/anim/loop/rotation, clamps the
// target rect, and stamps contentVersion to the plugin's current version when the
// source lacks one. `clone` (default true) deep-copies the reactive fields via
// JSON so the copy doesn't alias the source's reactive Proxy subtree
// (structuredClone throws DataCloneError on a Proxy); pass false when the source
// is already a plain object (a saved composite). ONE place owns this now — it was
// hand-written three times (duplicate / paste / composite) with subtle drift.
function widgetForInsert(source, { rect, z, clone = true }) {
  const c = clone ? (v => (v == null ? v : JSON.parse(JSON.stringify(v)))) : (v => v);
  return createWidget(source.type ?? 'text', {
    rect: clampRect(rect ?? { x: 30, y: 30, w: 40, h: 30 }),
    z,
    content: c(source.content ?? {}),
    title: source.title,
    background: c(source.background),
    anim: c(source.anim),
    loop: source.loop,
    rotation: source.rotation,
    contentVersion: source.contentVersion ?? getPlugin(source.type)?.schemaVersion ?? 1,
  });
}

export function addComposite(widgets) {
  const slide = activeSlide();
  if (!slide || !Array.isArray(widgets) || !widgets.length) return null;
  let z = maxZ(slide);
  const created = [];
  for (const w of widgets) {
    z += 1;
    // Composite widgets come from a saved template (already plain) → no clone.
    const cw = widgetForInsert(w, { rect: w.rect, z, clone: false });
    slide.widgets.push(cw);
    created.push(cw);
  }
  commit('add-composite');
  renderSlide();
  selectWidget(created.length === 1 ? created[0].id : null);
  return created;
}

// Apply a design (stamps editable widgets) to the active slide.
export function applyActiveDesign(designId) {
  const slide = activeSlide();
  if (!slide) return;
  slide.widgets = applyDesign(slide, designId);
  slide.design = designId;
  commit('apply-design');
  renderSlide();
  selectWidget(null);
}

// Remove / duplicate the currently selected widget.
export function deleteSelected() {
  const slide = activeSlide();
  const id = state.ui.selectedWidgetId;
  if (!slide || !id) return;
  slide.widgets = slide.widgets.filter(w => w.id !== id);
  commit('delete-widget');
  renderSlide();
  selectWidget(null);
}
export function duplicateSelected() {
  const slide = activeSlide();
  const id = state.ui.selectedWidgetId;
  const w = slide?.widgets.find(x => x.id === id);
  if (!w) return;
  const copy = widgetForInsert(w, {
    rect: { ...w.rect, x: w.rect.x + 3, y: w.rect.y + 3 },
    z: maxZ(slide) + 1,
  });
  slide.widgets.push(copy);
  commit('duplicate-widget');
  renderSlide();
  selectWidget(copy.id);
}

// ---- z-order ----
export function bringToFront() {
  const slide = activeSlide();
  const w = slide?.widgets.find(x => x.id === state.ui.selectedWidgetId);
  if (!w) return;
  w.z = maxZ(slide) + 1;
  commit('z-front'); renderSlide(); selectWidget(w.id);
}
export function sendToBack() {
  const slide = activeSlide();
  const w = slide?.widgets.find(x => x.id === state.ui.selectedWidgetId);
  if (!w) return;
  w.z = slide.widgets.reduce((m, x) => Math.min(m, x.z ?? 0), 0) - 1;
  commit('z-back'); renderSlide(); selectWidget(w.id);
}

// ---- copy / paste (across slides) ----
let clipboard = null;
const cloneJson = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
export function hasClipboard() { return !!clipboard; }
export function copySelected() {
  const slide = activeSlide();
  const w = slide?.widgets.find(x => x.id === state.ui.selectedWidgetId);
  if (!w) return;
  clipboard = cloneJson({ type: w.type, content: w.content, title: w.title, background: w.background, rect: w.rect, contentVersion: w.contentVersion, anim: w.anim, loop: w.loop, rotation: w.rotation });
}
export function pasteWidget(point) {
  const slide = activeSlide();
  if (!slide || !clipboard) return;
  const c = clipboard;
  const rect = point
    ? { x: point.x - c.rect.w / 2, y: point.y - c.rect.h / 2, w: c.rect.w, h: c.rect.h }
    : { ...c.rect, x: c.rect.x + 3, y: c.rect.y + 3 };
  const copy = widgetForInsert(c, { rect, z: maxZ(slide) + 1 });
  slide.widgets.push(copy);
  commit('paste-widget'); renderSlide(); selectWidget(copy.id);
}

// Add a text widget centered on a canvas point (context-menu "Add text here").
export function addTextAt(point) {
  addWidgetAt('text', clampRect({ x: point.x - 20, y: point.y - 10, w: 40, h: 20 }));
}

// Edit a widget's background in a modal (context-menu "Background…").
async function openWidgetBgModal(id) {
  const slide = activeSlide();
  const w = slide?.widgets.find(x => x.id === id);
  if (!w) return;
  const box = document.createElement('div');
  mountBackgroundEditor(box, {
    get: () => w.background,
    onChange: bg => { setWidgetBackground(id, bg); commit('widget-bg'); },
    assetPicker: a => pickAsset(a),
  });
  await openModal({ title: t('bg.widgetTitle'), body: box, actions: [{ label: t('common.done'), value: 1 }] });
}

// ---- context-menu item builders ----
function widgetMenuItems(id) {
  return [
    { label: t('ctx.duplicate'), icon: '⧉', run: () => duplicateSelected() },
    { label: t('ctx.copy'), icon: uiIconSvg('copy', 14), run: () => copySelected() },
    { label: t('ctx.paste'), icon: uiIconSvg('upload', 14), disabled: !clipboard, run: () => pasteWidget() },
    { label: t('ctx.delete'), icon: uiIconSvg('trash', 14), run: () => deleteSelected() },
    { separator: true },
    { label: t('ctx.toFront'), icon: uiIconSvg('arrow-up', 14), run: () => bringToFront() },
    { label: t('ctx.toBack'), icon: uiIconSvg('arrow-down', 14), run: () => sendToBack() },
    { separator: true },
    { label: t('ctx.background'), icon: uiIconSvg('image', 14), run: () => openWidgetBgModal(id) },
  ];
}
function canvasMenuItems(pt) {
  return [
    { label: t('ctx.addText'), icon: uiIconSvg('type', 14), run: () => addTextAt(pt) },
    { label: t('ctx.addWidget'), icon: uiIconSvg('plus', 14), run: () => openPalette() },
    { label: t('ctx.paste'), icon: uiIconSvg('upload', 14), disabled: !clipboard, run: () => pasteWidget(pt) },
    { separator: true },
    { label: t('ctx.slideBg'), icon: uiIconSvg('image', 14), run: () => document.getElementById('ss-bg')?.click() },
    { label: t('ctx.fit'), icon: '⤢', run: () => zoomToFit() },
  ];
}

// ---- snapping ----
// Snap targets: slide edges + slide center, plus every other widget's edges
// AND centers. Move snaps all four edges + the widget center. Resize snaps
// ONLY the edges actually being dragged (otherwise an east-resize that lands
// near a snap line would yank x leftward).
function snap(rect, selfId, mode) {
  const slide = activeSlide();
  const self = slide?.widgets.find(w => w.id === selfId);
  const rotated = !!(self && (self.rotation ?? 0) % 360 !== 0);
  const others = (slide?.widgets ?? []).filter(w => w.id !== selfId).map(w => w.rect);
  // The math (snap lines, closest-wins, sequential passes, clamp) lives in the
  // DOM-free canvas-math.js; here we just paint the guide lines it reports.
  const { rect: snapped, vLines, hLines } = computeSnap({ rect, mode, rotated, others });
  guides.replaceChildren();
  for (const x of vLines) drawGuideV(x);
  for (const y of hLines) drawGuideH(y);
  return snapped;
}
function drawGuideV(x) { const g = document.createElement('div'); g.className = 'avs-guide avs-guide-v'; g.style.left = x + '%'; guides.appendChild(g); }
function drawGuideH(y) { const g = document.createElement('div'); g.className = 'avs-guide avs-guide-h'; g.style.top = y + '%'; guides.appendChild(g); }

// ---- zoom / pan ---- (math in canvas-math.js; these wire it to module state)
function setZoom(z) { zoom = clampZoom(z); applyTransform(); }
function zoomAround(px, py, factor) {
  ({ zoom, panX, panY } = zoomAroundPoint(px, py, factor, { zoom, panX, panY }));
  applyTransform();
}
function center() {
  const vr = viewport.getBoundingClientRect();
  ({ panX, panY } = centerTransform(vr.width, vr.height, canvasW, canvasH, zoom));
  applyTransform();
}
export function zoomToFit() {
  if (!viewport) return;
  const vr = viewport.getBoundingClientRect();
  if (vr.width < 20 || vr.height < 20) return; // hidden / not laid out yet — skip
  const sw = stage.offsetWidth || BASE_W, sh = stage.offsetHeight || BASE_H;
  ({ zoom, panX, panY } = fitTransform(vr.width, vr.height, sw, sh));
  applyTransform();
}

// Zoom + pan so the given widget rect (percent of slide) fills most of the
// viewport. Used by inline-edit so the user types at a readable size — falls
// back to a no-op if the viewport isn't laid out yet.
function zoomToWidget(rect) {
  if (!viewport || !rect) return;
  const vr = viewport.getBoundingClientRect();
  if (vr.width < 20 || vr.height < 20) return;
  const sw = stage.offsetWidth || BASE_W, sh = stage.offsetHeight || BASE_H;
  ({ zoom, panX, panY } = widgetTransform(vr.width, vr.height, sw, sh, rect));
  applyTransform();
}
function applyTransform() {
  stageWrap.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + '%';
}

// ---- inline text edit (double-click on a text widget) ----
// The editing session itself lives in inline-text-edit.js (a self-contained
// sub-feature). Here we just hand it the canvas hooks it needs: the viewport,
// the zoom snapshot/restore + zoom-to-widget, and select/refresh.
function enterInlineEdit(widget, frameEl) {
  enterInlineTextEdit(widget, frameEl, {
    viewport,
    zoomToWidget,
    snapshotViewport: () => ({ zoom, panX, panY }),
    restoreViewport: (s) => { zoom = s.zoom; panX = s.panX; panY = s.panY; applyTransform(); },
    selectWidget,
    refreshWidget,
  });
}

function dispose() {
  exitInlineTextEdit();
  teardownFrames();
}
