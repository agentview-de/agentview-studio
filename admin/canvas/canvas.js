// Zoomable / pannable editor canvas. Renders the active slide's widgets as
// positioned frames with LIVE plugin previews. Each plugin renders ONCE; drag
// and resize only move the frame (CSS) + model rect — never re-render — so the
// canvas stays smooth. Snap guides align to canvas thirds/center and to other
// widgets' edges.

import { state, commit, subscribe } from '../store.js';
import { get as getPlugin } from '../../shared/plugins/registry.js';
import { createWidget, resolveCanvas } from '../../shared/slide-schema.js';
import { mountWidget } from '../../shared/widget-host.js';
import { applyDesign } from '../../shared/designs.js';
import { applyBackground, applySlideBackground, applySlideContrast, isPainted } from '../../shared/background.js';
import { playBuildOnce, applyLoop, clearLoop, isLoop } from '../../shared/animations.js';
import { addHandles, makeInteractive, clampRect } from './widget-frame.js';
import { clampZoom, fitTransform, centerTransform, zoomAroundPoint, widgetTransform, computeSnap } from './canvas-math.js';
import { buildInlineToolbar, buildInlineLinkPopover, buildInlineTableBar } from './inline-editor.js';
import { openContextMenu } from '../ui/context-menu.js';
import { open as openPalette } from '../ui/command-palette.js';
import { openModal } from '../ui/modal.js';
import { mountBackgroundEditor } from '../panels/background-editor.js';
import { pickAsset } from '../ui/asset-library.js';
import { sanitizeHtml } from '../../shared/sanitize-html.js';
import { t } from '../i18n.js';
import { escapeHtml } from '../../shared/utils/escape.js';

const BASE_W = 1600, BASE_H = 900;          // 16:9 design space

let viewport, stageWrap, stage, guides, zoomLabel;
let zoom = 1, panX = 0, panY = 0;
let frames = new Map();                      // widgetId -> { frameEl, dispose }
let onSelectCb = null;
let canvasW = BASE_W, canvasH = BASE_H;   // design space in px, driven by playlist.canvas

