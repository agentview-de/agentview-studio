// Zoomable / pannable editor canvas. Renders the active slide's widgets as
// positioned frames with LIVE plugin previews. Each plugin renders ONCE; drag
// and resize only move the frame (CSS) + model rect — never re-render — so the
// canvas stays smooth. Snap guides align to canvas thirds/center and to other
// widgets' edges.

import { state, commit, subscribe } from '../store.js';
import { get as getPlugin } from '../../shared/plugins/registry.js';
import { createWidget, resolveCanvas, newGroupId, visibleWidgets, masterWidgetsFor, ensureMaster } from '../../shared/slide-schema.js';
import { mountWidget, widgetSlotZ } from '../../shared/widget-host.js';
import { isStored, offlineSlugFor } from '../../shared/offline-data.js';
import { getOfflinePreview, setOfflinePreview } from '../offline-preview.js';
import { slots } from '../api.js';
import { applyDesign } from '../../shared/designs.js';
import { applySlideBackground, applySlideContrast, applyWidgetBg, isPainted } from '../../shared/background.js';
import { playBuildOnce, applyLoop, clearLoop, isLoop } from '../../shared/animations.js';
import { addHandles, makeInteractive, clampRect } from './widget-frame.js';
import { clampZoom, fitTransform, centerTransform, zoomAroundPoint, widgetTransform, computeSnap } from './canvas-math.js';
import { alignRects, distributeRects, matchSize, moveRects, scaleRects, boundsOf } from './arrange.js';
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
import { toast } from '../ui/toast.js';
import { t } from '../i18n.js';
import { escapeHtml } from '../../shared/utils/escape.js';
import { widgetIcon } from '../../shared/data/widget-icons.js';
import { uiIconSvg } from '../../shared/data/ui-icons.js';
import { fieldOwns } from '../shortcuts.js';
import { activeSlide, isEditingMaster } from '../active-slide.js';
import { widgetName } from '../widget-name.js';
import { arm as armPainter, disarm as disarmPainter, isArmed as painterArmed, armedFormat, applyFormat } from '../format-painter.js';

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
      <button class="avs-chip avs-view-btn" id="avs-view-btn" aria-haspopup="true" aria-expanded="false">
        ${uiIconSvg('grid', 13)}<span>${t('view.title')}</span>
      </button>
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
  host.querySelector('#avs-view-btn').addEventListener('click', e => {
    e.stopPropagation();
    openViewMenu(e.currentTarget);
  });

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
    // The group frame's handles are NOT inside a widget frame, so without this
    // the pointerdown that starts a group resize would clear the selection first
    // and the resize would have nothing left to resize.
    if (e.target.closest('.avs-widget-frame, .avs-group-frame')) return;
    // Clicking past every widget is how you change your mind about the brush.
    if (painterArmed()) { disarmFormatPainter(); return; }
    // Shift/ctrl-drag on empty canvas ADDS to the selection instead of
    // replacing it, so a marquee can be used to extend a hand-picked set.
    const additive = !!(e.shiftKey || e.metaKey || e.ctrlKey);
    if (!additive) selectWidget(null);
    if (e.button === 0) startMarquee(e, additive);
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
      // Right-clicking INSIDE a multi-selection keeps it: the menu you want is
      // the one for the group you just built, not for one of its members.
      if (!selectedIds().includes(frameEl.dataset.id)) selectWidget(frameEl.dataset.id);
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
  // Everyone outside this module still writes only `selectedWidgetId`; this is
  // what keeps `selectedWidgetIds` consistent with those writes. See the block
  // comment above selectWidget() for the invariant it enforces.
  subscribe('ui', p => { if (p === 'ui.selectedWidgetId') normalizeSelection(); });
  // Canvas pixel size follows the playlist's canvas { w, h }. Re-applied on any
  // playlist change, but only when the dimensions actually differ (see
  // applyCanvasSizeFromState) so normal edits don't disturb zoom/pan.
  subscribe('playlist', applyCanvasSizeFromState);

  applyCanvasSizeFromState();
  renderSlide();
  // Reconcile the RESTORED selection against the slide that actually loaded.
  //
  // `ui.selectedWidgetIds` is persisted, and hydrate() assigns it back wholesale
  // — so ids belonging to a playlist that has since been replaced, or to a slide
  // that was deleted in another tab, come back as a selection of ghosts. The
  // Arrange panel counted them and said "3 widgets selected" over nothing at
  // all, with every button silently doing nothing. setSelection drops whatever
  // is not on the slide, so this is the one call that makes the restored state
  // honest.
  setSelection(selectedIds());
  requestAnimationFrame(zoomToFit);
  setTimeout(zoomToFit, 120); // fallback once layout settles
  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(zoomToFit, 100); });

  return { renderSlide, refreshWidget, zoomToFit, setCanvasSize, dispose };
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
  // The group frame lives in the stage, so replaceChildren() takes it with it.
  // Dropping the reference here is what stops drawSelectionBounds from reusing a
  // detached node (which would leave the selection with invisible handles).
  groupTeardown?.(); groupTeardown = null; groupFrame = null;
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
  // The slide master, drawn beneath the slide's own widgets and NOT editable
  // here. Seeing it is the point — you are designing over a standing logo bar,
  // and a canvas that hid it would let you put a headline straight through it.
  // Editing it here is not: two ways to change the same widget, one of which
  // silently edits every other slide, is how a master becomes a thing people
  // are afraid of.
  if (!isEditingMaster()) {
    for (const w of visibleWidgets(masterWidgetsFor(state.playlist, slide))
      .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))) {
      buildMasterGhost(slide, w);
    }
  }
  // Hidden widgets get no frame at all — the same rule the player follows, so
  // the canvas keeps showing exactly what the screen will. The Layers panel is
  // where a hidden widget stays reachable.
  const widgets = visibleWidgets(slide.widgets).sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  for (const w of widgets) buildFrame(slide, w);
  if (!widgets.length) {
    const empty = document.createElement('div');
    empty.className = 'avs-stage-empty';
    empty.textContent = t('canvas.emptySlide');
    stage.appendChild(empty);
  }
  // The overlays live in the stage, so replaceChildren() above took them with
  // it — they have to be re-created with every render, not just when toggled.
  applyViewAids();
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

