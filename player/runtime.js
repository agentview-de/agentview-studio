// Player runtime. Boots inside display.html. Fetches a presentation JSON from
// window.BB_READ_URL (publish-bundler injects the actual URL), renders slides
// one at a time with transitions, honors the day-parting scheduler and disposes
// every widget between slides.
//
// v2 model: a slide is a container of absolutely-positioned widgets (percent
// rect). ONE render path — render slide.widgets[]. v1 playlists are migrated
// on the fly so already-published slots keep working.

import { get as getPlugin } from '../shared/plugins/registry.js';
import '../shared/plugins/all.js';
import { migratePlaylist, applyWidgetMigrations, resolveBrandKit, resolveCanvas } from '../shared/slide-schema.js';
import { mountWidget, widgetSlotZ } from '../shared/widget-host.js';
import { applySlideBackground, applySlideContrast, applyWidgetBg } from '../shared/background.js';
import { applyErrorFallback } from '../shared/error-fallback.js';
import { filterVisible } from '../shared/scheduler-core.js';
import { applyTransition } from './transitions.js';
import { primeBuild, revealBuild, normalizeBuild, isLoop, applyLoop } from '../shared/animations.js';
import { enable as enableHud, armToggle as armHudToggle } from './debug-hud.js';
import { resolveSlideWidgets, pickAbVariant } from '../shared/variant-resolver.js';
import { collectUniqueSlots, applyBindingsToWidgets } from '../shared/binding-resolver.js';
import { syncedSlot, slideDurationSec } from '../shared/sync-clock.js';
import { applyBrandKit } from '../shared/brand-kit-apply.js';
import { checkPlaylistShape, isPlaylistShaped } from '../shared/playlist-response.js';
import { reconcileVisible } from '../shared/schedule-reconcile.js';
import { playerText } from './messages.js';
import { jittered, createPoller } from '../shared/poll-schedule.js';
import { createSlideHolder } from './current-slide.js';

const READ_URL = (typeof window !== 'undefined' && window.BB_READ_URL)
  || new URLSearchParams(location.search).get('slot')
  || './sample/presentation.json';

// Display-level prefs are read once at boot. `lang` lets a display select a
// `slide.langs[<lang>]` variant; default = `en`. `?lang=de` overrides for tests.
const DISPLAY_LANG = (typeof window !== 'undefined' && window.BB_DISPLAY_LANG)
  || new URLSearchParams(location.search).get('lang') || 'en';
// Org-level brand-kit can be injected by the publish bundle (window.BB_ORG_BRAND).
const ORG_BRAND_KIT = (typeof window !== 'undefined' && window.BB_ORG_BRAND) || null;

const RELOAD_MS = 6 * 60 * 60 * 1000; // 6h hard reload (jittered — see poll-schedule.js)
const SCHEDULE_MS = 60_000;          // day-parting re-check, on its own clock

const state = {
  playlist: null,
  slides: [],
  defaults: { theme: 'minimal-dark', transition: 'fade' },
  currentIdx: -1,
  visibleIdxList: [],
  slotUrl: READ_URL,
  lastFetch: 0,
  bootAt: performance.now(),
  total: 0,
  visible: 0,
  currentType: null,
  paused: false,
  // True while the "nothing scheduled" banner has already been shown for the
  // current empty stretch — see showNext().
  emptyAnnounced: false,
  // What the diagnostic overlay needs when a screen is showing the wrong
  // thing: is this the cached playlist, how long has fetching been failing,
  // and what did it say. Nobody can open a console on a display.
  lastError: null,
  failCount: 0,
  slotFails: {},
  fromCache: false,
  // Whether the last tick came off the shared clock. Two screens side by side
  // showing different slides is the one fault a technician cannot diagnose by
  // looking: the overlay has to say which clock each of them is on.
  syncActive: false,
  // v3: per-binding slot cache. { [slug]: parsedJsonValue }
  slotData: {},
  // v3: timer handles per unique slot, so we can clear when the binding set changes.
  slotTimers: {},
  // v3: cache of A/B choices per slide.id, so a slide doesn't flicker between
  // variants when re-rendered (only reroll on playlist change).
  abPick: {},
  forceRender: false,
};