export function mountCanvas(host, { onSelect } = {}) {
  onSelectCb = onSelect;
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
    if (!e.dataTransfer?.types?.includes('avs/widget-type')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    stage.classList.add('avs-stage-dragover');
  });
  stage.addEventListener('dragleave', e => {
    if (e.target === stage) stage.classList.remove('avs-stage-dragover');
  });
  stage.addEventListener('drop', e => {
    stage.classList.remove('avs-stage-dragover');
    const type = e.dataTransfer?.getData('avs/widget-type');
    if (!type) return;
    e.preventDefault();
    const sr = stage.getBoundingClientRect();
    const x = ((e.clientX - sr.left) / sr.width) * 100;
    const y = ((e.clientY - sr.top) / sr.height) * 100;
    // Centre the default-sized widget on the drop point so the cursor
    // matches the visual placement.
    addWidgetAt(type, clampRect({ x: x - 20, y: y - 15, w: 40, h: 30 }));
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

// ONE stacking formula for EVERY render/update path. The slide-bg layer is
// pinned far behind (see .avs-slide-bg), so frames start one level above z=0.
// Past bug: the inspector geometry path set zIndex = `widget.z` while buildFrame
// set `widget.z + 1`, so any edit silently dropped a widget one level — which
// created z-index ties that made the widget unselectable (a lower-z frame caught
// the click) or hid it behind an opaque neighbour, while it still showed as a
// block in the slide-rail thumbnail. Keep the two paths literally identical.
const frameZ = w => (w.z ?? 0) + 1;

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

// Editor data-minimisation (DSGVO): ids of network widgets the user has opted to
// preview live this session. Empty by default — nothing is fetched until asked,
// so building slides doesn't transmit the device IP to third-party APIs.
const _livePreviewIds = new Set();

// Live-preview opt-in API (DSGVO): the user grants/withdraws permission for a
// network widget to fetch live in the editor — which transmits the device IP.
// Each setter re-renders the affected frame(s) so the canvas reflects it. The
// state is in-memory only (a page reload also resets it).
export function isLivePreview(id) { return _livePreviewIds.has(id); }
export function enableLivePreview(id) { _livePreviewIds.add(id); refreshWidget(id); }
export function disableLivePreview(id) { if (_livePreviewIds.delete(id)) refreshWidget(id); }
// Withdraw ALL granted live previews at once. Returns how many were active.
export function resetLivePreviews() {
  const n = _livePreviewIds.size;
  if (n) { _livePreviewIds.clear(); renderSlide(); }
  return n;
}

// Click-to-load placeholder shown instead of a live network-widget render in the
// editor. Returns a dispose() like mountWidget does. The live fetch (and the
// device-IP transmission it implies) only happens after an explicit click.
function mountPrivacyPlaceholder(content, widget, plugin) {
  const provider = plugin?.usage?.attribution || t('privacy.providerGeneric');
  const el = document.createElement('div');
  el.className = 'avs-live-preview-ph';
  el.innerHTML = `
    <div class="avs-lpp-icon">${escapeHtml(plugin?.icon ?? '◻')}</div>
    <div class="avs-lpp-title">${escapeHtml(plugin?.label ?? widget.type)} · ${escapeHtml(t('privacy.livePreviewTitle'))}</div>
    <div class="avs-lpp-body">${escapeHtml(t('privacy.livePreviewBody', { provider }))}</div>
    <button type="button" class="bb-btn bb-btn-secondary avs-lpp-btn">${escapeHtml(t('privacy.loadPreview'))}</button>`;
  const btn = el.querySelector('.avs-lpp-btn');
  // Stop the frame's drag/select gesture from swallowing the button click.
  btn.addEventListener('pointerdown', e => e.stopPropagation());
  btn.addEventListener('click', e => {
    e.stopPropagation();
    enableLivePreview(widget.id); // re-renders this single frame, now live
  });
  content.appendChild(el);
  return () => el.remove();
}

function buildFrame(slide, widget) {
  const frameEl = document.createElement('div');
  frameEl.className = 'avs-widget-frame';
  frameEl.dataset.id = widget.id;
  setGeo(frameEl, widget.rect, widget.rotation ?? 0);
  frameEl.style.zIndex = frameZ(widget); // keep above the slide bg layer

  const bgLayer = document.createElement('div');
  bgLayer.className = 'avs-widget-bg';
  // The widget's own theme class on the bg layer makes "Theme background" work:
  // applySlideBackground falls back to var(--bb-st-bg) when no custom paint is
  // set, and the theme class on the layer is what resolves that variable.
  const widgetTheme = widget.content?.theme;
  if (widgetTheme) {
    bgLayer.classList.add(`bb-theme-${widgetTheme}`);
    applySlideBackground(bgLayer, widget.background);
  } else {
    applyBackground(bgLayer, widget.background);
  }
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
  const plugin = getPlugin(widget.type);
  label.textContent = `${plugin?.icon ?? '◻'} ${plugin?.label ?? widget.type}`;
  frameEl.appendChild(label);

  addHandles(frameEl, t('canvas.rotate'));
  insertFrameInOrder(frameEl, widget);

  // Render the plugin ONCE into the content element (preview mode) through the
  // shared widget-host lifecycle — the exact same code the live player runs.
  // Data-minimisation (DSGVO): a network widget shows a click-to-load placeholder
  // instead of fetching, until the user opts its preview in for this session —
  // that fetch would transmit the device IP to a third-party API. The player is
  // unaffected (it uses its own mount path), so displays always render live.
  const dispose = (plugin?.network && !_livePreviewIds.has(widget.id))
    ? mountPrivacyPlaceholder(content, widget, plugin)
    : mountWidget(widget, slide, content, { mode: 'preview', t: k => k });

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
  // Mirror buildFrame: themed widgets fall back to theme bg, themeless ones
  // stay truly transparent when no custom paint is set.
  if (widget.content?.theme) applySlideBackground(layer, widget.background);
  else applyBackground(layer, widget.background);
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
  // JSON-clone, not structuredClone — content/background are reactive Proxies
  // and structuredClone throws DataCloneError on a Proxy.
  const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const copy = createWidget(w.type, {
    content: clone(w.content), title: w.title, background: clone(w.background),
    rect: clampRect({ ...w.rect, x: w.rect.x + 3, y: w.rect.y + 3 }),
    z: (slide.widgets.reduce((m, x) => Math.max(m, x.z ?? 0), 0)) + 1,
    contentVersion: w.contentVersion ?? getPlugin(w.type)?.schemaVersion ?? 1,
    anim: clone(w.anim), loop: w.loop, rotation: w.rotation,
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
  w.z = slide.widgets.reduce((m, x) => Math.max(m, x.z ?? 0), 0) + 1;
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
  const z = slide.widgets.reduce((m, x) => Math.max(m, x.z ?? 0), 0) + 1;
  const rect = point
    ? clampRect({ x: point.x - c.rect.w / 2, y: point.y - c.rect.h / 2, w: c.rect.w, h: c.rect.h })
    : clampRect({ ...c.rect, x: c.rect.x + 3, y: c.rect.y + 3 });
  const copy = createWidget(c.type, {
    content: cloneJson(c.content), title: c.title, background: cloneJson(c.background), rect, z,
    contentVersion: c.contentVersion ?? getPlugin(c.type)?.schemaVersion ?? 1,
    anim: cloneJson(c.anim), loop: c.loop, rotation: c.rotation,
  });
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
    { label: t('ctx.copy'), icon: '📋', run: () => copySelected() },
    { label: t('ctx.paste'), icon: '📥', disabled: !clipboard, run: () => pasteWidget() },
    { label: t('ctx.delete'), icon: '🗑', run: () => deleteSelected() },
    { separator: true },
    { label: t('ctx.toFront'), icon: '⬆️', run: () => bringToFront() },
    { label: t('ctx.toBack'), icon: '⬇️', run: () => sendToBack() },
    { separator: true },
    { label: t('ctx.background'), icon: '🎨', run: () => openWidgetBgModal(id) },
  ];
}
function canvasMenuItems(pt) {
  return [
    { label: t('ctx.addText'), icon: '🔤', run: () => addTextAt(pt) },
    { label: t('ctx.addWidget'), icon: '➕', run: () => openPalette() },
    { label: t('ctx.paste'), icon: '📥', disabled: !clipboard, run: () => pasteWidget(pt) },
    { separator: true },
    { label: t('ctx.slideBg'), icon: '🎨', run: () => document.getElementById('ss-bg')?.click() },
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
// One session at a time. Body becomes contenteditable; a floating mini-toolbar
// shows at the top of the canvas scroller (NOT on the stage, so it doesn't
// zoom). State mutations happen in-place during typing but `commit()` only
// fires on exit — so undo lands on one entry per session, not per keystroke.
let inlineEdit = null;

function enterInlineEdit(widget, frameEl) {
  if (inlineEdit) exitInlineEdit();
  const bodyEl = frameEl.querySelector('.bb-body');
  if (!bodyEl) return;

  selectWidget(widget.id);
  frameEl.classList.add('avs-frame-editing');

  // Auto-zoom on the widget so the user types at a comfortable size, then
  // restore the prior viewport when they exit. Zoom snapshot is taken BEFORE
  // we modify zoom/pan so we can hand back exactly what they had.
  const zoomSnap = { zoom, panX, panY };
  zoomToWidget(widget.rect);

  bodyEl.contentEditable = 'true';
  bodyEl.spellcheck = true;
  bodyEl.focus();

  // Auto-select all so the first keystroke replaces the placeholder text.
  // Skip if the body is non-default (already-authored content) — there a
  // caret-at-end is friendlier.
  const sel = document.getSelection();
  const range = document.createRange();
  range.selectNodeContents(bodyEl);
  if (!bodyEl.textContent?.trim() || bodyEl.textContent?.includes('Type your announcement')) {
    sel.removeAllRanges(); sel.addRange(range);
  } else {
    range.collapse(false);
    sel.removeAllRanges(); sel.addRange(range);
  }

  // During typing: mutate widget.content.body directly so the inspector field
  // (re-)renders cleanly on exit. We DON'T call commit() here — that would
  // flood undo with one entry per keystroke.
  const writeBody = () => { widget.content.body = sanitizeHtml(bodyEl.innerHTML); };
  bodyEl.addEventListener('input', writeBody);
  // Paste as plain text — matches the inspector editor's behaviour.
  const onPaste = e => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  };
  bodyEl.addEventListener('paste', onPaste);

  // Floating toolbar — appended to the scroller, not the stage, so it sits
  // at a constant size regardless of zoom.
  const toolbar = buildInlineToolbar(bodyEl, writeBody, () => exitInlineEdit());
  viewport.appendChild(toolbar);

  // Context floaters: a link popover (when caret is inside an <a>) and a
  // table mini-bar (when caret is inside a cell). Both live in the viewport
  // and reposition themselves on selectionchange. Inline mode keeps them
  // intentionally lighter than the inspector — just the essentials a user
  // would expect when editing in place.
  const linkPop = buildInlineLinkPopover(bodyEl, viewport, writeBody);
  const tableBar = buildInlineTableBar(bodyEl, viewport, writeBody);
  const refreshContext = () => { linkPop.refresh(); tableBar.refresh(); };
  document.addEventListener('selectionchange', refreshContext);

  // Outside click / Escape exits. The pointerdown listener uses capture so
  // it fires before the canvas's own pointerdown (which would deselect).
  // We also intercept the same extra shortcuts here (Ctrl+Shift+7/8/X/H/etc.)
  // that the inspector editor supports — kept inline so the user has a
  // consistent muscle memory across both editing modes.
  const onKeydown = e => {
    if (e.key === 'Escape') { e.preventDefault(); exitInlineEdit(); return; }
    if (!bodyEl.contains(e.target) && document.activeElement !== bodyEl) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && e.shiftKey && k === 'x') { e.preventDefault(); document.execCommand('strikeThrough'); writeBody(); return; }
    if (mod && e.shiftKey && k === '7') { e.preventDefault(); document.execCommand('insertOrderedList');   writeBody(); return; }
    if (mod && e.shiftKey && k === '8') { e.preventDefault(); document.execCommand('insertUnorderedList'); writeBody(); return; }
    if (mod && e.shiftKey && (k === ',' || k === '<')) { e.preventDefault(); try { document.execCommand('styleWithCSS', false, false); } catch {} document.execCommand('subscript');   writeBody(); return; }
    if (mod && e.shiftKey && (k === '.' || k === '>')) { e.preventDefault(); try { document.execCommand('styleWithCSS', false, false); } catch {} document.execCommand('superscript'); writeBody(); return; }
  };
  const onPointerDown = e => {
    if (frameEl.contains(e.target)) return;
    if (toolbar.contains(e.target)) return;
    if (linkPop.contains(e.target)) return;
    if (tableBar.contains(e.target)) return;
    exitInlineEdit();
  };
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('pointerdown', onPointerDown, true);

  // Slide-switch mid-edit would teardown the frame under our feet — bail
  // gracefully so the toolbar doesn't orphan.
  const unsubSlide = subscribe('ui', p => { if (p === 'ui.activeSlideId') exitInlineEdit(); });

  // Window resize: the editor was zoomed-to-widget based on the viewport size
  // at enter time; if the user resizes the browser while inline editing, the
  // widget can end up off-screen or weirdly cropped. Debounce + re-zoom keeps
  // the widget centred without thrashing during the drag.
  let resizeTimer = null;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => zoomToWidget(widget.rect), 80);
  };
  window.addEventListener('resize', onResize);

  inlineEdit = {
    widgetId: widget.id,
    dispose() {
      bodyEl.removeEventListener('input', writeBody);
      bodyEl.removeEventListener('paste', onPaste);
      bodyEl.contentEditable = 'false';
      bodyEl.removeAttribute('contenteditable');
      bodyEl.removeAttribute('spellcheck');
      toolbar.remove();
      linkPop.dispose();
      tableBar.dispose();
      document.removeEventListener('selectionchange', refreshContext);
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onResize);
      clearTimeout(resizeTimer);
      try { unsubSlide?.(); } catch {}
      frameEl.classList.remove('avs-frame-editing');
      // Final sanitised commit + canonical re-render via the plugin so the
      // saved file looks exactly like what would load from disk.
      widget.content.body = sanitizeHtml(bodyEl.innerHTML);
      commit('inline-edit-text');
      refreshWidget(widget.id);
      // refreshWidget rebuilds the canvas frame but doesn't notify the
      // inspector — its `subscribe('ui.selectedWidgetId')` only fires on
      // changes. Toggle through null in the same call stack so the inspector
      // re-renders with the new content; both writes happen synchronously so
      // there's no visible flicker.
      const sel = state.ui.selectedWidgetId;
      if (sel === widget.id) {
        state.ui.selectedWidgetId = null;
        state.ui.selectedWidgetId = widget.id;
      } else {
        selectWidget(widget.id);
      }
      // Restore the prior zoom/pan now that the user is done.
      zoom = zoomSnap.zoom; panX = zoomSnap.panX; panY = zoomSnap.panY;
      applyTransform();
    },
  };
}

function exitInlineEdit() {
  if (!inlineEdit) return;
  const e = inlineEdit;
  inlineEdit = null;
  try { e.dispose(); } catch (err) { console.warn('exitInlineEdit', err); }
}

function dispose() {
  exitInlineEdit();
  teardownFrames();
}
