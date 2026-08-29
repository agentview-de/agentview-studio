// "Provide data offline" — pure helpers shared by the publish flow and tests.
//
// An API/data widget can set content.dataMode = 'stored' ("provided offline"):
// instead of the DISPLAY fetching a live API (needing internet + an API key on
// screen), the Studio fetches the source ahead of time and writes the raw result
// to an agentView data slot. At publish we point a slot BINDING at that slot, so
// the player reads the pre-fetched data via the existing binding/slot-poll path —
// no live call, no key on the display. The key is also stripped from the shipped
// copy. See admin/publish-flow.js (refresh + ship) and shared/plugins/live-json.js
// (the offline render branch via shared/live-source.js).
//
// Pure string/object logic only (no DOM, no network) so it imports under Node for
// tests (test/offline-data.test.js) and in the browser unchanged.

// Field the bound slot value is injected into (the widget reads content._offline).
import { walkAllWidgets } from './slide-schema.js';

export const OFFLINE_FIELD = '_offline';

// Is a widget "provided offline"? Two equivalent conventions exist so each widget
// keeps its native shape: url-only / computed-url widgets (live-json, currency,
// weather) use `dataMode:'stored'`; widgets that already have an inline-vs-url
// `source` select (data-table, chart, kpi-cards) add a third `source:'stored'`.
export const isStored = (content) =>
  content?.dataMode === 'stored' || content?.source === 'stored';

// Options to spread into a widget's liveSource() call so stored mode renders the
// injected slot data and never touches the network; live mode is unaffected.
export const offlineLiveOpts = (content) => ({
  offline: isStored(content),
  offlineData: content?.[OFFLINE_FIELD]?.data,
});

// Shared `source` select options for widgets that offer inline / live / offline
// (data-table, chart, kpi-cards). 'stored' is the offline option (isStored picks
// it up). Widgets without an inline mode (live-json, currency, weather) use a
// dataMode:'live'|'stored' select instead.
export const SOURCE_OPTIONS = [
  { value: 'inline', label: 'Inline (entered here)' },
  { value: 'url', label: 'Live · the display fetches the URL' },
  { value: 'stored', label: 'Offline · Studio pre-fetches, display reads' },
];

// `dataMode` select options for widgets that always fetch (no inline mode):
// live-json, currency, weather.
export const DATAMODE_OPTIONS = [
  { value: 'live', label: 'Live · the display fetches' },
  { value: 'stored', label: 'Offline · Studio pre-fetches, display reads' },
];

// Schema-field factory for the `dataMode` select — spread-free, return it
// straight into a plugin's schema().fields. EVERY always-fetching widget (rss,
// news-photos, live-json, currency, weather) uses this ONE definition so the
// label, options and help wording stay identical everywhere instead of each
// plugin hand-rolling a slightly different explanation of offline mode.
// opts.help overrides the canonical help where a widget genuinely needs more
// specific wording; opts.showIf passes through to the field.
export function dataModeField(opts = {}) {
  const f = {
    key: 'dataMode', type: 'select', label: 'Data source', options: DATAMODE_OPTIONS,
    help: opts.help ?? 'Offline: the Studio fetches the source on “Refresh data” and stores the result; the display reads that — no live fetch, no API key on the screen, works without internet.',
  };
  if (opts.showIf) f.showIf = opts.showIf;
  return f;
}

// Data slot that holds a provided-offline widget's pre-fetched data. Stable per
// widget id so the Studio's refresh (write) and the published binding (read) agree.
export const offlineSlugFor = (w) => 'avs-d-' + (w?.id ?? 'x');

// Secret-ish content fields stripped from the SHIPPED copy of offline widgets —
// in offline mode the key is only used Studio-side at refresh time and must never
// reach the display.
export const STRIP_KEYS = ['apiKey'];

// Every "provided offline" widget in a playlist (drives the refresh-all action).
export function offlineWidgets(pl) {
  const out = [];
  walkAllWidgets(pl, w => { if (isStored(w?.content)) out.push(w); });
  return out;
}

// A deep-cloned SHIPPING copy of the playlist: each provided-offline widget gets a
// binding to its data slot (so the player polls + injects the pre-fetched data) and
// its secret config stripped. Never mutates the original — the editor's working copy
// and version history keep the full config.
export function withOfflineBindings(pl) {
  const clone = JSON.parse(JSON.stringify(pl ?? {}));
  walkAllWidgets(clone, w => {
    if (!isStored(w?.content)) return;
    w.bindings = { ...(w.bindings ?? {}), [OFFLINE_FIELD]: { slot: offlineSlugFor(w) } };
    if (w.content) for (const k of STRIP_KEYS) delete w.content[k];
  });
  return clone;
}