const current = createSlideHolder();
let advanceTimer = null;
let lastSerialized = '';
// Tracks the wall-clock start time + planned duration of the current slide,
// so the visibilitychange handler can compute the remaining time and pick up
// where the slide left off instead of advancing on every tab-switch.
let currentSlideStartedAt = 0;
let currentSlideDurationMs = 0;

// The slide host lives inside a "frame" element so we can honour the playlist's
// canvas fit mode. 'fill' (default) → frame fills the viewport (unchanged
// behaviour). 'cover'/'contain' → frame is sized to the design aspect ratio
// (cropped / letterboxed) and centred by #bb-stage. We create the frame if the
// host page didn't ship one, so already-published bundles work without an
// HTML change.
const stageEl = document.getElementById('bb-stage');
let frameEl = document.getElementById('bb-frame');
if (!frameEl && stageEl) {
  frameEl = document.createElement('div');
  frameEl.id = 'bb-frame';
  frameEl.style.cssText = 'position:relative;width:100%;height:100%;';
  stageEl.style.display = 'flex';
  stageEl.style.alignItems = 'center';
  stageEl.style.justifyContent = 'center';
  stageEl.style.overflow = 'hidden';
  stageEl.appendChild(frameEl);
}
const host = frameEl || stageEl;

// Size the frame per the canvas fit mode. 'fill' = adapt to container (no bars).
function applyCanvasFit(canvas) {
  if (!host) return;
  const { w, h, fit } = resolveCanvas(canvas);
  const ratio = w / h;
  const s = host.style;
  if (fit === 'cover') {
    s.width = `max(100vw, calc(100vh * ${ratio}))`;
    s.height = `max(100vh, calc(100vw / ${ratio}))`;
  } else if (fit === 'contain') {
    s.width = `min(100vw, calc(100vh * ${ratio}))`;
    s.height = `min(100vh, calc(100vw / ${ratio}))`;
  } else { // fill — adapt to the container, no bars
    s.width = '100%';
    s.height = '100%';
  }
}

/** @returns {Promise<boolean>} whether a good playlist was received. */
async function fetchPlaylist() {
  try {
    const res = await fetch(READ_URL, { cache: 'no-store' });
    // res.ok first: the API answers in JSON for errors too, so a 404 body like
    // {"detail":"Not Found"} parses perfectly and used to sail straight into the
    // cache and onto the screen. fetchSlotData below has always checked this.
    if (!res.ok) throw new Error(`playlist HTTP ${res.status}`);
    const data = await res.json();
    // …and shape second, because a 200 can carry an error envelope just as well.
    // Nothing that fails this may be cached: overwriting the last good playlist
    // is what turns a passing server error into a display that stays blank
    // through the next reboot.
    const check = checkPlaylistShape(data);
    if (!check.ok) throw new Error(`playlist response rejected — ${check.reason}`);
    state.lastFetch = Date.now();
    state.lastError = null;
    state.failCount = 0;
    state.fromCache = false;
    cachePlaylist(data);
    const serialized = JSON.stringify(data);
    if (serialized === lastSerialized) return true;
    lastSerialized = serialized;
    applyPlaylist(data);
    return true;
  } catch (e) {
    console.warn('playlist fetch failed', e);
    state.lastError = e?.message ?? String(e);
    state.failCount = playlistPoll.fails + 1;
    // Keep showing what we have. Only fall back to the cache when nothing is on
    // screen yet — a running playlist must not be replaced by an older one.
    const cached = loadCachedPlaylist();
    if (cached && !state.playlist && isPlaylistShaped(cached)) applyPlaylist(cached, /* fromCache */ true);
    return false;
  }
}

const playlistPoll = createPoller(fetchPlaylist);