// A master widget on an ordinary slide: the real plugin render, at the real
// position, with no frame chrome and no pointer events. It is the same
// mountWidget the editable frames use, so what you see over the master is
// exactly what the screen will show — the alternative (a grey placeholder box)
// would let a light logo bar look dark while you chose the text colour over it.
function buildMasterGhost(slide, widget) {
  const el = document.createElement('div');
  el.className = 'avs-master-ghost';
  el.dataset.id = 'master:' + widget.id;
  setGeo(el, widget.rect, widget.rotation ?? 0);
  el.style.zIndex = frameZ(widget);

  const bg = document.createElement('div');
  bg.className = 'avs-widget-bg';
  applyWidgetBg(bg, widget);
  el.appendChild(bg);

  const content = document.createElement('div');
  content.className = 'avs-widget-content';
  el.appendChild(content);
  stage.appendChild(el);

  // Network widgets on the master follow the same privacy gate as anywhere else
  // — a logo bar with a live clock must not fetch just because it is a master.
  const plugin = getPlugin(widget.type);
  const dispose = (usesNetwork(plugin, content) && !isLivePreview(widget.id))
    ? mountPrivacyPlaceholder(content, widget, plugin)
    : mountWidget(widget, slide, content, { mode: 'preview', t: k => k });
  // Tracked in `frames` like any other so teardownFrames() disposes it; the id
  // is prefixed so it can never collide with a real widget's.
  frames.set(el.dataset.id, { frameEl: el, dispose });
}

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
  frameEl.setAttribute('aria-label', widgetName(widget));
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
    // Locked means locked on the keyboard too. The frame stays focusable so Tab
    // can still reach it (and a screen reader can still announce it); it just
    // does not move.
    if (widget.locked) return;
    // Shift is the coarse step. It is NOT an "extend selection" modifier here:
    // a nudge always moves whatever is selected, and shift-arrow has meant
    // "move further" on this canvas since before multi-select existed.
    const step = e.shiftKey ? NUDGE_COARSE : NUDGE;
    const r = widget.rect;
    // Alt resizes from the bottom-right instead of moving — the other half of
    // arranging something, and the only part a pointer-less user could not do.
    if (e.altKey) {
      // Resize stays single-widget: growing six widgets by the same percentage
      // from their own corners pulls the arrangement apart rather than scaling it.
      widget.rect = clampRect({ ...r, w: r.w + dir[0] * step, h: r.h + dir[1] * step });
      setGeo(frameEl, widget.rect, widget.rotation ?? 0);
    } else if (selectionCount() > 1 && selectedIds().includes(widget.id)) {
      // Nudge the whole selection as a block — same group clamp as a group drag.
      const sel = selectedWidgets();
      const moved = moveRects(sel.map(w => w.rect), dir[0] * step, dir[1] * step);
      sel.forEach((w, i) => {
        w.rect = clampRect(moved[i]);
        const f = frames.get(w.id);
        if (f) setGeo(f.frameEl, w.rect, w.rotation ?? 0);
      });
      drawSelectionBounds();
    } else {
      widget.rect = clampRect({ ...r, x: r.x + dir[0] * step, y: r.y + dir[1] * step });
      setGeo(frameEl, widget.rect, widget.rotation ?? 0);
    }
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
  // The NAME, not the plugin's label: a widget renamed in the Layers panel has
  // to be called that here too, or the rename looks like it did not work.
  label.innerHTML = `${widgetIcon(widget.type, escapeHtml(plugin?.icon ?? '◻'), 11)}<span>${escapeHtml(widgetName(widget))}</span>`;
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

  // Where every widget in the selection sat when the drag began — INCLUDING this
  // one. Both halves matter:
  //
  //   others  — re-reading them mid-drag would compound each frame's own
  //             movement into the next delta.
  //   primary — the delta has to be measured from the drag's START, not from the
  //             widget's live rect. Against the live rect each event's delta is
  //             an INCREMENT, so the final 'end' event (whose rect IS the live
  //             rect) has a delta of zero — which re-applied the followers'
  //             original positions and snapped the group back the instant you
  //             let go, while the widget under the pointer stayed put.
  let groupStart = null;
  // Did the pointerdown that started this gesture carry shift/ctrl/cmd? The tap
  // handler needs to know: a plain click on a member of a multi-selection
  // narrows the selection to it, but a SHIFT-click just added it — collapsing
  // there would undo the add on the same gesture that made it, so shift-click
  // could never build a selection of more than one.
  let downAdditive = false;
  // Was this widget ALREADY part of a multi-selection when the pointer went
  // down? The tap handler needs the state from BEFORE the click, not after:
  // clicking a grouped widget expands the selection to the whole group, and a
  // check made afterwards sees that expansion and immediately narrows it away —
  // so a group could be selected, but never for longer than one frame.
  let downWasInSelection = false;

  // A locked widget still renders — it is only the pointer that stops reaching
  // it. Selecting it stays possible from the Layers panel, which is where the
  // lock was set and therefore where a person looks to undo it.
  if (widget.locked) frameEl.classList.add('avs-frame-locked');

  // A locked widget gets NO pointer interaction wired at all.
  //
  // `pointer-events: none` already stops a real pointer reaching the frame, but
  // defending a data property in the stylesheet alone is thin: the keyboard
  // nudge has always had an explicit `if (widget.locked) return`, and the two
  // paths disagreeing is the kind of gap that becomes a bug the moment a
  // selector changes. Not wiring the handlers makes the lock structural.
  const teardown = widget.locked ? () => {} : makeInteractive(frameEl, {
    getStageRect: () => stage.getBoundingClientRect(),
    getRect: () => widget.rect,
    getRotation: () => widget.rotation ?? 0,
    onSelect: (e) => {
      // The brush is armed: this click paints instead of selecting. Handled on
      // pointerDOWN rather than on the tap so a slip of the hand cannot start
      // dragging the widget you meant to paint.
      if (painterArmed()) { paintWidget(widget.id); return; }
      const additive = !!(e?.shiftKey || e?.metaKey || e?.ctrlKey);
      downAdditive = additive;
      downWasInSelection = selectionCount() > 1 && selectedIds().includes(widget.id);
      // Pressing on a widget that is ALREADY part of a multi-selection must not
      // collapse the selection — otherwise a group can never be dragged, because
      // the pointerdown that starts the drag would have thrown the group away.
      // The collapse happens on release instead, if nothing moved (onTap).
      if (!additive && selectionCount() > 1 && selectedIds().includes(widget.id)) {
        // Promote to primary without changing membership, so the inspector and
        // "match size" follow the widget you actually grabbed.
        setSelection([...selectedIds().filter(id => id !== widget.id), widget.id]);
      } else {
        selectWidget(widget.id, { additive });
      }
      groupStart = selectionCount() > 1
        ? {
          primary: { ...widget.rect },
          others: selectedWidgets().filter(w => w.id !== widget.id).map(w => ({ id: w.id, rect: { ...w.rect } })),
        }
        : null;
    },
    onTap: () => {
      // A drag that ends exactly where it began reports no change, so the 'end'
      // phase never fires and the guides it painted would stay on screen until
      // the next render. Snapping back to the position you started from is a
      // perfectly ordinary way for a drag to end.
      guides.replaceChildren();
      groupStart = null;
      // Released without moving: NOW narrow the selection to the one widget under
      // the pointer. Click to pick one, drag to move them all — and a shift-click
      // is neither, it is an add, so it keeps what it just built.
      //
      // `exact` is what lets you reach INSIDE a group: without it the narrowing
      // would immediately re-expand to the whole group and the second click
      // would do nothing at all.
      if (downAdditive || !downWasInSelection) return;
      selectWidget(widget.id, { exact: true });
    },
    onChange: (rect, phase, mode, opts = {}) => {
      // A group drag moves as a block: no snapping (a snap line computed for one
      // member would silently shift every other one relative to it) and the
      // delta is clamped against the group's bounding box in moveRects, so the
      // arrangement survives reaching the slide edge intact.
      if (groupStart?.others.length && mode === 'move') {
        // The delta is measured from where the PRIMARY started, never from its
        // live rect — see the note on groupStart above for the bug that caused.
        const moved = moveRects(
          [groupStart.primary, ...groupStart.others.map(g => g.rect)],
          rect.x - groupStart.primary.x, rect.y - groupStart.primary.y,
        );
        // moveRects clamps the whole block, so the primary's own rect comes back
        // adjusted too — take it from the result rather than from the pointer.
        // clampRect here only ROUNDS (moveRects already guaranteed the block is
        // in bounds); running it keeps group drags writing the same 0.1 %-tidy
        // numbers into the JSON as every other path.
        widget.rect = clampRect(moved[0]);
        setGeo(frameEl, widget.rect, widget.rotation ?? 0);
        groupStart.others.forEach((g, i) => {
          const w = activeSlide()?.widgets.find(x => x.id === g.id);
          const f = frames.get(g.id);
          if (!w || !f) return;
          w.rect = clampRect(moved[i + 1]);
          setGeo(f.frameEl, w.rect, w.rotation ?? 0);
        });
        drawSelectionBounds();
        if (phase === 'end') { groupStart = null; commit('move-widget'); }
        return;
      }
      const snapped = snap(rect, widget.id, mode, opts);
      widget.rect = snapped;
      setGeo(frameEl, snapped, widget.rotation ?? 0);
      if (phase === 'end') { guides.replaceChildren(); groupStart = null; commit('move-widget'); }
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
//
// Two pieces of state, one invariant: `selectedWidgetId` is the PRIMARY (the one
// the inspector shows, the one "match size" measures against) and
// `selectedWidgetIds` is the whole set including it. The set is empty exactly
// when the primary is null.
//
// Everything OUTSIDE this module — the slide rail, undo, cloud-load, the
// inspector's back button, main.js's Escape — still writes only
// `selectedWidgetId`, exactly as it did when there was no multi-selection. The
// normaliser wired in mountCanvas turns any such write into a single-selection,
// so none of those call sites had to learn a second concept.
export function selectedIds() {
  return [...(state.ui.selectedWidgetIds ?? [])];
}
export function selectionCount() {
  return (state.ui.selectedWidgetIds ?? []).length;
}

// Set the whole selection at once. `ids` is ordered; the LAST one becomes the
// primary — it is the one the pointer just touched.
function setSelection(ids) {
  const slide = activeSlide();
  const live = new Set((slide?.widgets ?? []).map(w => w.id));
  const next = [...new Set(ids)].filter(id => live.has(id));
  state.ui.selectedWidgetIds = next;
  const primary = next.length ? next[next.length - 1] : null;
  // Assign the primary LAST: its subscriber is what swaps the right column, and
  // it must read a set that is already correct.
  if (state.ui.selectedWidgetId !== primary) state.ui.selectedWidgetId = primary;
  reflectSelection();
  onSelectCb?.(primary);
}

// Widgets sharing a `group` tag select as one object. Expanding at the SELECTION
// boundary (rather than teaching every action about groups) is what keeps the
// rest of this file group-agnostic: drag, nudge, align, delete and z-order all
// operate on "the selection", and the selection is already the whole group by
// the time they see it.
function expandGroups(ids) {
  const slide = activeSlide();
  if (!slide) return [...ids];
  const byId = new Map(slide.widgets.map(w => [w.id, w]));
  const groups = new Set();
  for (const id of ids) {
    const g = byId.get(id)?.group;
    if (g) groups.add(g);
  }
  if (!groups.size) return [...ids];
  const out = [...ids];
  for (const w of slide.widgets) {
    if (w.group && groups.has(w.group) && !out.includes(w.id)) out.push(w.id);
  }
  // The clicked widget stays LAST so it remains the primary — you grabbed it,
  // so it is the one the inspector and "match size" should follow.
  const last = ids[ids.length - 1];
  return [...out.filter(x => x !== last), last];
}

// `additive` (shift / ctrl / cmd-click) toggles one widget in and out of the set
// instead of replacing it. `exact` skips group expansion — the second click on
// an already-selected group, which reaches inside it for one member (the
// PowerPoint rule: click selects the group, click again selects within it).
function selectWidget(id, { additive = false, exact = false } = {}) {
  const target = !id ? [] : exact ? [id] : expandGroups([id]);
  if (!additive || !id) { setSelection(target); return; }
  const cur = selectedIds();
  // Shift-clicking a group adds or removes it WHOLE. Removing one member of a
  // group from a selection while leaving its siblings in would produce a
  // selection that no click could ever reproduce.
  const alreadyIn = target.every(t => cur.includes(t));
  const next = alreadyIn
    ? cur.filter(x => !target.includes(x))
    : [...cur.filter(x => !target.includes(x)), ...target];
  setSelection(next);
}

// ---- grouping ----
// The group tag is EDITOR-ONLY (see the Widget shape in shared/slide-schema.js):
// the player renders a flat widget list and ignores it, so grouping can never
// change what a screen shows.
export function groupSelection() {
  const sel = selectedWidgets();
  if (sel.length < 2) return false;
  // Groups do not nest. Grouping a selection that already contains groups
  // flattens them into one — the alternative is a tree the canvas would have to
  // walk on every click, for a gain nobody asked for. Ungroup then gives back
  // loose widgets, which is what "ungroup" means everywhere else.
  const id = newGroupId();
  for (const w of sel) w.group = id;
  commit('group-widgets');
  // Re-publish the same selection so the store notifies: the Arrange panel has
  // to swap its Group button for Ungroup, and nothing else changed that it
  // could have noticed.
  setSelection(selectedIds());
  return true;
}
export function ungroupSelection() {
  const sel = selectedWidgets();
  const grouped = sel.filter(w => w.group);
  if (!grouped.length) return false;
  for (const w of grouped) delete w.group;
  commit('ungroup-widgets');
  setSelection(selectedIds());
  return true;
}
// Is the whole selection one group? Drives the Group/Ungroup buttons' state.
export function selectionGroupState() {
  const sel = selectedWidgets();
  if (!sel.length) return 'none';
  const groups = new Set(sel.map(w => w.group ?? ''));
  if (groups.size === 1 && !groups.has('')) return 'grouped';
  return sel.length > 1 ? 'groupable' : 'none';
}

export function selectAllWidgets() {
  const slide = activeSlide();
  // Locked widgets are excluded on purpose: "select all" followed by a nudge
  // would otherwise move the very background you locked to stop moving.
  // Hidden ones are excluded because they have no frame to select.
  setSelection((slide?.widgets ?? []).filter(w => !w.locked && !w.hidden).map(w => w.id));
}

// The Layers panel's way in. It selects by id without going through a frame, so
// it can reach a widget the canvas cannot: one that is locked (no pointer
// events) or buried under three others. Group expansion still applies — a
// grouped row selects its group, exactly as clicking it on the canvas would.
export function setSelectionFromLayers(id, { additive = false } = {}) {
  selectWidget(id, { additive });
}

// Keep the set honest when someone sets the primary from outside this module.
// Called from a `ui.selectedWidgetId` subscriber, so it must be a no-op in the
// normal case or it would fight setSelection above (and recurse).
function normalizeSelection() {
  const primary = state.ui.selectedWidgetId;
  const cur = state.ui.selectedWidgetIds ?? [];
  if (!primary) { if (cur.length) { state.ui.selectedWidgetIds = []; reflectSelection(); } return; }
  if (cur.length && cur[cur.length - 1] === primary) return;   // already consistent
  // An outside write names one widget; that is a single-selection by definition.
  state.ui.selectedWidgetIds = [primary];
  reflectSelection();
}

function reflectSelection() {
  const set = new Set(state.ui.selectedWidgetIds ?? []);
  const primary = state.ui.selectedWidgetId;
  for (const [id, { frameEl }] of frames) {
    frameEl.classList.toggle('avs-frame-selected', set.has(id));
    // Only the primary shows resize + rotate handles. Eight handles on every
    // member of a six-widget selection is a field of dots you cannot aim at,
    // and dragging one of them would be ambiguous anyway.
    frameEl.classList.toggle('avs-frame-primary', id === primary && set.size <= 1);
    frameEl.classList.toggle('avs-frame-multi', set.has(id) && set.size > 1);
  }
  drawSelectionBounds();
}

// A dashed box around the whole selection — the thing that makes a multi-
// selection read as ONE object you can drag, rather than as several widgets
// that happen to be outlined at the same time. Drawn in the guides layer
// (already above every frame and already pointer-transparent).
function drawSelectionBounds() {
  if (!stage) return;
  const sel = selectedWidgets();
  const b = sel.length > 1 ? boundsOf(sel.map(w => w.rect)) : null;
  if (!b) { groupFrame?.remove(); groupFrame = null; groupTeardown?.(); groupTeardown = null; return; }
  // Reuse the frame across selection changes: rebuilding it would tear down the
  // pointer handlers mid-drag the first time a resize crosses another widget.
  if (!groupFrame) {
    groupFrame = document.createElement('div');
    groupFrame.className = 'avs-group-frame';
    groupFrame.innerHTML = '<span class="avs-selection-count"></span>';
    addHandles(groupFrame);
    // Above every widget frame (which sit at z-index 1000 when selected) so its
    // handles are always the ones you hit.
    groupFrame.style.zIndex = '1500';
    stage.appendChild(groupFrame);
    groupTeardown = makeGroupInteractive();
  }
  groupFrame.style.left = b.x + '%'; groupFrame.style.top = b.y + '%';
  groupFrame.style.width = b.w + '%'; groupFrame.style.height = b.h + '%';
  groupFrame.querySelector('.avs-selection-count').textContent =
    t('canvas.selectedCount', { n: sel.length });
}

// Resizing the SELECTION's bounding box, carrying every member proportionally —
// what makes a group behave like one object instead of several that happen to be
// selected. The move case is deliberately NOT handled here: the frame has
// `pointer-events: none` on its body, so a drag that starts anywhere but a
// handle falls through to the widget underneath and takes the group with it (see
// the group-drag branch in buildFrame). That keeps ONE implementation of "move
// the selection" rather than two that can disagree.
let groupFrame = null;
let groupTeardown = null;

function makeGroupInteractive() {
  let startBounds = null;
  let startRects = null;

  return makeInteractive(groupFrame, {
    getStageRect: () => stage.getBoundingClientRect(),
    getRect: () => boundsOf(selectedWidgets().map(w => w.rect)) ?? { x: 0, y: 0, w: 1, h: 1 },
    getRotation: () => 0,
    onSelect: () => {
      const sel = selectedWidgets();
      startBounds = boundsOf(sel.map(w => w.rect));
      startRects = sel.map(w => ({ id: w.id, rect: { ...w.rect } }));
    },
    onChange: (rect, phase, mode) => {
      // Only the handles resize; a body drag never reaches here.
      if (mode === 'move' || !startBounds) return;
      const scaled = scaleRects(startRects.map(r => r.rect), startBounds, rect);
      startRects.forEach((sr, i) => {
        const w = activeSlide()?.widgets.find(x => x.id === sr.id);
        const f = frames.get(sr.id);
        if (!w || !f) return;
        w.rect = clampRect(scaled[i]);
        setGeo(f.frameEl, w.rect, w.rotation ?? 0);
      });
      drawSelectionBounds();
      if (phase === 'end') { startBounds = null; commit('resize-group'); }
    },
    // A rotation handle on a group would have to rotate each member about the
    // GROUP's centre, which needs per-widget offset maths the flat percent-rect
    // model cannot express. CSS hides the handle; this is the belt to that
    // braces, so a stray event can never write a rotation nobody can undo.
    onRotate: () => {},
  });
}

// The widgets in the current selection, in selection order (primary LAST) —
// except for the arrange helpers, which want the primary FIRST (see arrangeList).
function selectedWidgets() {
  const slide = activeSlide();
  if (!slide) return [];
  const byId = new Map(slide.widgets.map(w => [w.id, w]));
  return selectedIds().map(id => byId.get(id)).filter(Boolean);
}

// ---- marquee (rubber-band) selection ----
//
// Drag on empty canvas to sweep up everything the band TOUCHES. Touch, not
// full containment: on a slide where widgets are usually edge-to-edge, a
// containment rule means you have to drag past the slide border to catch the
// widget on it — which is exactly where the band stops being draggable.
//
// The band is drawn in the guides layer (already on top of every frame and
// already pointer-transparent) in the stage's own percent space, so it lines up
// with the widgets at any zoom or pan.
const MARQUEE_MIN_PX = 4;   // below this it was a click, not a drag

function startMarquee(downEvent, additive) {
  const sr = stage.getBoundingClientRect();
  const base = additive ? selectedIds() : [];
  const toPct = (cx, cy) => ({
    x: ((cx - sr.left) / sr.width) * 100,
    y: ((cy - sr.top) / sr.height) * 100,
  });
  const start = toPct(downEvent.clientX, downEvent.clientY);
  let band = null;
  let moved = false;

  const onMove = (e) => {
    if (!moved) {
      moved = Math.abs(e.clientX - downEvent.clientX) > MARQUEE_MIN_PX
           || Math.abs(e.clientY - downEvent.clientY) > MARQUEE_MIN_PX;
      if (!moved) return;
      band = document.createElement('div');
      band.className = 'avs-marquee';
      guides.appendChild(band);
    }
    const cur = toPct(e.clientX, e.clientY);
    const r = {
      x: Math.min(start.x, cur.x), y: Math.min(start.y, cur.y),
      w: Math.abs(cur.x - start.x), h: Math.abs(cur.y - start.y),
    };
    band.style.left = r.x + '%'; band.style.top = r.y + '%';
    band.style.width = r.w + '%'; band.style.height = r.h + '%';
    // Touching one member of a group sweeps up the whole group: a band that
    // caught two thirds of a grouped header would otherwise let you drag those
    // two away from the third.
    const hits = expandGroups((activeSlide()?.widgets ?? [])
      .filter(w => !w.locked && !w.hidden && intersects(r, w.rect))
      .map(w => w.id));
    setSelection([...base, ...hits]);
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    band?.remove();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
}

const intersects = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---- format painter ----
// PowerPoint's model: pick the look up off one widget, then click another. The
// "paste" being a CLICK rather than a keystroke is what keeps this out of the
// keyboard entirely — Ctrl+Shift+V is the browser's paste-as-plain-text inside
// a text field, and a format painter is not worth breaking that for.
export function armFormatPainter() {
  const w = selectedWidgets().slice(-1)[0];   // the primary
  if (!w) return false;
  const ok = armPainter(w);
  if (ok) {
    document.body.classList.add('avs-fmt-armed');
    // The brush is a MODE, and a mode with no visible state is a trap. The
    // cursor changes, and this says what to do next and how to get out.
    toast(t('fmt.armed'), { kind: 'info', ttl: 6000 });
  }
  return ok;
}
export function disarmFormatPainter() {
  document.body.classList.remove('avs-fmt-armed');
  return disarmPainter();
}
export function isFormatPainterArmed() { return painterArmed(); }

// Paint one widget and put the brush down. One click, one target: a brush that
// stayed armed would repaint the next thing you touched for any reason, and
// "why did that change" is a bad thing to have to work out.
function paintWidget(id) {
  const slide = activeSlide();
  const w = slide?.widgets.find(x => x.id === id);
  const fmt = armedFormat();
  disarmFormatPainter();
  if (!w || !fmt) return false;
  if (!applyFormat(w, fmt)) {
    // Saying "nothing changed" beats silence: the click DID something (it put
    // the brush down), and a user who sees no change needs to know which.
    toast(t('fmt.none'), { kind: 'info', ttl: 2500 });
    renderSlide();
    return false;
  }
  commit('paint-format');
  renderSlide();
  selectWidget(id);
  toast(t('fmt.done'), { kind: 'success', ttl: 1800 });
  return true;
}

// ---- slide master ----
// Switching modes is a full re-render: the canvas is now showing a different
// widget array, and the selection named widgets that are no longer on it.
export function setEditingMaster(on) {
  const want = !!on;
  if (!!state.ui.editingMaster === want) return;
  if (want) ensureMaster(state.playlist);
  selectWidget(null);
  state.ui.editingMaster = want;
  renderSlide();
  zoomToFit();
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

// Fresh group ids for a batch about to be inserted: old id -> new id, one new id
// per distinct old one. Duplicating a group has to produce a NEW group (a copy
// that silently joined the original would move the originals when you dragged
// it), and duplicating two different groups at once has to keep them two.
function remapGroups(sources) {
  const map = new Map();
  for (const w of sources) {
    if (w.group && !map.has(w.group)) map.set(w.group, newGroupId());
  }
  return map;
}

// Build a widget for INSERTION from a source widget (duplicate / paste /
// composite). Carries content/title/background/anim/loop/rotation, clamps the
// target rect, and stamps contentVersion to the plugin's current version when the
// source lacks one. `clone` (default true) deep-copies the reactive fields via
// JSON so the copy doesn't alias the source's reactive Proxy subtree
// (structuredClone throws DataCloneError on a Proxy); pass false when the source
// is already a plain object (a saved composite). ONE place owns this now — it was
// hand-written three times (duplicate / paste / composite) with subtle drift.
function widgetForInsert(source, { rect, z, clone = true, group }) {
  const c = clone ? (v => (v == null ? v : JSON.parse(JSON.stringify(v)))) : (v => v);
  return createWidget(source.type ?? 'text', {
    rect: clampRect(rect ?? { x: 30, y: 30, w: 40, h: 30 }),
    z,
    // `group` is passed in already REMAPPED by the caller (see remapGroups) —
    // never copied straight from the source, or a duplicated group would join
    // the original instead of becoming a group of its own, and moving the copy
    // would drag the widgets you copied it from along with it.
    ...(group && { group }),
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

// Remove / duplicate the current selection. All of these act on the WHOLE
// selection: with one widget selected they behave exactly as they always did.
export function deleteSelected() {
  const slide = activeSlide();
  const ids = new Set(selectedIds());
  if (!slide || !ids.size) return;
  slide.widgets = slide.widgets.filter(w => !ids.has(w.id));
  commit('delete-widget');
  renderSlide();
  selectWidget(null);
}
export function duplicateSelected() {
  const slide = activeSlide();
  const sel = selectedWidgets();
  if (!slide || !sel.length) return;
  let z = maxZ(slide);
  const groups = remapGroups(sel);
  const copies = sel.map(w => {
    z += 1;
    return widgetForInsert(w, {
      rect: { ...w.rect, x: w.rect.x + 3, y: w.rect.y + 3 }, z,
      group: w.group ? groups.get(w.group) : undefined,
    });
  });
  slide.widgets.push(...copies);
  commit('duplicate-widget');
  renderSlide();
  // Select the copies, not the originals — you duplicated in order to move the
  // new ones somewhere.
  setSelection(copies.map(c => c.id));
}

// ---- z-order ----
// The selection keeps its INTERNAL stacking order when it moves as a block: the
// widgets are re-stamped in their existing z order, so raising three widgets
// above everything else doesn't shuffle them against each other.
export function bringToFront() {
  const slide = activeSlide();
  const sel = selectedWidgets();
  if (!slide || !sel.length) return;
  let z = maxZ(slide);
  for (const w of [...sel].sort((a, b) => (a.z ?? 0) - (b.z ?? 0))) w.z = ++z;
  commit('z-front'); renderSlide(); reflectSelection();
}
export function sendToBack() {
  const slide = activeSlide();
  const sel = selectedWidgets();
  if (!slide || !sel.length) return;
  let z = slide.widgets.reduce((m, x) => Math.min(m, x.z ?? 0), 0);
  // Descending, decrementing: the last one written gets the lowest z, so the
  // group's own order survives going to the back too.
  for (const w of [...sel].sort((a, b) => (b.z ?? 0) - (a.z ?? 0))) w.z = --z;
  commit('z-back'); renderSlide(); reflectSelection();
}

// ---- arrange (align / distribute / match size) ----
//
// The arrange math is pure and lives in ./arrange.js. These wrap it: read the
// selection's rects, hand them over, write the results back, one undo entry.
//
// The list is ordered PRIMARY FIRST — matchSize measures against the first rect,
// and the primary is the one you clicked last, i.e. the one whose size you were
// looking at when you decided the others should match it.
function arrangeList() {
  const sel = selectedWidgets();
  return sel.length > 1 ? [sel[sel.length - 1], ...sel.slice(0, -1)] : sel;
}

function applyArrange(widgets, rects, label) {
  let changed = false;
  widgets.forEach((w, i) => {
    const r = rects[i];
    if (!r) return;
    if (w.rect.x !== r.x || w.rect.y !== r.y || w.rect.w !== r.w || w.rect.h !== r.h) changed = true;
    setWidgetGeometry(w.id, r);
  });
  drawSelectionBounds();
  // A no-op arrange (already aligned) must not push an undo entry — the same
  // rule a click-without-drag follows.
  if (changed) commit(label);
  return changed;
}

export function alignSelection(mode) {
  const list = arrangeList();
  if (list.length < 2) return false;
  return applyArrange(list, alignRects(list.map(w => w.rect), mode), 'align-widgets');
}
export function distributeSelection(axis) {
  const list = arrangeList();
  if (list.length < 3) return false;
  return applyArrange(list, distributeRects(list.map(w => w.rect), axis), 'distribute-widgets');
}
export function matchSelectionSize(dim) {
  const list = arrangeList();
  if (list.length < 2) return false;
  return applyArrange(list, matchSize(list.map(w => w.rect), dim), 'match-size');
}

// ---- copy / paste (across slides) ----
// The clipboard holds an ARRAY, always — copying one widget is the one-element
// case. Pasting keeps the copied widgets' relative positions, so copying a
// header + rule + caption onto the next slide reproduces the arrangement rather
// than a stack of three widgets at the same spot.
let clipboard = null;
const cloneJson = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
export function hasClipboard() { return !!clipboard?.length; }
export function copySelected() {
  const sel = selectedWidgets();
  if (!sel.length) return;
  clipboard = sel.map(w => cloneJson({
    type: w.type, content: w.content, title: w.title, background: w.background,
    rect: w.rect, contentVersion: w.contentVersion, anim: w.anim, loop: w.loop,
    rotation: w.rotation, group: w.group,
  }));
}
export function pasteWidget(point) {
  const slide = activeSlide();
  if (!slide || !clipboard?.length) return;
  // Offset the whole clipboard by one delta, computed from its bounding box, so
  // the group lands as a group. Without a point, the classic +3/+3 nudge makes
  // the paste visible on top of the original instead of hiding behind it.
  const b = boundsOf(clipboard.map(c => c.rect));
  const dx = point ? point.x - b.w / 2 - b.x : 3;
  const dy = point ? point.y - b.h / 2 - b.y : 3;
  let z = maxZ(slide);
  const groups = remapGroups(clipboard);
  const copies = clipboard.map(c => widgetForInsert(c, {
    rect: { ...c.rect, x: c.rect.x + dx, y: c.rect.y + dy },
    z: ++z,
    group: c.group ? groups.get(c.group) : undefined,
  }));
  slide.widgets.push(...copies);
  commit('paste-widget'); renderSlide(); setSelection(copies.map(c => c.id));
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
  const n = selectionCount();
  const multi = n > 1;
  const items = [
    { label: t('ctx.duplicate'), icon: '⧉', run: () => duplicateSelected() },
    { label: t('ctx.copy'), icon: uiIconSvg('copy', 14), run: () => copySelected() },
    { label: t('ctx.paste'), icon: uiIconSvg('upload', 14), disabled: !hasClipboard(), run: () => pasteWidget() },
    { label: t('ctx.delete'), icon: uiIconSvg('trash', 14), run: () => deleteSelected() },
    { separator: true },
    { label: t('ctx.toFront'), icon: uiIconSvg('arrow-up', 14), run: () => bringToFront() },
    { label: t('ctx.toBack'), icon: uiIconSvg('arrow-down', 14), run: () => sendToBack() },
  ];
  // The arrange actions only exist for a selection they can act on, so they are
  // listed only when there IS one — a menu full of greyed-out rows teaches
  // nothing about when they light up.
  if (multi) {
    items.push({ separator: true });
    items.push({ label: t('arrange.group'), icon: uiIconSvg('arr-group', 14), run: () => groupSelection() });
  }
  if (selectionGroupState() === 'grouped') {
    if (!multi) items.push({ separator: true });
    items.push({ label: t('arrange.ungroup'), icon: uiIconSvg('arr-ungroup', 14), run: () => ungroupSelection() });
  }
  if (multi) {
    items.push({ separator: true });
    items.push({ label: t('arrange.alignLeft'), icon: uiIconSvg('arr-left', 14), run: () => alignSelection('left') });
    items.push({ label: t('arrange.alignHCenter'), icon: uiIconSvg('arr-hcenter', 14), run: () => alignSelection('hcenter') });
    items.push({ label: t('arrange.alignRight'), icon: uiIconSvg('arr-right', 14), run: () => alignSelection('right') });
    items.push({ label: t('arrange.alignTop'), icon: uiIconSvg('arr-top', 14), run: () => alignSelection('top') });
    items.push({ label: t('arrange.alignVMiddle'), icon: uiIconSvg('arr-vmiddle', 14), run: () => alignSelection('vmiddle') });
    items.push({ label: t('arrange.alignBottom'), icon: uiIconSvg('arr-bottom', 14), run: () => alignSelection('bottom') });
    if (n > 2) {
      items.push({ separator: true });
      items.push({ label: t('arrange.distributeH'), icon: uiIconSvg('arr-dist-h', 14), run: () => distributeSelection('h') });
      items.push({ label: t('arrange.distributeV'), icon: uiIconSvg('arr-dist-v', 14), run: () => distributeSelection('v') });
    }
  }
  items.push({ separator: true });
  // A background is one widget's property; with several selected there is no
  // single widget for the editor to open.
  if (!multi) items.push({ label: t('ctx.background'), icon: uiIconSvg('image', 14), run: () => openWidgetBgModal(id) });
  if (!multi) {
    items.push({ label: t('fmt.copy'), icon: uiIconSvg('brush', 14), run: () => armFormatPainter() });
  }
  items.push({ label: t('ctx.selectAll'), icon: uiIconSvg('copy', 14), run: () => selectAllWidgets() });
  return items;
}
function canvasMenuItems(pt) {
  return [
    { label: t('ctx.addText'), icon: uiIconSvg('type', 14), run: () => addTextAt(pt) },
    { label: t('ctx.addWidget'), icon: uiIconSvg('plus', 14), run: () => openPalette() },
    { label: t('ctx.paste'), icon: uiIconSvg('upload', 14), disabled: !hasClipboard(), run: () => pasteWidget(pt) },
    { label: t('ctx.selectAll'), icon: uiIconSvg('copy', 14), run: () => selectAllWidgets() },
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
function snap(rect, selfId, mode, opts = {}) {
  const slide = activeSlide();
  const self = slide?.widgets.find(w => w.id === selfId);
  const rotated = !!(self && (self.rotation ?? 0) % 360 !== 0);
  // Hidden widgets supply no snap lines: lining up with something invisible is
  // a guide that appears out of nowhere and points at nothing.
  const others = (slide?.widgets ?? [])
    .filter(w => w.id !== selfId && !w.hidden)
    .map(w => w.rect);
  const v = viewSettings();
  // The math (snap lines, spacing, size match, grid, clamp) lives in the DOM-free
  // canvas-math.js; here we just paint what it reports.
  const { rect: snapped, vLines, hLines, gapMarks } = computeSnap({
    rect, mode, rotated, others,
    grid: v.grid, margin: v.margin,
    enabled: v.snap && !opts.noSnap,
  });
  guides.replaceChildren();
  for (const x of vLines) drawGuideV(x);
  for (const y of hLines) drawGuideH(y);
  for (const g of gapMarks ?? []) drawGapMark(g);
  return snapped;
}
function drawGuideV(x) { const g = document.createElement('div'); g.className = 'avs-guide avs-guide-v'; g.style.left = x + '%'; guides.appendChild(g); }
function drawGuideH(y) { const g = document.createElement('div'); g.className = 'avs-guide avs-guide-h'; g.style.top = y + '%'; guides.appendChild(g); }

// The end-capped span that says WHY something snapped where it did: "this gap
// equals that one". A bare line would show the position without the reason,
// which is the difference between a guide and a twitch.
function drawGapMark({ axis, from, to, cross }) {
  const el = document.createElement('div');
  el.className = 'avs-gapmark avs-gapmark-' + axis;
  const lo = Math.min(from, to), size = Math.abs(to - from);
  if (axis === 'h') { el.style.left = lo + '%'; el.style.width = size + '%'; el.style.top = cross + '%'; }
  else { el.style.top = lo + '%'; el.style.height = size + '%'; el.style.left = cross + '%'; }
  guides.appendChild(el);
}

// The View menu. Built on the same context-menu primitive the canvas already
// uses, so it inherits click-outside dismissal, Escape and keyboard traversal
// rather than growing a second popover with its own half of those.
//
// Every row is a toggle or a choice with a tick, and the tick is drawn as the
// item's icon — the primitive has no checkbox concept, and a "✓ Grid 5 %" row
// reads the same as one.
const GRID_STEPS = [0, 1, 2.5, 5, 10];
const MARGIN_STEPS = [0, 3, 5, 10];

function openViewMenu(anchorEl) {
  const v = viewSettings();
  const tick = on => (on ? uiIconSvg('check-circle', 14) : '');
  const items = [
    { label: t('view.snap'), icon: tick(v.snap), run: () => setViewSetting('snap', !v.snap) },
    { separator: true },
    ...GRID_STEPS.map(g => ({
      label: g === 0 ? t('view.gridOff') : t('view.gridStep', { n: g }),
      icon: tick(v.grid === g),
      run: () => {
        setViewSetting('grid', g);
        // Choosing a grid size and then having to turn the grid ON is a step
        // nobody wants; choosing "off" should stop drawing it too.
        setViewSetting('showGrid', g > 0);
      },
    })),
    { separator: true },
    { label: t('view.showGrid'), icon: tick(v.showGrid), run: () => setViewSetting('showGrid', !v.showGrid) },
    { separator: true },
    ...MARGIN_STEPS.map(m => ({
      label: m === 0 ? t('view.marginOff') : t('view.marginStep', { n: m }),
      icon: tick(v.margin === m),
      run: () => { setViewSetting('margin', m); setViewSetting('showMargin', m > 0); },
    })),
  ];
  const r = anchorEl.getBoundingClientRect();
  openContextMenu(r.left, r.bottom + 4, items);
}

// ---- view aids (grid / margins / snapping) ----
// Read through a normaliser rather than straight off the store: `ui.view` comes
// back from localStorage, where a hand-edited or older value can be anything,
// and a NaN grid step quantises every rect to NaN.
export function viewSettings() {
  const v = state.ui?.view ?? {};
  const num = (x, max) => {
    const n = Number(x);
    return Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0;
  };
  return {
    snap: v.snap !== false,
    grid: num(v.grid, 50),
    showGrid: !!v.showGrid,
    margin: num(v.margin, 49),
    showMargin: !!v.showMargin,
  };
}

export function setViewSetting(key, value) {
  const cur = state.ui.view ?? {};
  state.ui.view = { ...cur, [key]: value };
  applyViewAids();
}

// Paint (or remove) the grid and safe-area overlays. Both live in the stage
// BEHIND every widget frame and are pointer-transparent, so neither can eat a
// click meant for the slide.
function applyViewAids() {
  if (!stage) return;
  const v = viewSettings();
  let grid = stage.querySelector('.avs-grid-overlay');
  if (v.showGrid && v.grid > 0) {
    if (!grid) {
      grid = document.createElement('div');
      grid.className = 'avs-grid-overlay';
      // After the slide background, before the frames.
      stage.insertBefore(grid, stage.querySelector('.avs-widget-frame'));
    }
    // Percent-sized cells, so the grid means the same thing at every zoom and
    // on every canvas size — the same reason widget rects are percentages.
    // All four layers share the step; the 1px offsets in the stylesheet are what
    // make the pair read as one line with a light and a dark side.
    const step = `${v.grid}% ${v.grid}%`;
    grid.style.backgroundSize = [step, step, step, step].join(', ');
  } else grid?.remove();

  let margin = stage.querySelector('.avs-margin-overlay');
  if (v.showMargin && v.margin > 0) {
    if (!margin) {
      margin = document.createElement('div');
      margin.className = 'avs-margin-overlay';
      stage.insertBefore(margin, stage.querySelector('.avs-widget-frame'));
    }
    margin.style.inset = `${v.margin}%`;
  } else margin?.remove();
}

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
