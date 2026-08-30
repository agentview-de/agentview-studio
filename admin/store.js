// Reactive store with JSON-snapshot undo.
//
// Usage:
//   import { state, subscribe, commit, undo, redo, persist, hydrate } from './store.js';
//   state.playlist.slides.push(slide);  // mutations are reactive
//   commit('add-slide');                // mark a snapshot for undo
//   subscribe('playlist', () => render());
//
// Implementation: a single deep-Proxy with path-keyed subscribers. Snapshots
// are JSON-stringified state slices (cheap-but-safe; not perf-critical here).

import { createUndoStack } from '../shared/undo-stack.js';

const _state = {
  // Public-facing reactive root. Mutations on any nested path notify the
  // longest matching prefix in `_subs`.
  connection: { status: 'disconnected', apiKey: '', baseUrl: 'https://agentview.de', user: null, plan: null },
  fleet: { displays: [], groups: [], categories: [], orgs: [], activeOrgId: null, running: {} },
  // `filter` mirrors the asset panel's server-side search/type filter so the
  // rendered controls and the fetched list can never drift apart.
  library: { assets: [], quota: null, group: null, filter: { search: '', type: '' } },
  playlist: null, // set by hydrate or via newPlaylist
  // v3: Verwaltung-View state. The tabs fetch fresh on activation (no data
  // cache), so only genuinely cross-cutting UI-state lives here:
  //   auditFilter — the user's audit filter (survives tab switches)
  //   brandKitOrg — org-level brand-kit, read by the editor's cascade in main.js
  // The former per-tab data caches (audit/webhooks/members/versions/…) were
  // dropped when the tabs moved to fresh-fetch; they are not re-added here.
  admin: {
    auditFilter: { display: '', user: '', action: '', from: '', to: '' },
    brandKitOrg: null,
  },
  ui: {
    activeView: 'editor',     // 'editor' | 'displays' | 'admin'
    activeSlideId: null,
    selectedWidgetId: null,   // selected widget on the canvas (null = show Library)
    libraryTab: 'widgets',    // 'widgets' | 'templates' | 'assets' | 'apis' | 'store'
    themePref: 'dark',        // 'system' | 'dark' | 'light' — editor chrome defaults dark
    // Right column collapsed? Persisted, so a narrow window stays the way you
    // left it — wired in views/editor.js.
    inspectorOpen: true,
    // v3: Verwaltung sub-tab. One of 'approvals' | 'audit' | 'webhooks' | 'apikeys'
    //   | 'members' | 'licenses' | 'connectivity' | 'brandkit' | 'versions'
    adminTab: 'approvals',
    // v3: per-display drawer. null = closed; else displayId of the open drawer.
    displayDrawer: null,
    displayDrawerTab: 'overview', // 'overview' | 'approval' | 'settings' | 'access' | 'diagnostics'
    // v3: bulk-select on Displays dashboard. Array (not Set) so it survives JSON persist.
    selectedDisplays: [],
    displayFilter: { q: '', status: '', group: '', lock: '' },
    // v3: which slide-level language being previewed in editor (null = default)
    editorPreviewLang: null,
    // v3: which abVariant index being previewed (null = default)
    editorPreviewAbIdx: null,
  },
  meta: {
    autoSaveAt: 0,
    // null while saving works; otherwise 'quota' or 'other'. The save chip
    // reads this — see persist().
    saveError: null,
    publishingTo: null,
    // { mode, displayIds, groupId, at } — set by publish-flow, read by the
    // Republish button. It was written and subscribed to without ever being
    // declared here, which made the shape above a half-truth.
    lastPublish: null,
    eventsSeen: 0,
  },
};

const _subs = new Map(); // path-prefix string → Set<fn>
const _history = createUndoStack({ limit: 50 });
let _suspended = false;

// Does path `a` cover path `b`? Same path, or `b` sitting inside `a`. The
// `+ '.'` matters: without it `ui.display` would match `ui.displayFilter`,
// two unrelated fields that merely share a spelling.
const covers = (a, b) => b === a || b.startsWith(a + '.');