function applyPlaylist(data, fromCache = false) {
  const pl = applyWidgetMigrations(migratePlaylist(data), getPlugin);
  state.playlist = pl;
  applyCanvasFit(pl.canvas);
  state.slides = pl.slides ?? [];
  state.defaults = pl.defaults ?? state.defaults;
  state.total = state.slides.length;
  state.abPick = {}; // reroll A/B variants on playlist change
  rebuildVisible();
  // v3: re-arm slot bindings whenever the playlist changes.
  rebuildSlotPolls();
  // v3: apply the body-level brand-kit cascade (org → playlist) once per load.
  // Slide-level overrides are applied per-slide inside renderSlide.
  applyBrandKit(document.body, resolveBrandKit(ORG_BRAND_KIT, pl.brandKit));
  if (state.currentIdx < 0 || state.currentIdx >= state.visibleIdxList.length) state.currentIdx = -1;
  state.fromCache = fromCache;
  if (fromCache) showBanner('offlineCached');
  state.forceRender = true;
  scheduleNext(0);
}

// v3: tear down outdated slot polls, start new ones for any new slugs.
function rebuildSlotPolls() {
  if (!state.playlist) return;
  const want = new Set(collectUniqueSlots(state.playlist));
  // Stop polls for slots no longer referenced
  for (const slug of Object.keys(state.slotTimers)) {
    if (!want.has(slug)) {
      state.slotTimers[slug].stop();
      delete state.slotTimers[slug];
      delete state.slotData[slug];
      delete state.slotFails[slug];
    }
  }
  // Start polls for new slots. start() fetches immediately, so the first render
  // has data, then arms itself from its own failure count.
  for (const slug of want) {
    if (state.slotTimers[slug]) continue;
    state.slotTimers[slug] = createPoller(async () => {
      const ok = await fetchSlotData(slug);
      state.slotFails[slug] = ok ? 0 : (state.slotFails[slug] ?? 0) + 1;
      return ok;
    });
    state.slotTimers[slug].start();
  }
}

/** @returns {Promise<boolean>} whether a value was stored. */
async function fetchSlotData(slug) {
  try {
    const url = state.playlist?.slotEndpoints?.[slug] || resolveDefaultSlotUrl(slug);
    if (!url) return false;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return false;
    const json = await res.json();
    // Public slot responses sometimes wrap as { slot: { jsonContent: "..." } }
    const body = json?.slot ?? json;
    let value = body;
    if (typeof body?.jsonContent === 'string') {
      try { value = JSON.parse(body.jsonContent); } catch { value = body.jsonContent; }
    }
    state.slotData[slug] = value;
    return true;
  } catch (e) {
    // Network blip — leave the previous value intact, but count it: a slot that
    // has been unreachable for hours looks exactly like fresh data on screen.
    return false;
  }
}

// Resolve a slot URL from its slug. Player runs in a sandboxed iframe (no
// agentView session), so the publish bundle must inject the public read URLs
// alongside the slug. If publish forgot, we attempt the conventional
// agentview.de public URL pattern.
function resolveDefaultSlotUrl(slug) {
  return `https://agentview.de/data/${encodeURIComponent(slug)}/public`;
}

function rebuildVisible() {
  const now = new Date();
  state.visibleIdxList = [];
  state.slides.forEach((s, i) => {
    if (filterVisible([s], now).length === 1) state.visibleIdxList.push(i);
  });
  state.visible = state.visibleIdxList.length;
}

function scheduleNext(delay = 0) {
  clearTimeout(advanceTimer);
  advanceTimer = setTimeout(showNext, delay);
}

