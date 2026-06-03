// Editor-only preview of "provided offline" data.
//
// The published player polls each binding slot and injects content._offline into
// the widget itself (player/runtime.js → applyBindingsToWidgets). The editor canvas
// has no slot poller, so a stored widget would otherwise show nothing but its
// "appears after Refresh data" placeholder even once the data exists in the slot.
//
// This in-memory cache lets the canvas preview the same payload the display will
// get: the "Refresh data" action fills it (it already holds the freshly-fetched
// data), and the canvas also lazily reads the slot on first mount so a page reload
// still previews the last stored data. Keyed by widget id.
//
// It is a PREVIEW convenience only: never written into the playlist, never shipped,
// cleared on reload. The shipped copy gets its data via the slot binding instead.

const _cache = new Map(); // widgetId -> { data, fetchedAt }

export const setOfflinePreview = (id, payload) => { if (id) _cache.set(id, payload); };
export const getOfflinePreview = (id) => _cache.get(id);
export const clearOfflinePreview = (id) => { _cache.delete(id); };