// A subscriber hears a change at its own path, BELOW it (a nested field moved)
// and ABOVE it (a whole subtree was replaced).
//
// The last one was missing, and it is the one that matters most: `notify` only
// ever walked downward, so a subscriber on `playlist.brandKit` heard every
// colour edit and MISSED the moment the entire playlist was swapped out. That
// is what opening a playlist from the cloud, importing a file, restoring a
// version and every undo/redo all do — they assign the slice wholesale and
// notify the coarse path. The brand-kit cascade never re-ran: the canvas kept
// the PREVIOUS playlist's colours, and an undone colour stayed on screen.
function notify(path) {
  for (const [prefix, fns] of _subs.entries()) {
    if (prefix === '*' || covers(prefix, path) || covers(path, prefix)) {
      for (const fn of fns) {
        try { fn(path); } catch (e) { console.warn('subscriber error', e); }
      }
    }
  }
}

// Memoise one Proxy per raw object so repeated reads of the same nested path
// return the SAME proxy. Without this, every `state.playlist.slides` read built
// a fresh Proxy: object identity was unstable (cached refs compared with `!==`
// always looked "changed") and hot loops (render/snap over every widget) churned
// allocations. A WeakMap keyed on the raw target lets dead subtrees GC freely.
const _proxyCache = new WeakMap();

function deepProxy(target, basePath = '') {
  const hit = _proxyCache.get(target);
  if (hit) return hit;
  const proxy = new Proxy(target, {
    get(t, k) {
      const v = t[k];
      if (v && typeof v === 'object' && !ArrayBuffer.isView(v)) {
        return deepProxy(v, basePath ? basePath + '.' + String(k) : String(k));
      }
      return v;
    },
    set(t, k, v) {
      const prev = t[k];
      t[k] = v;
      if (!_suspended && prev !== v) {
        const path = basePath ? basePath + '.' + String(k) : String(k);
        notify(path);
      }
      return true;
    },
    deleteProperty(t, k) {
      const had = k in t;
      delete t[k];
      if (!_suspended && had) {
        const path = basePath ? basePath + '.' + String(k) : String(k);
        notify(path);
      }
      return true;
    },
  });
  _proxyCache.set(target, proxy);
  return proxy;
}

export const state = deepProxy(_state);

export function subscribe(pathPrefix, fn) {
  const key = pathPrefix || '*';
  if (!_subs.has(key)) _subs.set(key, new Set());
  _subs.get(key).add(fn);
  return () => _subs.get(key)?.delete(fn);
}

// --- Lightweight app event bus, distinct from state-path subscriptions ---
// For cross-module signals that are NOT state mutations — e.g. an SSE push that
// "a data slot changed on the server". Replaces the old window.__avs_* globals,
// which were an implicit coupling that broke silently if main.js wasn't wired.
const _bus = new Map(); // event name → Set<fn>
export function on(event, fn) {
  if (!_bus.has(event)) _bus.set(event, new Set());
  _bus.get(event).add(fn);
  return () => _bus.get(event)?.delete(fn);
}
export function emit(event, payload) {
  const fns = _bus.get(event);
  if (!fns) return;
  for (const fn of [...fns]) {
    try { fn(payload); } catch (e) { console.warn(`event handler for "${event}" failed`, e); }
  }
}

// Take a JSON snapshot of the parts we want to allow undo on.
//
// The playlist is the document. Out of `ui`, only the keys that say WHAT you
// were editing belong in a snapshot: the whole slice used to ride along, so an
// undo also rewound the chrome — it threw you out of the Displays view, closed
// the drawer you had open, reset the Verwaltung tab and flipped the theme back
// to whatever it happened to be when the snapshot was taken. Undo is for the
// document — plus the bookkeeping that says WHICH document is on screen:
//
//   activeSlideId       the slide you were on (undoing a delete should bring
//                       you back to it, not leave you on its neighbour)
//   editorPreviewLang   which language/A-B variant is being edited, and
//   editorPreviewAbIdx  …
//   _variantStash       …the default widget array that variant-editing swapped
//                       OUT of the slide. It lives nowhere else while a variant
//                       is open, so a snapshot without it cannot be restored:
//                       leaving the editor would write a stale array back over
//                       the slide and overwrite the variant with it.
//
// selectedWidgetId stays out deliberately: main.js clears the selection after
// every undo anyway, because the widget it named may be gone.
const UI_UNDO_KEYS = ['activeSlideId', 'editorPreviewLang', 'editorPreviewAbIdx', '_variantStash'];

