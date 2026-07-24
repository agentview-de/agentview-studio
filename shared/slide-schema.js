// agentView Studio — Playlist / Slide / Widget JSON shape (schema v3).
//
// v3 = v2 + additive modules. The v2 free-canvas model (slide.widgets[] with
// percent rects) is UNCHANGED. v3 only adds optional namespaces that opt-in:
//
// Playlist:
// {
//   schemaVersion: 3,
//   id, name,
//   canvas: { aspect: '16:9' | '9:16' },
//   defaults: { transition: 'fade', theme: 'minimal-dark', duration: 10 },
//   slides: [Slide, ...],
//   metadata: { createdAt, updatedAt },
//
//   brandKit?: BrandKit,            v3 — overrides theme CSS vars (cascade: Org→Playlist→Slide)
//   versionsSlot?: string,          v3 — slug of sidecar history slot (e.g. "{name}-history")
//   syncAnchor?: { epochMs, slideMs[] },  v3 — set by publish-flow for math-based multi-display sync
// }
//
// Slide:
// {
//   id, name?, duration, theme?, transition?, design?, schedule?, widgets[],
//
//   brandKit?: BrandKitOverride,    v3 — per-slide brand override
//   langs?: { [lang]: { widgets[] } },  v3 — language variants; player picks by display.lang
//   abVariants?: [{ weight, widgets[], label? }],  v3 — A/B variants; player picks weighted-random
// }
//
// Widget:
// {
//   id, type, rect, z?, rotation?, title?, content,
//
//   rotation?: number,                   v3 — container rotation in degrees (CSS `rotate`;
//                                              rotates the whole widget box around its centre)
//   bindings?: { [fieldPath]: { slot, jsonPath?, fallback? } },  v3 — slot-bound fields
//   anim?: { type, delay?, duration? },  v3 — entrance build (see shared/animations.js)
//   loop?: string,                       v3 — ambient loop id (float/pulse/kenburns/…)
// }
//
// BrandKit (any level):
// {
//   colors?: { bg?, fg?, accent? },     map to --bb-st-bg, --bb-st-fg, --bb-st-accent
//   font?: string,                       maps to --bb-st-font
//   logo?: { url, position?: 'topLeft'|'topRight'|... },
//   slogan?: string,
// }

export const SCHEMA_VERSION = 3;

// Pure geometry for the 6 built-in designs (percent rects). Owned here because
// migration needs it; designs.js builds the rich, user-facing catalog on top.
export const DESIGN_RECTS = Object.freeze({
  'single':        [{ slot: 'main',   x: 0,  y: 0,  w: 100, h: 100 }],
  'split-50-50':   [{ slot: 'a',      x: 0,  y: 0,  w: 50,  h: 100 },
                    { slot: 'b',      x: 50, y: 0,  w: 50,  h: 100 }],
  'split-70-30':   [{ slot: 'a',      x: 0,  y: 0,  w: 70,  h: 100 },
                    { slot: 'b',      x: 70, y: 0,  w: 30,  h: 100 }],
  'ticker-bottom': [{ slot: 'main',   x: 0,  y: 0,  w: 100, h: 88 },
                    { slot: 'ticker', x: 0,  y: 88, w: 100, h: 12 }],
  'grid-2x2':      [{ slot: 'a',      x: 0,  y: 0,  w: 50,  h: 50 },
                    { slot: 'b',      x: 50, y: 0,  w: 50,  h: 50 },
                    { slot: 'c',      x: 0,  y: 50, w: 50,  h: 50 },
                    { slot: 'd',      x: 50, y: 50, w: 50,  h: 50 }],
  'header-main':   [{ slot: 'header', x: 0,  y: 0,  w: 100, h: 8 },
                    { slot: 'main',   x: 0,  y: 8,  w: 100, h: 92 }],
});

// ---------- Canvas size ----------
// Canvas is stored as explicit pixel dimensions; the aspect ratio is derived
// (w / h). `fit` controls how the player maps the design onto a container whose
// size doesn't match the design:
//   'fill'    — layout adapts to the container, no bars (DEFAULT, = legacy behaviour)
//   'cover'   — scale to fill, crop the overflow (no bars, no distortion)
//   'contain' — letterbox (everything visible, may show bars)
// Widgets are percent-positioned, so the design is resolution-independent; the
// size mainly fixes the editor/design aspect and the natural target for embeds.
export const CANVAS_FIT_MODES = Object.freeze(['fill', 'cover', 'contain']);