async function showNext() {
  if (state.paused) return;
  if (state.visibleIdxList.length === 0) {
    // Let go, don't just tear down: this branch re-arms itself every 30 seconds
    // and never renders again until a slide comes back into its window.
    current.teardown();
    host.replaceChildren();
    // Announce it ONCE. This branch re-runs every 30 seconds, and the banner
    // hides itself after a few — so a shop window whose slides are scheduled
    // 9–18 used to blink the same grey line at the street all night.
    if (!state.emptyAnnounced) { showBanner('noVisible'); state.emptyAnnounced = true; }
    advanceTimer = setTimeout(() => { rebuildVisible(); showNext(); }, 30_000);
    return;
  }
  state.emptyAnnounced = false;
  // v3: when a syncAnchor is present and matches the visible list, math out the
  // current index instead of advancing locally. Falls back to local advance if
  // the anchor mismatches the visible slides (e.g. schedule changed mid-run).
  const slot = syncedSlot(state.playlist?.syncAnchor, state.slides.length);
  const synced = slot?.index ?? null;
  const onSyncedClock = synced != null && state.visibleIdxList.includes(synced);
  state.syncActive = onSyncedClock;
  let nextIdx;
  if (onSyncedClock) {
    nextIdx = state.visibleIdxList.indexOf(synced);
  } else {
    nextIdx = (state.currentIdx + 1) % state.visibleIdxList.length;
  }

  // If there is only one visible slide and we are already displaying it, do not transition or re-render
  // unless a playlist change or similar forces a re-render.
  if (state.visibleIdxList.length === 1 && state.currentIdx === 0 && current.el && !state.forceRender) {
    const slide = state.slides[state.visibleIdxList[0]];
    currentSlideStartedAt = performance.now();
    currentSlideDurationMs = slideDurationSec(slide, state.defaults) * 1000;
    advanceTimer = setTimeout(showNext, currentSlideDurationMs);
    return;
  }

  state.currentIdx = nextIdx;
  const idx = state.visibleIdxList[state.currentIdx];
  const slide = state.slides[idx];
  state.currentType = (slide?.widgets ?? []).map(w => w.type).join('+') || '—';
  await renderSlide(slide);
  state.forceRender = false;
  currentSlideStartedAt = performance.now();
  currentSlideDurationMs = nextTickMs(slide, onSyncedClock, synced);
  advanceTimer = setTimeout(showNext, currentSlideDurationMs);
}

// How long the slide that was just rendered stays up.
//
// On its own, a display waits the slide's duration. On the shared clock it
// waits until the ANCHOR's next boundary instead — the whole point of the
// anchor is that every display flips at the same instant, and a full duration
// counted from this display's own tick keeps it permanently out of phase (two
// screens booted seven seconds apart used to show different slides most of the
// time, each of them convinced it had picked the right index).
//
// The clock is read again AFTER the render: a slow first paint then eats into
// the slot it belongs to instead of pushing the whole wall along with it. If
// the render overran the slot entirely, tick straight away and let the next
// pass put the correct slide up.
const MIN_TICK_MS = 250;
function nextTickMs(slide, onSyncedClock, synced) {
  const own = slideDurationSec(slide, state.defaults) * 1000;
  if (!onSyncedClock) return own;
  const at = syncedSlot(state.playlist?.syncAnchor, state.slides.length);
  if (!at) return own;
  return at.index === synced ? Math.max(MIN_TICK_MS, at.remainingMs) : MIN_TICK_MS;
}

// The day-parting clock. ONE interval, armed once — not a fresh 60-second
// setTimeout per slide change, which is what this used to be: with 10-second
// slides it re-checked six times a minute, with one long slide not for minutes,
// and nothing ever cleared the pending ones. A schedule that says "until 14:00"
// has to be read on its own cadence, not on the playlist's.
setInterval(() => {
  if (!state.playlist) return;
  const before = state.visibleIdxList;
  rebuildVisible();
  const { action, cursor } = reconcileVisible(before, state.visibleIdxList, state.currentIdx);
  if (action === 'none') return;
  if (action === 'reindex') {
    // The set changed but the slide on screen is still scheduled. Re-point the
    // cursor at it — the same number meant a different slide after the list
    // shifted, which is how the player used to repeat or skip one.
    state.currentIdx = cursor;
    return;
  }
  // The slide on screen has left its window. Swap it out now instead of letting
  // it run to the end of its duration.
  state.currentIdx = -1;
  state.forceRender = true;
  scheduleNext(0);
}, SCHEDULE_MS);