function snapshot() {
  const ui = {};
  // `?? null` because JSON.stringify DROPS undefined values, and a key missing
  // from the snapshot would be left untouched on restore instead of cleared.
  for (const k of UI_UNDO_KEYS) ui[k] = _state.ui[k] ?? null;
  return JSON.stringify({ playlist: _state.playlist, ui });
}
function restore(json) {
  try {
    const s = JSON.parse(json);
    _suspended = true;
    if (s.playlist === null) _state.playlist = null;
    else if (_state.playlist === null) _state.playlist = s.playlist;
    else {
      // replace top-level fields
      for (const k of Object.keys(_state.playlist)) delete _state.playlist[k];
      Object.assign(_state.playlist, s.playlist);
    }
    for (const k of UI_UNDO_KEYS) _state.ui[k] = s.ui?.[k] ?? null;
    _suspended = false;
    notify('playlist');
    notify('ui');
  } catch (e) {
    _suspended = false;
    console.warn('restore failed', e);
  }
}

// Commits are debounced so a drag or a burst of typing becomes ONE history
// entry. That is worth keeping — but the pending entry must never outlive the
// action that follows it, which is why undo/redo flush before they move.
const COMMIT_MS = 250;
let _commitDebounce = null;
let _pendingReason = null;

export function commit(reason = '') {
  _pendingReason = reason;
  clearTimeout(_commitDebounce);
  _commitDebounce = setTimeout(flushCommit, COMMIT_MS);
}

/**
 * Record a debounced commit right now. Called before undo/redo and safe to call
 * when nothing is pending. Without it, ctrl+Z inside the debounce window — i.e.
 * exactly what "undo that" looks like — stepped past an edit that had not been
 * recorded yet: one keystroke reverted two actions and lost the newest edit,
 * since redo could not reach a snapshot that was never taken.
 * @returns {boolean} whether an entry was added.
 */
export function flushCommit() {
  clearTimeout(_commitDebounce);
  _commitDebounce = null;
  if (_pendingReason === null) return false;
  const reason = _pendingReason;
  _pendingReason = null;
  return pushHistory(reason);
}

function pushHistory(reason) {
  const added = _history.push(snapshot(), reason, Date.now());
  if (added) emit('history', historyState());
  return added;
}

function historyState() {
  return { canUndo: _history.canUndo(), canRedo: _history.canRedo(), size: _history.size() };
}

/**
 * Drop the history and make the current state its floor — for a document that
 * has just been loaded. Without a baseline, canUndo() (cursor > 0) stayed false
 * until the SECOND commit, so the first edit of a session could not be undone.
 */
export function markBaseline(reason = 'load') {
  clearTimeout(_commitDebounce);
  _commitDebounce = null;
  _pendingReason = null;
  _history.clear();
  pushHistory(reason);
}

export function undo() {
  flushCommit();
  const snap = _history.undo();
  if (snap === null) return false;
  restore(snap);
  emit('history', historyState());
  return true;
}

export function redo() {
  flushCommit();
  const snap = _history.redo();
  if (snap === null) return false;
  restore(snap);
  emit('history', historyState());
  return true;
}

export function historySize() { return _history.size(); }
export function canUndo() { return _history.canUndo(); }
export function canRedo() { return _history.canRedo(); }
/** Reasons oldest→newest, for debugging and a future history panel. */
export function historyReasons() { return _history.reasons(); }

// localStorage persistence — playlist + ui only.
const LS_PLAYLIST = 'bb_studio_playlist';
const LS_UI = 'bb_studio_ui';
const LS_CONN = 'avs_conn';

// Write connection credentials. Called only on explicit connect/disconnect so
// that the auto-save timer cannot race against a manual localStorage clear and
// silently restore a token the user just removed.
export function persistConn() {
  try {
    localStorage.setItem(LS_CONN, JSON.stringify({
      apiKey: _state.connection.apiKey ?? '',
      baseUrl: _state.connection.baseUrl,
    }));
  } catch (e) { console.warn('persistConn failed', e); }
}