export const CANVAS_PRESETS = Object.freeze([
  { id: '16:9', w: 1920, h: 1080 },
  { id: '9:16', w: 1080, h: 1920 },
  { id: '1:1',  w: 1080, h: 1080 },
  { id: '4:3',  w: 1440, h: 1080 },
]);

const DEFAULT_CANVAS = Object.freeze({ w: 1920, h: 1080, fit: 'fill' });

// Normalize any stored/loaded canvas into { w, h, fit }. Accepts the legacy
// { aspect: '16:9' | '9:16' } shape and maps it to pixel dims. Clamps to sane
// bounds so a corrupt value can't make the editor stage or player zero-sized.
export function resolveCanvas(canvas) {
  const c = canvas ?? {};
  let w = +c.w, h = +c.h;
  if (!(w > 0) || !(h > 0)) {
    const preset = CANVAS_PRESETS.find(p => p.id === c.aspect);
    w = preset ? preset.w : DEFAULT_CANVAS.w;
    h = preset ? preset.h : DEFAULT_CANVAS.h;
  }
  w = Math.round(Math.min(8192, Math.max(64, w)));
  h = Math.round(Math.min(8192, Math.max(64, h)));
  const fit = CANVAS_FIT_MODES.includes(c.fit) ? c.fit : 'fill';
  return { w, h, fit };
}

export function canvasRatio(canvas) {
  const { w, h } = resolveCanvas(canvas);
  return w / h;
}

const rnd = () => Math.random().toString(36).slice(2, 10);
export const newSlideId = () => 'slide_' + rnd();
export const newPlaylistId = () => 'pl_' + rnd();
export const newWidgetId = () => 'w_' + rnd();

const FULL_RECT = { x: 0, y: 0, w: 100, h: 100 };

export function normalizeRect(rect) {
  const r = { ...FULL_RECT, ...(rect ?? {}) };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+v) ? +v : 0));
  r.x = clamp(r.x, 0, 100); r.y = clamp(r.y, 0, 100);
  r.w = clamp(r.w, 1, 100); r.h = clamp(r.h, 1, 100);
  if (r.x + r.w > 100) r.w = 100 - r.x;
  if (r.y + r.h > 100) r.h = 100 - r.y;
  return r;
}

export function createWidget(type, partial = {}) {
  return {
    id: partial.id ?? newWidgetId(),
    type,
    rect: normalizeRect(partial.rect),
    z: partial.z ?? 0,
    // Container rotation (degrees). Only persisted when it actually rotates the
    // box, so unrotated widgets stay clean in the JSON (same policy as anim/loop).
    ...(Number.isFinite(+partial.rotation) && +partial.rotation % 360 !== 0 && { rotation: +partial.rotation }),
    ...(partial.title != null && { title: partial.title }),
    ...(partial.background && { background: partial.background }),
    ...(partial.contentVersion != null && { contentVersion: partial.contentVersion }),
    ...(partial.bindings && Object.keys(partial.bindings).length && { bindings: partial.bindings }),
    // v3: optional entrance build + ambient loop (see shared/animations.js).
    // Only persisted when actually set, so widgets without animation stay clean.
    ...(partial.anim && partial.anim.type && partial.anim.type !== 'none' && { anim: partial.anim }),
    ...(partial.loop && partial.loop !== 'none' && { loop: partial.loop }),
    content: partial.content ?? {},
  };
}

export function createSlide(partial = {}) {
  return {
    id: partial.id ?? newSlideId(),
    ...(partial.name != null && { name: partial.name }),
    duration: partial.duration ?? 10,
    ...(partial.theme && { theme: partial.theme }),
    ...(partial.transition && { transition: partial.transition }),
    ...(partial.design && { design: partial.design }),
    ...(partial.schedule && { schedule: partial.schedule }),
    ...(partial.background && { background: partial.background }),
    ...(partial.brandKit && { brandKit: partial.brandKit }),
    ...(partial.langs && Object.keys(partial.langs).length && { langs: partial.langs }),
    ...(partial.abVariants?.length && { abVariants: partial.abVariants }),
    widgets: partial.widgets ?? [],
  };
}

// Convenience factory: a Slide holding ONE full-bleed Widget of `type`. This is
// the shape file importers and smart-split produce — a single piece of content
// filling the slide. It lives here beside createSlide/createWidget because it is
// pure Slide construction, and callers use it INSTEAD of the v1-era
// `createSlide(type, { content })` form: createSlide is single-arg, so a
// type-first call silently dropped the props and yielded an empty { widgets: [] }
// slide. `opts.title` becomes the Slide's rail name (not a widget heading, so it
// never paints an <h1> over media). `opts.duration` falls back to createSlide's
// default when omitted.
export function createSlideWithWidget(type, content = {}, opts = {}) {
  const { title = '', duration, rect } = opts;
  return createSlide({
    ...(title && { name: title }),
    duration,
    widgets: [createWidget(type, {
      rect: rect ?? { x: 0, y: 0, w: 100, h: 100 },
      content: content ?? {},
    })],
  });
}

