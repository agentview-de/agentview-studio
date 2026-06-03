// Plugin contract shared by admin (form + preview) and player (live render).
// A SlidePlugin is a plain object — no classes, no inheritance.
//
// {
//   type: "weather",                       unique string id
//   label: "Live Weather",                 human-readable, used in tabs + palette
//   group: "live",                         one of: basic, media, live, data, layout
//   icon: "🌦️",                            single emoji or inline SVG string
//   schemaVersion: 1,                      bump on breaking shape change
//   defaults: () => ({...}),               called per-new-slide; never reuse object
//   schema: () => ({ fields: [...] }),     declarative form description
//   render: (slide, container, ctx) => fn  returns a dispose() function
//   migrate?: (content, fromVersion) => content    optional. Run by
//      applyWidgetMigrations on load when widget.contentVersion < schemaVersion.
//      Receives the old content and the version it was stored at; returns the
//      upgraded content. Pure function — no side effects. Bumps that only ADD
//      optional fields don't need a migrator; the loader stamps the version
//      forward on its own.
//   usage?: {                              optional licensing / data-source hint
//     tier: 'business-ok' | 'private-only' | 'byo-key',
//     attribution?: string,                visible credit a provider requires
//     providerTerms?: string,              URL of the provider's terms of use
//     note?: string,                       short ENGLISH note for the UI
//   }
//      Purely advisory metadata about the third-party data/tiles/library a
//      widget depends on. The admin UI can surface a "business-use" marker
//      from `tier` (business-ok = fine to use commercially; private-only =
//      non-commercial / light use; byo-key = bring your own API key for
//      business use). Does NOT affect rendering. Optional — most widgets that
//      hit no external service omit it (stays undefined).
// }
//
// ctx is { mode: 'preview' | 'live', signal: AbortSignal, t: (key)=>string,
//          api?, fetchSlot?, assets? }
//
// Render contract:
//   * MUST attach DOM into `container` (already styled by host)
//   * MUST honor ctx.signal (cleanup on abort)
//   * MUST return a dispose function that stops timers / workers / streams
//   * MUST be idempotent: render -> dispose -> render works
//
// Form schema field shapes:
//   { key, type: 'text'|'textarea'|'number'|'select'|'toggle'|'color'|'url'|
//                'asset'|'date'|'time'|'list'|'markdown'|'code', label,
//     placeholder?, options?, min?, max?, accept?, help? }

export const FIELD_TYPES = Object.freeze([
  'text', 'textarea', 'number', 'select', 'toggle', 'color',
  'url', 'asset', 'date', 'time', 'list', 'markdown', 'code',
  // Rich controls (friendlier than raw values):
  'location',         // { lat, lng, zoom, markers:[{lat,lng,label}] } via map picker + address search
  'datetime',         // { at: <epoch ms>, tz } via native picker + timezone select
  'timezone',         // IANA string via searchable list
  'duration',         // seconds (shown as s / m:ss) instead of raw milliseconds
  'currency',         // ISO 4217 code via searchable picker
  'table',            // array of row objects via column editor + paste-from-spreadsheet
  'feed',             // RSS/Atom URL via curated directory + autodetect from a website
  'feed-list',        // array of feed URLs via multi-pick directory
  'theme',            // visual swatch picker over slide themes
  'place',            // { name, lat, lng } via address search (no map)
  'icon',             // curated SVG symbol via visual picker
  'rich-text',        // HTML string via the WYSIWYG editor (text.js, quote.js)
  'calendar-events',  // array of events with one-time .ics import (calendar.js)
  'section',          // visual section header — does NOT bind to a value; following fields render under it
  'row',              // wraps `children` array in a horizontal flex cluster — also valueless
]);

// Allowed values for an optional plugin.usage.tier (see the contract doc above).
export const USAGE_TIERS = Object.freeze(['business-ok', 'private-only', 'byo-key']);

export function validatePlugin(p) {
  const required = ['type', 'label', 'defaults', 'schema', 'render'];
  for (const k of required) {
    if (!(k in p)) throw new Error(`Plugin ${p.type ?? '<?>'} missing required field: ${k}`);
  }
  if (typeof p.defaults !== 'function') throw new Error(`Plugin ${p.type}.defaults must be a function`);
  if (typeof p.schema !== 'function') throw new Error(`Plugin ${p.type}.schema must be a function`);
  if (typeof p.render !== 'function') throw new Error(`Plugin ${p.type}.render must be a function`);
  // `usage` is optional. When omitted the plugin is unchanged (backward
  // compatible); when present we only sanity-check the tier so a typo surfaces
  // early. Everything else (attribution / providerTerms / note) is free-form
  // and simply passed through on the plugin object.
  if (p.usage != null) {
    if (typeof p.usage !== 'object') throw new Error(`Plugin ${p.type}.usage must be an object`);
    if (p.usage.tier != null && !USAGE_TIERS.includes(p.usage.tier)) {
      throw new Error(`Plugin ${p.type}.usage.tier must be one of ${USAGE_TIERS.join(', ')}`);
    }
  }
  return p;
}

// Helper: create a managed AbortController scoped to a parent signal.
export function childSignal(parent) {
  const ctrl = new AbortController();
  if (parent) {
    if (parent.aborted) ctrl.abort();
    else parent.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return ctrl;
}

// Helper: a dispose function that runs every cleanup once.
export function composeDispose(...fns) {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    for (const fn of fns) { try { fn?.(); } catch (e) { console.warn('dispose error', e); } }
  };
}