/**
 * Run `fn` with the playlist in the shape it should be SAVED in.
 *
 * While a variant edit is in flight, slide.widgets holds the VARIANT array, not
 * the default — so anything that serializes the playlist as-is writes the
 * variant where the default belongs. The variant layer owns that swap: it
 * subscribes to 'before-persist' to flush its edits and restore the default
 * array, and to 'after-persist' to resume editing in memory. The store stays
 * ignorant of variant internals (see admin/canvas/variant-ctx.js).
 *
 * persist() has always used this bracket. Export did not, and that was silent
 * data loss: a backup taken while the English variant was open came out with
 * the English text as the DEFAULT and no copy of the original anywhere in the
 * file. Publishing already guards itself by leaving variant mode outright;
 * everything else that serializes should use this.
 */
export function withSavedShape(fn) {
  emit('before-persist');
  try { return fn(); }
  finally { emit('after-persist'); }
}

/**
 * Write the document to localStorage.
 *
 * This used to swallow every failure into a console.warn, and the auto-save
 * subscriber stamped `meta.autoSaveAt` afterwards WHETHER OR NOT it worked —
 * so the save chip in the header went on saying "Saved" while nothing was
 * being saved. That is the worst shape a data-loss bug can take: the app
 * reassures you. localStorage holds about 5 MB, an image-batch import or a few
 * embedded data-URI pictures go straight through that, and from the first
 * QuotaExceededError on, an hour of work existed only in the tab. Reloading
 * then restored the last GOOD save, which reads as "the app threw my work
 * away" rather than "the app never had it".
 *
 * The previous value survives a failed write, so the document on disk is never
 * corrupted — it is only older than the screen.
 *
 * @returns {boolean} whether the document reached localStorage.
 */
export function persist() {
  try {
    emit('before-persist');
    if (_state.playlist) localStorage.setItem(LS_PLAYLIST, JSON.stringify(_state.playlist));
    // Strip transient edit pointers from the persisted UI — a reload always
    // starts in "default" mode; the in-memory swap would be a dead ref anyway.
    const uiClean = { ..._state.ui };
    delete uiClean._variantStash;
    uiClean.editorPreviewLang = null;
    uiClean.editorPreviewAbIdx = null;
    localStorage.setItem(LS_UI, JSON.stringify(uiClean));
    if (_state.meta.saveError) { _state.meta.saveError = null; emit('save-state', null); }
    return true;
  } catch (e) {
    console.warn('persist failed', e);
    const kind = isQuotaError(e) ? 'quota' : 'other';
    // Emit only on a CHANGE of state: the auto-save debounce fires every 800 ms
    // while someone types, and a toast per keystroke is its own kind of broken.
    if (_state.meta.saveError !== kind) { _state.meta.saveError = kind; emit('save-state', kind); }
    return false;
  } finally { emit('after-persist'); }
}

// Browsers disagree on how a full quota is reported: a DOMException named
// QuotaExceededError, legacy code 22, or Firefox's own name. Anything else is
// a different failure and gets the generic message.
function isQuotaError(e) {
  return e?.name === 'QuotaExceededError'
    || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || e?.code === 22 || e?.code === 1014;
}

export function hydrate() {
  try {
    const pl = localStorage.getItem(LS_PLAYLIST);
    if (pl) _state.playlist = JSON.parse(pl);
    const ui = localStorage.getItem(LS_UI);
    if (ui) Object.assign(_state.ui, JSON.parse(ui));
    const cn = localStorage.getItem(LS_CONN);
    if (cn) {
      const c = JSON.parse(cn);
      if (c.apiKey) _state.connection.apiKey = c.apiKey;
      if (c.baseUrl) _state.connection.baseUrl = c.baseUrl;
    }
  } catch (e) { console.warn('hydrate failed', e); }
}

// Auto-persist on a debounce when playlist or ui change.
let _persistTimer = null;
subscribe('playlist', () => {
  clearTimeout(_persistTimer);
  // Only stamp the clock when the write actually landed — the chip reads it.
  _persistTimer = setTimeout(() => { if (persist()) _state.meta.autoSaveAt = Date.now(); }, 800);
});
subscribe('ui', () => {
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => persist(), 800);
});
