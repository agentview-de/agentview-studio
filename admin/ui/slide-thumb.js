// Real, scaled slide previews — the same plugin render() the canvas and the
// player use, laid out at the design size and scaled down with a CSS transform.
//
// WHY NOT THE RAIL'S BLOCK THUMBNAILS: the slide rail draws widget rects as
// grey boxes with an icon, which is exactly right for a list of forty slides
// you are scrolling past. A template store is choosing between compositions
// you have never seen — a grid of grey boxes tells you nothing about whether a
// template is any good. So this renders for real.
//
// WHY A TRANSFORM AND NOT JUST A SMALL BOX: `.bb-slide` is a `container-type:
// size` element and widget typography is `clamp(28px, 8cqmin, 96px)` — the
// clamp FLOOR means a 320 px-wide box still sets 28 px type, which overflows
// every tile and looks nothing like the real screen. Rendering at 1920×1080 and
// scaling the whole thing by 0.17 keeps every proportion exactly as published.
//
// PRIVACY: network widgets are NOT fetched. The canvas holds them behind a
// click-to-load gate (DSGVO — see admin/canvas/live-preview.js); a wall of
// template cards would be far worse, so here they always render the
// placeholder. Nothing in this module touches the network.

import { mountWidget, widgetSlotZ } from '../../shared/widget-host.js';
import { applySlideBackground, applySlideContrast, applyWidgetBg } from '../../shared/background.js';
import { resolveCanvas, visibleWidgets, masterWidgetsFor } from '../../shared/slide-schema.js';
import { get as getPlugin } from '../../shared/plugins/registry.js';
import { usesNetwork } from '../../shared/plugin-network.js';
import { widgetIcon } from '../../shared/data/widget-icons.js';
import { escapeHtml } from '../../shared/utils/escape.js';
import { t } from '../i18n.js';

// A network widget's stand-in inside a thumbnail. Deliberately quieter than the
// canvas placeholder (no button, no explanation): at thumbnail scale the label
// would be unreadable anyway, and the point is only to show that something
// live lives here.
function offlineStandIn(host, widget, plugin) {
  const el = document.createElement('div');
  // A media stand-in and a live-data stand-in mean different things and should
  // not look identical. "A picture goes here" is an invitation and gets the
  // same hatch the blank-template card uses; "a live feed goes here" is a
  // statement of fact and stays a plain tinted panel. Before this, a template
  // built around the user's own photo showed in the store as an empty grey
  // rectangle and read as a broken card rather than an offer.
  el.className = 'avs-thumb-offline'
    + (plugin?.group === 'media' ? ' avs-thumb-offline-media' : '');
  el.innerHTML = `
    <span class="avs-thumb-offline-icon">${widgetIcon(widget.type, escapeHtml(plugin?.icon ?? '◻'), '1em')}</span>
    <span class="avs-thumb-offline-label">${escapeHtml(plugin?.label ?? widget.type)}</span>`;
  host.appendChild(el);
  return () => el.remove();
}

/**
 * Render one slide into `host`, scaled to `host`'s current width.
 *
 * @param {HTMLElement} host    the box to fill; gets an explicit height
 * @param {object} slide
 * @param {object} playlist     read for canvas size + default theme
 * @param {object} [opts]
 * @param {number} [opts.width] override the measured width (px)
 * @param {'width'|'contain'} [opts.fit]
 *        'width' (default) scales to the host's width and gives the host
 *        whatever height that implies — right when the caller wants the slide's
 *        own shape. 'contain' keeps the host's existing box and fits the slide
 *        inside it, centred. Use it wherever the box is part of a LAYOUT: a
 *        1080×1920 door sign scaled on width alone came out 652 px tall in a
 *        grid of 204 px cards, stretched its whole row, and pushed its own
 *        title and buttons off the card.
 * @returns {() => void} dispose — MUST be called; plugins hold timers
 */