export function createPlaylist(name = 'My Playlist') {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newPlaylistId(),
    name,
    canvas: { w: 1920, h: 1080, fit: 'fill' },
    defaults: { transition: 'fade', theme: 'minimal-dark', duration: 10 },
    slides: [],
    metadata: { createdAt: now, updatedAt: now },
  };
}

// ---------- v3 helpers ----------

// Empty brand-kit shape used by editors. Returns a fresh object every call
// so callers can mutate without aliasing.
export function emptyBrandKit() {
  return { colors: {}, font: '', logo: null, slogan: '' };
}

// Merge brand-kit layers: org → playlist → slide. Later layers override earlier
// non-empty values. Empty strings and null are treated as "not set".
export function resolveBrandKit(...layers) {
  const out = emptyBrandKit();
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    if (layer.colors) for (const k of ['bg', 'fg', 'accent']) {
      if (layer.colors[k]) out.colors[k] = layer.colors[k];
    }
    if (layer.font) out.font = layer.font;
    if (layer.logo) out.logo = layer.logo;
    if (layer.slogan) out.slogan = layer.slogan;
  }
  return out;
}

// Build the pseudo-"slide" object a plugin's render(slide, …) expects, from a
// widget. Plugins read .content / .title / .duration — this keeps all 26
// unchanged while they now live inside positioned widgets.
export function widgetAsSlide(widget, slide) {
  return {
    id: widget.id,
    type: widget.type,
    title: widget.title ?? '',
    duration: slide?.duration ?? 10,
    content: widget.content ?? {},
  };
}

export function validateWidget(w) {
  if (!w || typeof w !== 'object') return false;
  if (typeof w.type !== 'string') return false;
  if (!w.content || typeof w.content !== 'object') return false;
  return true;
}

export function validateSlide(s) {
  if (!s || typeof s !== 'object') return false;
  if (typeof s.id !== 'string') return false;
  if (!Array.isArray(s.widgets)) return false;
  if (typeof s.duration !== 'number' || s.duration < 1) return false;
  return true;
}

// ---------- Per-widget content migration ----------
// Walks every widget in the playlist and upgrades content whose stored
// `contentVersion` is older than the plugin's current `schemaVersion`. Each
// plugin opts in by exporting a `migrate(content, fromVersion) → content`
// hook; plugins without one are assumed to be additive-only and the version
// is just stamped forward.
//
// `getPlugin(type)` is passed in (not imported) so this module stays free of
// the plugin registry — keeps the schema layer test-isolated.
//
// Mutates the playlist in place and returns it. Safe to call on a freshly-
// migrated v2 playlist; widgets already at the latest version are no-ops.
export function applyWidgetMigrations(pl, getPlugin) {
  if (!pl || !Array.isArray(pl.slides)) return pl;
  for (const slide of pl.slides) {
    liftLegacyIconRotation(slide);
    if (!Array.isArray(slide.widgets)) continue;
    for (const w of slide.widgets) {
      const plugin = getPlugin?.(w.type);
      if (!plugin) continue;
      // Unstamped legacy widgets are treated as v1; stamp only when missing,
      // never downgrade an existing higher stamp (could be a forward-dated
      // playlist from a newer Studio build).
      const stamped = Number.isInteger(w.contentVersion);
      const from = stamped ? w.contentVersion : 1;
      const target = Number.isInteger(plugin.schemaVersion) ? plugin.schemaVersion : 1;
      if (from >= target) {
        if (!stamped) w.contentVersion = target;
        continue;
      }
      if (typeof plugin.migrate === 'function') {
        try {
          const next = plugin.migrate(w.content ?? {}, from);
          if (next && typeof next === 'object') w.content = next;
        } catch (e) {
          // A broken migrator must not kill the playlist load. Leave content
          // as-is, log loudly, keep the old stamp so the next load tries again.
          console.error(`[migrate] plugin "${w.type}" v${from}→v${target} threw:`, e);
          continue;
        }
      }
      w.contentVersion = target;
    }
  }
  return pl;
}

