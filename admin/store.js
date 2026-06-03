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

const _state = {
  // Public-facing reactive root. Mutations on any nested path notify the
  // longest matching prefix in `_subs`.
  connection: { status: 'disconnected', apiKey: '', baseUrl: 'https://agentview.de', user: null, plan: null },
  fleet: { displays: [], groups: [], categories: [], orgs: [], activeOrgId: null, running: {} },
  library: { assets: [], quota: null, group: null },
  playlist: null, // set by hydrate or via newPlaylist
  // v3: Verwaltung-View state. Loaded lazily when the view is opened.
  admin: {
    audit: [], auditFilter: { display: '', user: '', action: '', from: '', to: '' },
    webhooks: [],
    pendingApprovals: [], // [{ displayId, displayName, content, submittedAt }]
    grants: {},           // displayId → [{ userId, level }]
    members: [],          // members of activeOrg
    licenseInfo: null,    // { pool, allocated, used }
    storeTemplates: [], storeCategories: [], storeQuery: '',
    versions: [],         // history snapshots for active playlist
    brandKitOrg: null,    // org-level brand-kit (loaded from sidecar slot)
  },
  ui: {
    activeView: 'editor',     // 'editor' | 'displays' | 'admin'
    activeSlideId: null,
    selectedWidgetId: null,   // selected widget on the canvas (null = show Library)
    libraryTab: 'widgets',    // 'widgets' | 'designs' | 'assets' | 'apis' | 'store'
    activePluginType: 'text',
    activeBezel: 'landscape', // 'landscape' | 'portrait'
    themePref: 'dark',        // 'system' | 'dark' | 'light' — editor chrome defaults dark
    paletteOpen: false,
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
    // v3: editor sidebar — A/B + Lang variants editor visible for current slide
    variantEditorOpen: false,
    // v3: which slide-level language being previewed in editor (null = default)
    editorPreviewLang: null,
    // v3: which abVariant index being previewed (null = default)
    editorPreviewAbIdx: null,
  },
  meta: {
    autoSaveAt: 0,
    publishingTo: null,
    eventsSeen: 0,
    appBootAt: Date.now(),
  },
};

const _subs = new Map(); // path-prefix string → Set<fn>
const _history = [];     // [{ snapshot, reason }]
let _historyIdx = -1;
let _suspended = false;

function notify(path) {
  for (const [prefix, fns] of _subs.entries()) {
    if (prefix === '*' || path.startsWith(prefix)) {
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

// Take a JSON snapshot of the parts we want to allow undo on (playlist + ui).
function snapshot() {
  return JSON.stringify({ playlist: _state.playlist, ui: _state.ui });
}
function restore(json) {
  try {
    const s = JSON.parse(json);
    _suspended = true;
    Object.assign(_state.playlist ?? {}, s.playlist ?? {});
    if (s.playlist === null) _state.playlist = null;
    else if (_state.playlist === null) _state.playlist = s.playlist;
    else {
      // replace top-level fields
      for (const k of Object.keys(_state.playlist)) delete _state.playlist[k];
      Object.assign(_state.playlist, s.playlist);
    }
    Object.assign(_state.ui, s.ui ?? {});
    _suspended = false;
    notify('playlist');
    notify('ui');
  } catch (e) {
    _suspended = false;
    console.warn('restore failed', e);
  }
}

let _commitDebounce = null;
export function commit(reason = '') {
  clearTimeout(_commitDebounce);
  _commitDebounce = setTimeout(() => {
    const snap = snapshot();
    if (_history[_historyIdx]?.snapshot === snap) return;
    // truncate redo tail
    _history.splice(_historyIdx + 1);
    _history.push({ snapshot: snap, reason, at: Date.now() });
    if (_history.length > 50) _history.shift();
    _historyIdx = _history.length - 1;
  }, 250);
}

export function undo() {
  if (_historyIdx <= 0) return false;
  _historyIdx -= 1;
  restore(_history[_historyIdx].snapshot);
  return true;
}

export function redo() {
  if (_historyIdx >= _history.length - 1) return false;
  _historyIdx += 1;
  restore(_history[_historyIdx].snapshot);
  return true;
}

export function historySize() { return _history.length; }
export function canUndo() { return _historyIdx > 0; }
export function canRedo() { return _historyIdx < _history.length - 1; }

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

export function persist() {
  try {
    // v3 safety: if a variant edit is in flight, slide.widgets currently holds
    // the VARIANT array (not the default). Serializing as-is would persist the
    // variant where the default belongs, and on reload the actual default
    // would be lost. Temporarily restore default → serialize → re-swap back so
    // the editor keeps editing the variant in-memory.
    const stash = _state.ui._variantStash;
    const slide = stash ? _state.playlist?.slides?.find(s => s.id === stash.slideId) : null;
    let variantArr = null;
    if (stash && slide) {
      // Capture edits back into the variant slot before un-swapping.
      if (stash.kind === 'lang' && slide.langs?.[stash.key]) slide.langs[stash.key].widgets = slide.widgets;
      else if (stash.kind === 'ab' && Array.isArray(slide.abVariants) && slide.abVariants[stash.key]) slide.abVariants[stash.key].widgets = slide.widgets;
      variantArr = slide.widgets;
      slide.widgets = stash.originalWidgets;
    }
    if (_state.playlist) localStorage.setItem(LS_PLAYLIST, JSON.stringify(_state.playlist));
    // Re-swap so the editor continues against the variant array.
    if (stash && slide && variantArr) slide.widgets = variantArr;

    // Strip _variantStash + preview pointers from UI before persist — restored
    // state on reload starts in "default" mode; the original swap would be a
    // dead reference anyway after JSON round-trip.
    const uiClean = { ..._state.ui };
    delete uiClean._variantStash;
    uiClean.editorPreviewLang = null;
    uiClean.editorPreviewAbIdx = null;
    localStorage.setItem(LS_UI, JSON.stringify(uiClean));
  } catch (e) { console.warn('persist failed', e); }
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
  _persistTimer = setTimeout(() => { persist(); _state.meta.autoSaveAt = Date.now(); }, 800);
});
subscribe('ui', () => {
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => persist(), 800);
});