export function renderSlideThumb(host, slide, playlist, opts = {}) {
  const { w: cw, h: ch } = resolveCanvas(playlist?.canvas);
  host.classList.add('avs-thumb-host');
  const width = opts.width || host.clientWidth || 320;
  // Read the box BEFORE writing a height to it, or 'contain' would measure the
  // height it set on the previous render and shrink a little every time.
  const boxH = opts.fit === 'contain' ? (opts.maxHeight || host.clientHeight || 0) : 0;
  const scale = boxH ? Math.min(width / cw, boxH / ch) : width / cw;

  host.style.height = `${Math.round(boxH || ch * scale)}px`;
  host.replaceChildren();

  const stage = document.createElement('div');
  stage.className = 'avs-thumb-stage';
  const theme = slide?.theme ?? playlist?.defaults?.theme ?? 'minimal-dark';
  if (theme) stage.classList.add(`bb-theme-${theme}`);
  stage.style.width = `${cw}px`;
  stage.style.height = `${ch}px`;
  stage.style.transform = `scale(${scale})`;
  // transform-origin is 0 0, so centring is a plain offset of the leftover box.
  if (boxH) {
    stage.style.left = `${Math.round((width - cw * scale) / 2)}px`;
    stage.style.top = `${Math.round((boxH - ch * scale) / 2)}px`;
  }
  host.appendChild(stage);

  const bg = document.createElement('div');
  bg.className = 'avs-thumb-bg';
  applySlideBackground(bg, slide?.background);
  applySlideContrast(stage, slide?.background);
  stage.appendChild(bg);

  const disposers = [];
  // The master belongs in the thumbnail for the same reason it belongs on the
  // canvas: a rail of slides that all look emptier than they will be is a rail
  // you cannot navigate by.
  const withMaster = [...masterWidgetsFor(playlist, slide), ...(slide?.widgets ?? [])];
  const widgets = visibleWidgets(withMaster).sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  for (const w of widgets) {
    const plugin = getPlugin(w.type);
    const r = w.rect ?? { x: 0, y: 0, w: 100, h: 100 };
    const slot = document.createElement('div');
    slot.className = 'bb-widget avs-thumb-slot';
    // position/overflow inline, not left to the class: the slot has to be a
    // positioned ancestor for the bg and content layers' `inset:0` to resolve
    // against IT. Relying on studio.css for that made the renderer silently
    // wrong anywhere that sheet is not loaded — every widget then laid itself
    // out against the whole stage, at full-slide type size. The player inlines
    // the same two properties for the same reason.
    slot.style.cssText =
      'position:absolute;overflow:hidden;'
      + `left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;z-index:${widgetSlotZ(w)};`
      + (w.rotation ? `rotate:${w.rotation}deg;` : '');

    const bgLayer = document.createElement('div');
    bgLayer.style.cssText = 'position:absolute;inset:0;z-index:0;';
    applyWidgetBg(bgLayer, w);
    const content = document.createElement('div');
    content.style.cssText = 'position:absolute;inset:0;z-index:1;';
    slot.append(bgLayer, content);
    stage.appendChild(slot);

    // Entrance builds and ambient loops are deliberately skipped: a thumbnail
    // shows the RESTING state. A grid of twenty cards each running a Ken Burns
    // loop is a space heater, and a build that has not fired yet renders as an
    // invisible widget — the worst possible preview.
    if (!plugin) continue;
    if (usesNetwork(plugin, w.content ?? {})) {
      disposers.push(offlineStandIn(content, w, plugin));
    } else {
      disposers.push(mountWidget(w, slide, content, { mode: 'preview', t }));
    }
  }

  return () => {
    for (const d of disposers) { try { d(); } catch {} }
    disposers.length = 0;
    host.replaceChildren();
  };
}

/**
 * Lazy variant: render only once the host scrolls into view, and tear down
 * again when it leaves. A store grid with 27 cards × several widgets each would
 * otherwise mount well over a hundred plugin instances at open.
 *
 * Returns a dispose that stops observing and unmounts whatever is mounted.
 */
export function lazySlideThumb(host, slide, playlist, opts = {}) {
  let dispose = null;
  const mount = () => { if (!dispose) dispose = renderSlideThumb(host, slide, playlist, opts); };
  const unmount = () => { if (dispose) { dispose(); dispose = null; } };

  // No IntersectionObserver (old embedded browser, jsdom): render immediately.
  // Correctness first — the cost is a slower open, not a broken store.
  if (typeof IntersectionObserver !== 'function') {
    mount();
    return unmount;
  }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) mount();
      // rootMargin keeps a screen of cards alive on either side, so scrolling
      // back never shows an empty card.
      else unmount();
    }
  }, { rootMargin: '300px 0px' });
  io.observe(host);
  return () => { io.disconnect(); unmount(); };
}