// One-time compat: the icon widget dropped its own `content.rotation` in favour
// of the general container rotation. Lift any legacy value onto widget.rotation
// — across the default widgets AND lang/AB variant arrays — so already-rotated
// icons keep their angle. Idempotent: once lifted, content.rotation is gone.
function liftLegacyIconRotation(slide) {
  if (!slide || typeof slide !== 'object') return;
  const arrays = [slide.widgets];
  if (slide.langs) for (const v of Object.values(slide.langs)) arrays.push(v?.widgets);
  if (Array.isArray(slide.abVariants)) for (const v of slide.abVariants) arrays.push(v?.widgets);
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const w of arr) {
      if (w?.type !== 'icon' || !w.content || w.content.rotation == null) continue;
      const total = (w.rotation ?? 0) + (+w.content.rotation || 0);
      if (total % 360 !== 0) w.rotation = total; else delete w.rotation;
      delete w.content.rotation;
    }
  }
}

// ---------- Migration v1 → v2 → v3 ----------
// v1 slide: { id, type, title, duration, content, layout?, zones?[{slot, slideId|slide}], theme?, transition?, schedule? }
// v1 zone-layout slides reference OTHER slides by slideId; those become widgets
// and are removed from the top-level slide list.
// v3 adds optional namespaces (brandKit, versionsSlot, syncAnchor, slide.langs,
// slide.abVariants, widget.bindings) — no required fields, so v2→v3 is a stamp
// bump with no data transformation.

export function migratePlaylist(pl) {
  if (!pl || typeof pl !== 'object') return createPlaylist();
  if (Array.isArray(pl)) pl = { slides: pl };

  // Already at target — but stamp v2 forward to v3 so callers see consistent
  // schemaVersion. No structural changes are required between v2 and v3.
  if (pl.schemaVersion >= SCHEMA_VERSION && Array.isArray(pl.slides)) {
    pl.schemaVersion = SCHEMA_VERSION;
    if (pl.canvas) pl.canvas = resolveCanvas(pl.canvas);
    return pl;
  }
  if (pl.schemaVersion === 2 && Array.isArray(pl.slides)) {
    pl.schemaVersion = SCHEMA_VERSION;
    if (pl.canvas) pl.canvas = resolveCanvas(pl.canvas);
    return pl;
  }

  const v1slides = Array.isArray(pl.slides) ? pl.slides : [];
  const byId = new Map(v1slides.map(s => [s.id, s]));

  // Slide-ids that are referenced as zone children (don't list them twice).
  const referenced = new Set();
  for (const s of v1slides) {
    if (s.layout && s.layout !== 'single' && Array.isArray(s.zones)) {
      for (const z of s.zones) if (z.slideId) referenced.add(z.slideId);
    }
  }

  const out = createPlaylist(pl.name ?? 'Imported Playlist');
  out.id = pl.id ?? out.id;
  out.defaults = {
    transition: pl.defaultTransition ?? 'fade',
    theme: pl.defaultTheme ?? 'minimal-dark',
    duration: 10,
  };
  out.metadata = pl.metadata ?? out.metadata;

  for (const s of v1slides) {
    const isLayout = s.layout && s.layout !== 'single';
    if (referenced.has(s.id) && !isLayout) continue;
    out.slides.push(migrateSlide(s, byId));
  }
  return out;
}

export function migrateSlide(s, byId = new Map()) {
  // Already v2?
  if (Array.isArray(s?.widgets)) return s;

  const base = createSlide({
    id: s.id,
    name: s.title || undefined,
    duration: s.duration ?? 10,
    theme: s.theme,
    transition: s.transition,
    schedule: s.schedule,
  });

  const layout = s.layout && s.layout !== 'single' ? s.layout : null;
  if (!layout) {
    base.widgets = [createWidget(s.type ?? 'text', {
      rect: { x: 0, y: 0, w: 100, h: 100 },
      content: s.content ?? {},
      title: s.title,
      z: 0,
    })];
    return base;
  }

  base.design = layout;
  const rects = DESIGN_RECTS[layout] ?? DESIGN_RECTS['single'];
  const zones = Array.isArray(s.zones) ? s.zones : [];
  base.widgets = zones.map((z, i) => {
    const child = z.slide ?? (z.slideId ? byId.get(z.slideId) : null);
    const r = rects.find(x => x.slot === z.slot) ?? rects[i] ?? rects[0];
    return createWidget(child?.type ?? 'text', {
      rect: { x: r.x, y: r.y, w: r.w, h: r.h },
      content: child?.content ?? {},
      title: child?.title,
      z: 0,
    });
  });
  return base;
}