async function renderSlide(slide) {
  // teardown() hands back the outgoing element precisely because the holder no
  // longer keeps it: the transition still needs it, nothing else does.
  const oldEl = current.teardown();
  const newEl = document.createElement('div');
  newEl.className = 'bb-slide-host';
  // isolation:isolate → own stacking context so the slide-bg layer (z-index
  // -9999) and any negative-z widget slot paint above this host's backdrop, not
  // behind the player's stage. Mirrors the editor's .avs-stage.
  newEl.style.cssText = 'position:absolute;inset:0;isolation:isolate;';
  const theme = slide.theme ?? state.defaults.theme ?? 'minimal-dark';
  if (theme) newEl.classList.add(`bb-theme-${theme}`);
  host.appendChild(newEl);

  // v3: slide-level brand-kit overrides the body cascade. The cascade was
  // already applied to <body> in applyPlaylist; per-slide overrides re-apply
  // the full cascade on the slide host so they stay scoped.
  if (slide.brandKit) {
    applyBrandKit(newEl, resolveBrandKit(ORG_BRAND_KIT, state.playlist?.brandKit, slide.brandKit));
  }

  // Slide background layer (behind all widgets); falls back to the theme bg.
  // z-index pinned far behind so a widget authored with a negative z (slot
  // z-index = w.z + 1) never lands behind this always-opaque layer. Mirrors the
  // editor's .avs-slide-bg floor so canvas and player stack identically.
  const slideBg = document.createElement('div');
  slideBg.style.cssText = 'position:absolute;inset:0;z-index:-9999;';
  applySlideBackground(slideBg, slide.background);
  applySlideContrast(newEl, slide.background);
  newEl.appendChild(slideBg);

  const disposers = [];
  const builds = []; // entrance builds to play after the slide transition settles
  // v3: variant resolution (lang first, then A/B) → bindings → render. Make the
  // weighted A/B pick ONCE via the shared resolver helper and memoize the index
  // per slide.id, so re-renders keep the same variant (no flicker);
  // resolveSlideWidgets then honours that index as a forced choice.
  let abIdx = state.abPick[slide.id];
  if (abIdx === undefined && Array.isArray(slide.abVariants) && slide.abVariants.length) {
    abIdx = pickAbVariant(slide);
    state.abPick[slide.id] = abIdx;
  }
  const variantWidgets = resolveSlideWidgets(slide, { lang: DISPLAY_LANG, abIdx });
  const resolvedWidgets = applyBindingsToWidgets(variantWidgets, state.slotData);
  const widgets = [...resolvedWidgets].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  for (const w of widgets) {
    const slot = document.createElement('div');
    slot.className = 'bb-widget';
    const r = w.rect ?? { x: 0, y: 0, w: 100, h: 100 };
    slot.style.cssText =
      `position:absolute;left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;` +
      `overflow:hidden;z-index:${widgetSlotZ(w)};` +
      // Container rotation via the standalone `rotate` property so it composes
      // with the build/loop `transform` on this slot instead of clobbering it.
      `${w.rotation ? `rotate:${w.rotation}deg;` : ''}`;
    // bg layer (behind) + content layer (plugin renders here, above).
    // Themed widgets fall back to their theme's --bb-st-bg ("Theme background"
    // option in the editor) when no custom paint is set; themeless widgets stay
    // truly transparent.
    const bgLayer = document.createElement('div');
    bgLayer.style.cssText = 'position:absolute;inset:0;z-index:0;';
    // Theme-aware widget background — shared with the editor's frame builder.
    applyWidgetBg(bgLayer, w);
    const content = document.createElement('div');
    content.style.cssText = 'position:absolute;inset:0;z-index:1;';
    // Ambient loop animates an inner wrapper so e.g. Ken Burns scales the widget
    // visuals without bleeding past the slot (which is overflow:hidden). Builds
    // animate the slot itself, so the two never fight over `transform`.
    let layerHost = slot;
    if (isLoop(w.loop)) {
      const loopWrap = document.createElement('div');
      loopWrap.style.cssText = 'position:absolute;inset:0;';
      applyLoop(loopWrap, w.loop);
      slot.appendChild(loopWrap);
      layerHost = loopWrap;
    }
    layerHost.append(bgLayer, content);
    // Entrance build: prime the slot into its hidden state now, before the slide
    // transition reveals the slide; played once the transition settles (below).
    if (primeBuild(slot, w.anim)) builds.push({ el: slot, anim: normalizeBuild(w.anim) });
    newEl.appendChild(slot);
    // Render via the shared widget-host lifecycle — the exact same code the
    // editor canvas runs in preview mode. onError doubles as the plugin's
    // runtime error hook and the synchronous-throw fallback.
    disposers.push(mountWidget(w, slide, content, {
      mode: 'live',
      onError: () => applyErrorFallback(content, slot, w.onError),
    }));
  }
  current.adopt(newEl, disposers);
  const tx = slide.transition ?? state.defaults.transition ?? 'fade';
  await applyTransition(tx, oldEl, newEl);

  // Play entrance builds once the slide itself has finished transitioning in,
  // each after its own delay. Timers are registered as disposers so a fast
  // advance (or playlist change) cancels any pending reveals cleanly.
  // …but only if this slide is still the one on screen. A schedule change or a
  // playlist update during the transition tears it down, and timers armed after
  // that would fire on a detached element with nothing left to cancel them.
  if (builds.length && current.el === newEl) {
    const timers = builds.map(b => setTimeout(() => revealBuild(b.el), b.anim.delay));
    disposers.push(() => { for (const id of timers) clearTimeout(id); });
  }
}

