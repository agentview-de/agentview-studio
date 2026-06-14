// "My widgets" — the user's saved/shareable custom widgets.
//
// Three kinds, all stored as plain JSON (never code) so any of them can be
// exported to a file and shared safely:
//   * preset    — a built-in widget configured a certain way, saved to reuse.
//                 { baseType, content }                → place via addWidget()
//   * custom    — a widget designed in the Widget Designer (baseType 'custom').
//                 same shape as preset; kept as its own kind only for labelling.
//   * composite — several widgets saved together as one unit.
//                 { widgets: [ { type, content, rect, … } ] } → place all
//
// Persistence is localStorage (this is an OSS showcase — no backend needed).
// The PURE helpers (makeEntry / validateEntry / toExportJson / fromImportJson)
// take no I/O so they can be unit-tested headlessly; list/save/remove wrap them
// with storage. DOM file download/upload lives in the admin UI layer, not here,
// to keep this module free of the document.

const LS_KEY = 'avs_custom_widgets';
export const EXPORT_FORMAT = 'avs-custom-widget';
export const EXPORT_VERSION = 1;
export const CUSTOM_KINDS = Object.freeze(['preset', 'custom', 'composite']);

// In-memory fallback for environments without localStorage (Node tests). Kept
// module-local so a test run is deterministic and isolated.
let _memStore = null;
function hasLS() {
  try { return typeof localStorage !== 'undefined' && localStorage != null; } catch { return false; }
}
function readRaw() {
  if (hasLS()) {
    try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : []; }
    catch { return []; }
  }
  return _memStore ?? (_memStore = []);
}
function writeRaw(list) {
  const arr = Array.isArray(list) ? list : [];
  if (hasLS()) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); return; } catch { /* fall through */ }
  }
  _memStore = arr;
}

const rndId = () => 'cw_' + Math.random().toString(36).slice(2, 10);
const nowIso = () => { try { return new Date().toISOString(); } catch { return ''; } };
const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

// Normalize a loose entry into the stored shape. Generates id/createdAt when
// missing; deep-clones payloads so callers can't alias live widget state.
export function makeEntry(input = {}) {
  const kind = CUSTOM_KINDS.includes(input.kind) ? input.kind : 'preset';
  const entry = {
    id: typeof input.id === 'string' && input.id ? input.id : rndId(),
    kind,
    name: String(input.name ?? '').trim() || 'Untitled widget',
    icon: input.icon || (kind === 'composite' ? '🧩' : '🎨'),
    createdAt: input.createdAt || nowIso(),
  };
  if (kind === 'composite') {
    entry.widgets = Array.isArray(input.widgets) ? clone(input.widgets) : [];
  } else {
    entry.baseType = String(input.baseType ?? 'custom');
    entry.content = clone(input.content ?? {});
  }
  return entry;
}

// True if `e` is a structurally valid stored entry. Cheap shape check used on
// load and import so a hand-edited or hostile file can't poison the list.
export function validateEntry(e) {
  if (!e || typeof e !== 'object') return false;
  if (!CUSTOM_KINDS.includes(e.kind)) return false;
  if (typeof e.name !== 'string') return false;
  if (e.kind === 'composite') return Array.isArray(e.widgets);
  return typeof e.baseType === 'string' && e.content != null && typeof e.content === 'object';
}

// Wrap an entry in the file-format envelope used for export.
export function toExportJson(entry) {
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, entry: clone(entry) };
}

// Parse a parsed-JSON object from an imported file back into a valid entry, or
// throw. Accepts both the enveloped shape and a bare entry (forgiving import).
// The returned entry is re-stamped with a fresh id so importing twice doesn't
// collide with an existing saved widget.
export function fromImportJson(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Not a custom-widget file');
  const raw = obj.format === EXPORT_FORMAT ? obj.entry : obj;
  if (!raw || typeof raw !== 'object') throw new Error('Missing widget data');
  // A bare object must at least LOOK like an entry before makeEntry() fills in
  // defaults — otherwise any JSON file would import as an empty preset.
  const looksLikeEntry = CUSTOM_KINDS.includes(raw.kind)
    || raw.baseType != null || raw.content != null
    || raw.template != null || Array.isArray(raw.widgets);
  if (!looksLikeEntry) throw new Error('Not a custom-widget file');
  const entry = makeEntry({ ...raw, id: undefined, createdAt: undefined });
  if (!validateEntry(entry)) throw new Error('Invalid custom-widget data');
  return entry;
}

// ---------------------------------------------------------------------------
// Storage API
// ---------------------------------------------------------------------------

export function list() {
  return readRaw().filter(validateEntry);
}

export function get(id) {
  return list().find(e => e.id === id) ?? null;
}

// Insert or update (by id) and persist. Returns the stored entry.
export function save(input) {
  const entry = makeEntry(input);
  const all = readRaw().filter(validateEntry);
  const idx = all.findIndex(e => e.id === entry.id);
  if (idx >= 0) all[idx] = entry; else all.push(entry);
  writeRaw(all);
  return entry;
}

export function remove(id) {
  const all = readRaw().filter(validateEntry);
  const next = all.filter(e => e.id !== id);
  writeRaw(next);
  return next.length !== all.length;
}

export function clear() { writeRaw([]); }