// One banner element, one timer. Each call used to schedule its OWN removal for
// the shared element, so a second message inside the five seconds was wiped by
// the first message's timer — the newer, more relevant line lived a second.
let bannerTimer = null;
function showBanner(key, ttl = 6000) {
  let b = document.getElementById('bb-banner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'bb-banner';
    // Read from a metre away, not from a debugger: a display is a screen on a
    // wall. Still corner-parked and translucent so it never competes with the
    // content it is reporting on.
    b.style.cssText = 'position:fixed;bottom:16px;right:16px;max-width:min(60vw,520px);'
      + 'background:rgba(0,0,0,.62);color:rgba(255,255,255,.82);padding:8px 14px;'
      + 'font:500 15px/1.35 var(--bb-font,Inter,system-ui,sans-serif);border-radius:8px;'
      + 'backdrop-filter:blur(4px);z-index:9998;';
    document.body.appendChild(b);
  }
  b.textContent = playerText(key, DISPLAY_LANG);
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.remove(), ttl);
}

function cachePlaylist(data) {
  try { localStorage.setItem('avs_player_cache', JSON.stringify(data)); } catch {}
}
function loadCachedPlaylist() {
  try { const v = localStorage.getItem('avs_player_cache'); return v ? JSON.parse(v) : null; } catch { return null; }
}

// Hard reload every 6 h — purges any leaked resources from third-party libs.
// Jittered, because displays provisioned together would otherwise reload in
// unison and hit the server with one synchronised burst every six hours.
setTimeout(() => { location.reload(); }, jittered(RELOAD_MS));

// Pause when hidden — saves CPU on chrome backgrounding.
// On return, resume the current slide for the time it still had left instead
// of jumping straight to the next one. Previously `scheduleNext(0)` advanced
// the slide every time the tab regained focus, which made quick tab-switches
// feel like the player was randomly skipping content.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    state.paused = true;
    clearTimeout(advanceTimer);
    return;
  }
  if (!state.paused) return;
  state.paused = false;
  if (!currentSlideStartedAt) {
    // No slide has started yet — fall back to a normal scheduled show.
    scheduleNext(0);
    return;
  }
  // Compute how much of the slide's duration was already elapsed when the tab
  // went into the background. Wall-clock time keeps ticking while hidden, so
  // `performance.now() - currentSlideStartedAt` is the full elapsed time —
  // including the time the tab was hidden. If the slide's planned duration
  // has already passed, advance after a small grace delay so the user sees a
  // hint of the slide before the transition; otherwise resume with the
  // remaining time.
  const elapsed = performance.now() - currentSlideStartedAt;
  const remaining = Math.max(300, currentSlideDurationMs - elapsed);
  clearTimeout(advanceTimer);
  advanceTimer = setTimeout(showNext, remaining);
});

if (new URLSearchParams(location.search).get('debug') === '1') {
  enableHud(() => state);
}
// …and a way in that does not need the address bar: a published display runs
// one fixed URL in kiosk mode, and the person standing in front of it has a
// remote or a touchscreen. Five taps in the top-left corner, or shift+D.
armHudToggle(() => state);

playlistPoll.start();
