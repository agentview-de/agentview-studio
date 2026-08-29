// agentView REST API client.
//
// The local CORS proxy in server.mjs mirrors /api/* and /data/* to agentview.de.
// When running through it we keep relative URLs; otherwise we hit baseUrl
// directly (browser may block CORS unless the API allows your origin).

import { state } from './store.js';
import { toast } from './ui/toast.js';
import { t, getLocale } from './i18n.js';
import { authHeader, resolveUrl, storeQuery, nextStoreOffset } from './api-url.js';

// The server rejects admin/owner calls made with a non-admin token (a session
// the user approved without admin rights, or a content_only API key) with a
// 403 whose message mentions the missing 'admin' scope. Warn the user once per
// connection instead of letting each background call fail silently. connect()
// re-arms this via resetScopeWarning() so a fresh login surfaces it again.
let _scopeWarned = false;
export function resetScopeWarning() { _scopeWarned = false; }

// Header + URL decisions live in api-url.js (pure, unit-tested); here we just
// feed them the live connection + location.
function baseHeaders() {
  return { Accept: 'application/json', ...authHeader(state.connection.apiKey) };
}

function buildUrl(path) {
  return resolveUrl(path, { host: location.host, baseUrl: state.connection.baseUrl });
}

async function request(method, path, body, opts = {}) {
  const headers = { ...baseHeaders(), ...(opts.headers ?? {}) };
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(buildUrl(path), { method, headers, body: payload, signal: opts.signal });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(data?.error?.message ?? data?.message ?? `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = data;
    if (res.status === 403 && /scope/i.test(err.message)) {
      err.code = 'admin_scope_required';
      if (!_scopeWarned) {
        _scopeWarned = true;
        toast(t('conn.adminScopeMissing'), { kind: 'error', ttl: 9000 });
      }
    }
    throw err;
  }
  return data;
}

// duration is an int32 in [1, 86400]; return it as a spreadable fragment only
// when valid, so absent/invalid values are omitted (not sent null). 2.1.120
// additionally documents 0 and null as "indefinite", but omitting means the
// same thing and stays compatible with the stricter older validator.
function validDuration(d) {
  const n = Number(d);
  return Number.isInteger(n) && n >= 1 && n <= 86400 ? { duration: n } : {};
}

// The privacy enum travels as 'Private' | 'Public' but is read back from list
// payloads in whatever casing the server chose; keep both directions in one
// place so a select can compare with privacyModeOf() and send the raw value.
function normalisePrivacyMode(mode) {
  const m = String(mode ?? '').toLowerCase();
  return m === 'public' ? 'Public' : m === 'private' ? 'Private' : mode;
}
export function privacyModeOf(display) {
  return String(display?.privacyMode ?? '').toLowerCase();
}

// ---------- Auth ----------
export const auth = {
  me: () => request('GET', '/api/v1/agent/me'),
  sessionRequest: (agentIdentifier = 'agentView Studio') =>
    request('POST', '/api/v1/agent/session/request', { agentIdentifier, scope: 'admin' }),
  sessionStatus: (id) =>
    request('GET', `/api/v1/agent/session/status?id=${encodeURIComponent(id)}`),
  apiKeyList: () => request('GET', '/api/v1/agent/api-keys'),
  // 2.1.x keys take far more than name+scope, and every extra narrows the
  // key — it can never widen it:
  //   expiresInDays  — omitted means the key never expires
  //   permissions    — 'read' | 'write' | 'read_write' (default), matched
  //                    against the HTTP verb on top of `scope`
  //   capabilities   — 'slot.read' | 'slot.write' | 'display.read' |
  //                    'display.send' | 'display.manage' (max: all of them)
  //   allowedDisplayIds / allowedSlotSlugs — pin the key to ≤64 displays/slugs
  // The server treats an empty array the same as an absent one ("no
  // restriction"), so we omit empties instead of sending [] — the request then
  // says exactly what it means.
  apiKeyCreate: ({ name, scope, expiresInDays, permissions, capabilities, allowedDisplayIds, allowedSlotSlugs, orgId } = {}) =>
    request('POST', '/api/v1/agent/api-keys', {
      name, scope,
      ...(Number.isInteger(expiresInDays) && expiresInDays > 0 ? { expiresInDays } : {}),
      ...(permissions ? { permissions } : {}),
      ...(capabilities?.length ? { capabilities } : {}),
      ...(allowedDisplayIds?.length ? { allowedDisplayIds } : {}),
      ...(allowedSlotSlugs?.length ? { allowedSlotSlugs } : {}),
      ...(orgId ? { orgId } : {}),
    }),
  apiKeyRevoke: (id) => request('DELETE', `/api/v1/agent/api-keys/${encodeURIComponent(id)}`),
  licenseInfo: () => request('GET', '/api/v1/agent/license-info'),
  // Current session introspection (token claims, scope, expiry) — new in the
  // 2.1.x API (listed on /agent-instructions).
  sessionInfo: () => request('GET', '/api/v1/agent/session/info'),
  // Personal billing-portal link for the connected account — pairs with the
  // /agent/pricing plan comparison.
  billingUrl: () => request('GET', '/api/v1/agent/billing-url'),
  rotateApprovalSecret: () => request('POST', '/api/v1/agent/account/approval-secret/rotate'),
  // Exchange a one-time dashboard handoff code for a fresh, scoped API key so
  // a user arriving from the agentView dashboard lands already connected.
  redeemHandoff: (code) => request('POST', '/api/v1/studio/handoff/redeem', { code }),
};

// Lifetime for the signed preview links Studio mints. Every call site opens
// the link right away, so the server's 1-hour default only widens the window
// in which a leaked URL still renders the display; 15 minutes is plenty for a
// look. The server clamps ttlSeconds to [60, 86400].
export const PREVIEW_LINK_TTL_S = 900;

// ---------- Displays ----------
export const displays = {
  list: () => request('GET', '/api/v1/agent/displays'),
  get: (id) => request('GET', `/api/v1/agent/displays/${id}`),
  create: (body) => request('POST', '/api/v1/agent/displays', body),
  patch: (id, body) => request('PATCH', `/api/v1/agent/displays/${id}`, body),
  remove: (id) => request('DELETE', `/api/v1/agent/displays/${id}`),
  // { code, profileName?, targetDisplayId? } — targetDisplayId (2.1.x) moves
  // an EXISTING display profile onto the freshly paired hardware instead of
  // creating a new one, so content, groups and licence stay attached.
  pairByCode: (body) => request('POST', '/api/v1/agent/displays/pair-by-code', body),
  capabilities: (id) => request('GET', `/api/v1/agent/displays/${id}/capabilities`),
  // One body for every display setting (camelCased from the configure_display
  // MCP tool): name, locked, privacyMode, origins, allowCamera/-Microphone/
  // -Geolocation, preferredLanguage, showMouseCursor, showBadgeOverlay,
  // watermarkPosition, plus the per-display network policy
  // (connectivityMode / whitelist / strictWhitelist) that used to be org-only.
  configure: (id, body) => request('POST', `/api/v1/agent/displays/${id}/configure`, body),
  lock: (id) => request('POST', `/api/v1/agent/displays/${id}/lock`),
  unlock: (id) => request('POST', `/api/v1/agent/displays/${id}/unlock`),
  // The server enum is PascalCase ('Private' | 'Public') — per the
  // configure_display MCP schema — while the Studio's selects speak lowercase.
  // Normalise on the way out so a lowercase value can't be rejected; read the
  // value back case-insensitively (see privacyModeOf below).
  setPrivacyMode: (id, mode) =>
    request('PATCH', `/api/v1/agent/displays/${id}/privacy-mode`, { privacyMode: normalisePrivacyMode(mode) }),
  setEmbeddableOrigins: (id, origins) =>
    request('PATCH', `/api/v1/agent/displays/${id}/embeddable-origins`, { origins }),
  // ttlSeconds (2.1.x) shortens the signed link's lifetime — pass one for
  // anything shared outside the room. Omitted → the server default.
  previewLink: (id, ttlSeconds) =>
    request('POST', `/api/v1/agent/displays/${id}/preview-link`,
      Number.isInteger(ttlSeconds) && ttlSeconds > 0 ? { ttlSeconds } : undefined),
  rotateManagedSecret: (id) =>
    request('POST', `/api/v1/agent/displays/${id}/managed-secret/rotate`),
  revokeManagedSecret: (id) =>
    request('POST', `/api/v1/agent/displays/${id}/managed-secret/revoke`),
  rotateRecoverySecret: (id) =>
    request('POST', `/api/v1/agent/displays/${id}/recovery-secret/rotate`),
  // contentDescription is what GET .../content echoes back as currentContentDescription.
  // duration is a non-nullable int (1..86400) and the body is additionalProperties:false,
  // so it must be omitted when absent — sending `duration: null` is rejected with 400.
  sendContent: (id, html, opts = {}) =>
    request('POST', `/api/v1/agent/displays/${id}/content`,
      { html, description: opts.description ?? 'agentView Studio',
        contentDescription: opts.description ?? 'agentView Studio', ...validDuration(opts.duration) }),
  setDefault: (id, html) =>
    request('POST', `/api/v1/agent/displays/${id}/default`,
      { html, contentDescription: 'agentView Studio idle' }),
  clear: (id) => request('POST', `/api/v1/agent/displays/${id}/clear`),
  broadcast: (body) => request('POST', '/api/v1/agent/displays/broadcast', body),
  // Server-side category broadcast (2.1.x): sends to every display in the
  // given categories in ONE call — no client-side membership resolution, no
  // stale-member race; locked displays are skipped with reason='locked'.
  // Body mirrors the MCP broadcast_content tool's category mode (camelCased;
  // that tool absorbed the former broadcast_to_categories in 2.1.x):
  // { includeCategoryIds, html, description?, includeDescendants?, dryRun? }.
  broadcastByCategory: (categoryIds, html, opts = {}) =>
    request('POST', '/api/v1/owner/displays/broadcast-by-category', {
      includeCategoryIds: Array.isArray(categoryIds) ? categoryIds : [categoryIds],
      html,
      description: opts.description ?? 'agentView Studio',
      ...(opts.includeDescendants != null ? { includeDescendants: opts.includeDescendants } : {}),
      ...(opts.dryRun ? { dryRun: true } : {}),
    }),
  // Which content is currently running → { currentContentDescription, … }
  contentState: (id) => request('GET', `/api/v1/agent/displays/${id}/content`),
  // Raw rendered HTML currently on the display (live or idle). Server replaces
  // a template's {{slot:…}} with real read URLs before serving, so this is the
  // source for the "Inhalte" tab's preview + slot discovery.
  // The documented query key is snake_case (`content_type`, matching the
  // read_display_html MCP tool); Studio used to send only camelCase, which the
  // server ignores — so ?contentType=idle silently returned the LIVE document.
  // Both spellings go out: the unknown one is dropped, whichever it is.
  readHtml: (id, type = 'live') => {
    const qs = type ? `?content_type=${encodeURIComponent(type)}&contentType=${encodeURIComponent(type)}` : '';
    return request('GET', `/api/v1/agent/displays/${id}/html${qs}`);
  },
  // Pre-publish dry-run validation (1 MB limit) — returns warnings, never ships.
  // description is required by the test_display_content MCP tool and shown in
  // the documented curl example, so send one rather than rely on it staying
  // optional on the REST side.
  testContent: (html, description = 'agentView Studio check') =>
    request('POST', '/api/v1/agent/displays/test/content', { html, description }),
  // Load a plain URL in the display's iframe (alternative to HTML content).
  // duration applies to the url call too (documented alongside content and
  // broadcast); same [1, 86400] guard, omitted = stays until replaced.
  sendUrl: (id, url, opts = {}) =>
    request('POST', `/api/v1/agent/displays/${id}/url`,
      { url, description: opts.description ?? 'agentView Studio URL',
        contentDescription: opts.description ?? 'agentView Studio URL', ...validDuration(opts.duration) }),
  // Adopt an unconfigured display. claim_display (MCP) requires a
  // profile_name; the REST body historically took none, and we cannot tell
  // which the deployed server wants without an account — so send the name when
  // we have one and retry bare on a 400. Either server shape works.
  claim: async (id, profileName) => {
    const path = `/api/v1/agent/displays/${id}/claim`;
    if (!profileName) return request('POST', path);
    try { return await request('POST', path, { profileName }); }
    catch (e) { if (e.status !== 400) throw e; return request('POST', path); }
  },
  getSourceLock: (id) => request('GET', `/api/v1/owner/displays/${id}/source-lock`),
  setSourceLock: (id, apiKeyId) => request('PUT', `/api/v1/owner/displays/${id}/source-lock`, { apiKeyId }),
};

// ---------- Groups (native agentView display-categories) ----------
// Verified live: an agent `avk_` key IS authorised on the owner-scoped category
// routes (they're merely absent from the agent OpenAPI spec). So "Groups" map to
// real display-categories — server-side, persistent, visible in the owner portal.
// Category membership is NOT on the display object; read it via the agent
// displays filter (?categoryId=…). Category id field is `categoryId`.
/**
 * The identifier the display-category endpoints take.
 *
 * Every write in `groups` below addresses a category by `categoryId` —
 * `/display-categories/{categoryId}`, `?categoryId=…`, `{ categoryIds }` — so
 * that is what "the id of a group" means in this app. The UI resolved it four
 * times in three different ways, and two of them preferred `id`:
 *
 *   displays.js  membersOf(c.categoryId ?? c.id)   // read membership
 *   displays.js  groupId = g => g.id ?? g.categoryId
 *   displays.js  cid = c.id ?? c.categoryId
 *   publish-flow.js  <option value="${g.id ?? g.categoryId}">
 *
 * As long as a payload carries only one of the two names, all four agree. The
 * moment it carries both — a row id AND the category id, which REST APIs do —
 * membership is read under one key while publishing, patching, deleting and
 * assigning go to the other. One helper, one precedence, matching the endpoint.
 *
 * Accepts a category object or a bare id string (a display's `categoryIds`
 * entries are sometimes one, sometimes the other).
 */
export function categoryIdOf(group) {
  if (typeof group === 'string') return group;
  return group?.categoryId ?? group?.id ?? '';
}

export const groups = {
  list: () => request('GET', '/api/v1/owner/display-categories'),
  create: (body) => request('POST', '/api/v1/owner/display-categories', body), // { name, parentCategoryId? }
  patch: (categoryId, body) =>
    request('PATCH', `/api/v1/owner/display-categories/${encodeURIComponent(categoryId)}`, body),
  remove: (categoryId) =>
    request('DELETE', `/api/v1/owner/display-categories/${encodeURIComponent(categoryId)}`),
  // Replace the COMPLETE category membership for one display.
  setForDisplay: (profileId, categoryIds) =>
    request('PUT', `/api/v1/owner/displays/${encodeURIComponent(profileId)}/categories`, { categoryIds }),
  // Resolve the displays in a category (membership lives behind this filter).
  membersOf: (categoryId) =>
    request('GET', `/api/v1/agent/displays?categoryId=${encodeURIComponent(categoryId)}`),
  // Bulk add/remove ONE category across many displays (2.1.x). Owner-scoped:
  // touches only the caller's assignment rows. mode: 'add' | 'remove'.
  // The MCP counterpart (assign_display_categories) also models a 'replace'
  // mode over category_ids[]; on REST that is setForDisplay() above, so the
  // singular categoryId body stays the right shape here.
  bulkAssign: (categoryId, displayIds, mode = 'add') =>
    request('POST', '/api/v1/owner/display-categories/bulk-assign',
      { categoryId, displayIds, mode }),
};

// ---------- Assets ----------
// The asset list endpoint pages like the store catalog does; this is the page
// size the panel asks for. listAll() below walks past it.
const ASSET_PAGE = 200;

export const assets = {
  // 2.1.x filters server-side: type ('image' | 'video' | 'audio' | 'document'
  // | 'font'), search (name/description), plus limit/offset paging. Called
  // bare it behaves exactly as before.
  list: (opts = {}) => {
    const qs = new URLSearchParams();
    if (opts.search) qs.set('search', opts.search);
    if (opts.type) qs.set('type', opts.type);
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.offset) qs.set('offset', String(opts.offset));
    const q = qs.toString();
    return request('GET', '/api/v1/assets' + (q ? '?' + q : ''));
  },
  // Walk every page. The panel used to ask for the server's maximum page size
  // and call the result complete — which it is, right up to the customer whose
  // library holds one asset more than a page. Then the grid quietly shows a
  // prefix and nothing says so. Same shape as storeTemplates.searchAll(): the
  // envelope the caller already knows, with everything in it.
  listAll: async (opts = {}) => {
    const limit = opts.limit ?? ASSET_PAGE;
    const out = [];
    let offset = 0, total = null;
    for (let page = 0; page < 25; page++) {
      const r = await assets.list({ ...opts, limit, offset });
      const batch = Array.isArray(r) ? r : (r?.assets ?? r?.items ?? r?.data ?? []);
      out.push(...batch);
      if (Number.isFinite(r?.total)) total = r.total;
      const next = nextStoreOffset({ offset, limit, returned: batch.length, total });
      if (next == null) break;
      offset = next;
    }
    return { assets: out, total: total ?? out.length };
  },
  // Multipart upload: 1-20 files under field "files" + a REQUIRED "descriptions"
  // field (JSON array indexed by file order). The descriptions requirement is
  // undocumented in the spec — discovered from the 400 error body.
  upload: async (fileOrFiles, descriptions) => {
    const fd = new FormData();
    const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
    for (const f of files) fd.append('files', f, f.name);
    fd.append('descriptions', JSON.stringify(descriptions ?? files.map(f => f.name)));
    return request('POST', '/api/v1/assets', fd);
  },
  patch: (id, body) => request('PATCH', `/api/v1/assets/${id}`, body),
  // delete_asset (MCP) takes asset_ids[]; REST has had one DELETE per id. One
  // id → the classic call. Several → try a collection DELETE and fall back to
  // sequential deletes when the server does not know that shape (400/404/405).
  // The fallback tolerates a 404 per id so a partially-applied bulk attempt
  // cannot strand the rest.
  remove: async (idOrIds) => {
    const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).filter(Boolean);
    if (ids.length <= 1) return request('DELETE', `/api/v1/assets/${encodeURIComponent(ids[0] ?? '')}`);
    try { return await request('DELETE', '/api/v1/assets', { assetIds: ids }); }
    catch (e) {
      if (![400, 404, 405].includes(e.status)) throw e;
      let deleted = 0;
      for (const id of ids) {
        try { await request('DELETE', `/api/v1/assets/${encodeURIComponent(id)}`); deleted++; }
        catch (err) { if (err.status !== 404) throw err; }
      }
      return { deleted };
    }
  },
  quota: () => request('GET', '/api/v1/assets/quota'),
};

// ---------- Data slots ----------
// GET /api/v1/data/{slug} responds with { slot:{ jsonContent:"<stringified>", … }, quota }.
// Callers usually want the actual stored value, so `getValue()` unwraps + parses
// `jsonContent` for them. Use `get()` if you need the envelope (slot metadata + quota).
function unwrapSlotJson(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const body = raw.slot ?? raw;
  if (typeof body?.jsonContent === 'string') {
    try { return JSON.parse(body.jsonContent); } catch { return body.jsonContent; }
  }
  return body;
}

// The slot list pages like the asset list and the store catalog: server default
// 50, maximum 200. This is what listAll() asks for per page.
const SLOT_PAGE = 200;

export const slots = {
  // 2.1.x adds search (slug/label) and limit/offset paging to the slot list;
  // bare list() is unchanged for the callers that just want everything.
  list: (opts = {}) => {
    const qs = new URLSearchParams();
    if (opts.search) qs.set('search', opts.search);
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.offset) qs.set('offset', String(opts.offset));
    const q = qs.toString();
    return request('GET', '/api/v1/data' + (q ? '?' + q : ''));
  },
  // PUT requires ?label= when creating a new slug (and a type). Sending both
  // always is safe — they're ignored on update.
  put: (slug, value, opts = {}) => {
    // type must be 'value' | 'aggregate' (NOT 'json'); label required on create.
    const qs = new URLSearchParams({ label: opts.label ?? slug, type: opts.type ?? 'value' });
    return request('PUT', `/api/v1/data/${encodeURIComponent(slug)}?${qs.toString()}`, value);
  },
  // Walk every page. Called bare, the endpoint answers ONE page (server
  // default 50, max 200) — and this app writes a slot per published playlist
  // plus one per offline-provisioned widget, so a working account crosses that
  // line by itself. Both places that listed slots read the first page and
  // called it the whole set: "Aus agentView öffnen" stopped offering older
  // playlists, and the binding inspector's slug list stopped suggesting them.
  // Same walk as assets.listAll(), same envelope back.
  listAll: async (opts = {}) => {
    const limit = opts.limit ?? SLOT_PAGE;
    const out = [];
    let offset = 0, total = null;
    for (let page = 0; page < 25; page++) {
      const r = await slots.list({ ...opts, limit, offset });
      const batch = Array.isArray(r) ? r : (r?.slots ?? r?.items ?? r?.data ?? []);
      out.push(...batch);
      if (Number.isFinite(r?.total)) total = r.total;
      const next = nextStoreOffset({ offset, limit, returned: batch.length, total });
      if (next == null) break;
      offset = next;
    }
    return { slots: out, total: total ?? out.length };
  },
  get: (slug) => request('GET', `/api/v1/data/${encodeURIComponent(slug)}`),
  getValue: async (slug) => unwrapSlotJson(await request('GET', `/api/v1/data/${encodeURIComponent(slug)}`)),
  remove: (slug) => request('DELETE', `/api/v1/data/${encodeURIComponent(slug)}`),
  quota: () => request('GET', '/api/v1/data/quota'),
  usage: (slug) => request('GET', `/api/v1/data/${encodeURIComponent(slug)}/usage`),
};

// ---------- Organizations ----------
export const orgs = {
  list: () => request('GET', '/api/v1/agent/organizations'),
  get: (id) => request('GET', `/api/v1/agent/organizations/${id}`),
  create: (body) => request('POST', '/api/v1/agent/organizations', body),
  rename: (id, name) => request('PATCH', `/api/v1/agent/organizations/${id}`, { name }),
  remove: (id) => request('DELETE', `/api/v1/agent/organizations/${id}`),
  invite: (id, body) => request('POST', `/api/v1/agent/organizations/${id}/invite`, body),
  displays: (id) => request('GET', `/api/v1/agent/organizations/${id}/displays`),
  // Org-owned displays (2.1.x): pre-provision a display inside the org without
  // pairing hardware (org needs a free license slot; per /agent-instructions
  // this is plain display-create with an orgId), and eject one — removal
  // clears its group assignment and all display grants.
  createDisplay: (id, name) =>
    request('POST', '/api/v1/agent/displays', { name, orgId: id }),
  removeDisplay: (id, displayId) =>
    request('DELETE', `/api/v1/agent/organizations/${id}/displays/${encodeURIComponent(displayId)}`),
  // Verified (2026-05-28 reply): PUT with /role subpath; DELETE on the bare
  // member URL. Self-removal is server-side blocked (owners cannot eject
  // themselves from their own org).
  setRole: (id, userId, role) =>
    request('PUT', `/api/v1/agent/organizations/${id}/members/${encodeURIComponent(userId)}/role`, { role }),
  removeMember: (id, userId) =>
    request('DELETE', `/api/v1/agent/organizations/${id}/members/${encodeURIComponent(userId)}`),
};

// ---------- Public APIs discovery ----------
export const publicApis = {
  search: (q, opts = {}) => {
    const qs = new URLSearchParams({ query: q ?? '', cors_only: 'true' });
    if (opts.category) qs.set('category', opts.category);
    if (opts.limit) qs.set('limit', String(opts.limit));
    return request('GET', `/api/v1/agent/public-apis?${qs.toString()}`);
  },
  categories: () => request('GET', '/api/v1/agent/public-apis/categories'),
  // Full catalog entry (endpoints, CORS, auth notes) for one API by slug (2.1.x).
  details: (slug) => request('GET', `/api/v1/agent/public-apis/${encodeURIComponent(slug)}`),
};

// ---------- Audit log ----------
// Verified live (2026-05-28 reply): real path is `/owner/activity-audit`, not
// `/owner/audit`. Items have { at, actor, authMethod, action, targetType,
// targetId, orgId, ipPrefix, userAgent, metadata }. Pagination via nextCursor.
export const audit = {
  list: (params = {}) => {
    const qs = new URLSearchParams();
    // Server accepts: display, actor (email), action, from/to (ISO), limit, cursor.
    const mapKey = k => k === 'user' ? 'actor' : k;
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(mapKey(k), v);
    }
    const q = qs.toString();
    return request('GET', '/api/v1/owner/activity-audit' + (q ? '?' + q : ''));
  },
};

// ---------- Webhooks ----------
// Re-verified (2026-05-28 reply):
//   POST /owner/webhooks  {url, eventPattern, description?}
//     → {subscription: {…}, signingSecret: "avwh_<48-hex>", warning}
//     The full secret IS returned on create (once). Bare wildcards `*`/`**`
//     are 400-rejected — use concrete `display.*` etc.
//   PATCH /owner/webhooks/{id}/active  {isActive: bool}   (subpath /active)
//   POST /owner/webhooks/{id}/test
export const webhooks = {
  list: () => request('GET', '/api/v1/owner/webhooks'),
  create: (body) => request('POST', '/api/v1/owner/webhooks', body),
  remove: (id) => request('DELETE', `/api/v1/owner/webhooks/${encodeURIComponent(id)}`),
  setActive: (id, isActive) =>
    request('PATCH', `/api/v1/owner/webhooks/${encodeURIComponent(id)}/active`, { isActive }),
  test: (id) => request('POST', `/api/v1/owner/webhooks/${encodeURIComponent(id)}/test`),
};

// ---------- Approval workflow ----------
// Re-verified against the agentView team's reply (2026-05-28):
//   PUT  /owner/displays/{id}/approval-mode      {mode}     → updated state
//   GET  /owner/displays/{id}/approval-state                → {mode, pending}
//   POST /owner/displays/{id}/pending/accept                → accepts pending
//   POST /owner/displays/{id}/pending/reject                → rejects pending
//   POST /owner/displays/{id}/rollback                      → restore previous
// `approval-state` returns BOTH the current mode and any pending submission
// in one object — no separate /pending GET needed.
export const approval = {
  setMode: (id, mode) =>
    request('PUT', `/api/v1/owner/displays/${encodeURIComponent(id)}/approval-mode`, { mode }),
  state: (id) => request('GET', `/api/v1/owner/displays/${encodeURIComponent(id)}/approval-state`),
  accept: (id) => request('POST', `/api/v1/owner/displays/${encodeURIComponent(id)}/pending/accept`),
  reject: (id) => request('POST', `/api/v1/owner/displays/${encodeURIComponent(id)}/pending/reject`),
  rollback: (id) => request('POST', `/api/v1/owner/displays/${encodeURIComponent(id)}/rollback`),
};

// ---------- Store templates ----------
// Verified (2026-05-28 reply). Note: the agent-artifact GET endpoint is
// plural (`agent-artifacts`) and has a `/{key}/raw` subpath for the raw body.
// The mutation endpoint is `/send` (Studio's UX-naming "install" is just
// historical) plus a `/copy` to clone the template into the user's own slot.
// The catalog is localised: without ?language= the server answers in German,
// so every read passes the Studio's current UI locale (verified live: title,
// shortDescription and the nested category title all switch). The list is also
// paged — ?limit is capped at 100 and the envelope carries { total, offset,
// limit } — hence searchAll() below.
const STORE_PAGE = 100;

export const storeTemplates = {
  categories: (language = getLocale()) =>
    request('GET', '/api/v1/store/categories' + (language ? `?language=${encodeURIComponent(language)}` : '')),
  // NOTE: the free-text key is `search`, not `q` — see storeQuery() in
  // api-url.js. Prefer searchAll() for anything user-facing; this raw call
  // returns one page.
  search: (query, category, opts = {}) => {
    const qs = storeQuery({
      search: query, category, language: opts.language ?? getLocale(),
      limit: opts.limit ?? STORE_PAGE, offset: opts.offset,
    });
    return request('GET', '/api/v1/store/templates' + (qs ? '?' + qs : ''));
  },
  // Walk every page so the Library shows the whole catalog instead of the
  // server's first page. Returns the same envelope shape as search().
  searchAll: async (query, category, opts = {}) => {
    const limit = Math.min(opts.limit ?? STORE_PAGE, STORE_PAGE);
    const templates = [];
    let offset = 0, total = null;
    for (let page = 0; page < 20; page++) {
      const r = await storeTemplates.search(query, category, { ...opts, limit, offset });
      const batch = Array.isArray(r) ? r : (r?.templates ?? r?.items ?? []);
      templates.push(...batch);
      if (Number.isFinite(r?.total)) total = r.total;
      const next = nextStoreOffset({ offset, limit, returned: batch.length, total });
      if (next == null) break;
      offset = next;
    }
    return { templates, total: total ?? templates.length };
  },
  details: (slug, language = getLocale()) =>
    request('GET', `/api/v1/store/templates/${encodeURIComponent(slug)}`
      + (language ? `?language=${encodeURIComponent(language)}` : '')),
  // Raw display-HTML body of a template + its static slot defs + allowed
  // origins — the source for "Insert as slide". {{asset:…}} is server-resolved
  // to public URLs; {{slot:KEY.prop}} stays literal so the template's own JS
  // falls back to its inline defaults in the editor (no live slot bound yet).
  // Anonymous, like the rest of the public store. Schema verified against the
  // MCP manifest + live response (2026-06-02).
  content: (slug, version) =>
    request('GET', `/api/v1/store/templates/${encodeURIComponent(slug)}/content`
      + (version ? `?version=${encodeURIComponent(version)}` : '')),
  installOptions: (slug, language = getLocale()) =>
    request('GET', `/api/v1/store/templates/${encodeURIComponent(slug)}/install-options`
      + (language ? `?language=${encodeURIComponent(language)}` : '')),
  // The MCP tool names the overrides data_slot_overrides; REST has taken
  // slotOverrides historically and we cannot tell without an account which one
  // the deployed server reads. Send both camelCased names — an unknown key is
  // ignored, and a strict 400 retries with the legacy shape alone. Silently
  // dropped overrides would install a template with placeholder data.
  sendToDisplay: async (slug, displayId, overrides = {}) => {
    const path = `/api/v1/store/templates/${encodeURIComponent(slug)}/send`;
    const legacy = { displayId, slotOverrides: overrides };
    if (!overrides || !Object.keys(overrides).length) return request('POST', path, legacy);
    try { return await request('POST', path, { ...legacy, dataSlotOverrides: overrides }); }
    catch (e) { if (e.status !== 400) throw e; return request('POST', path, legacy); }
  },
  copy: (slug, displayName) =>
    request('POST', `/api/v1/store/templates/${encodeURIComponent(slug)}/copy`,
      displayName ? { displayName } : {}),
  agentArtifacts: (slug) =>
    request('GET', `/api/v1/store/templates/${encodeURIComponent(slug)}/agent-artifacts`),
  agentArtifactRaw: (slug, key) =>
    request('GET', `/api/v1/store/templates/${encodeURIComponent(slug)}/agent-artifacts/${encodeURIComponent(key)}/raw`),
};

// ---------- License management ----------
// Verified (2026-05-28 reply):
//   POST /agent/organizations/{orgId}/slots  {additionalSlots: N}  (DELTA, not absolute)
//   POST /agent/displays/{id}/assign-license
//   POST /agent/displays/{id}/unassign-license   (POST, not DELETE — symmetry)
// Pool capacity is one-way by design — unassigning doesn't shrink the pool.
export const licensing = {
  addSlots: (orgId, additionalSlots) =>
    request('POST', `/api/v1/agent/organizations/${encodeURIComponent(orgId)}/slots`, { additionalSlots }),
  // Backward-compat alias for legacy call-sites; expects an absolute target
  // and computes the delta against the org's current allocation.
  allocate: async (orgId, target) => {
    const cur = await orgs.get(orgId).catch(() => null);
    const have = cur?.allocatedSlots ?? 0;
    return licensing.addSlots(orgId, (target ?? 0) - have);
  },
  assign: (displayId) =>
    request('POST', `/api/v1/agent/displays/${encodeURIComponent(displayId)}/assign-license`),
  unassign: (displayId) =>
    request('POST', `/api/v1/agent/displays/${encodeURIComponent(displayId)}/unassign-license`),
};

// ---------- Display grants (per-user access) ----------
// Verified (2026-05-28 reply): grants are ORG-SCOPED by design. Personal
// displays cannot be delegated via grants — only displays that belong to
// an org gain per-user grants. The owner-scoped path Studio guessed at
// before is architecturally not a thing.
//
// list() — no GET endpoint was listed in the reply; reads come from the
// org-scoped display response (which surfaces grants[]). Kept as a
// best-effort probe so the drawer doesn't have to render uninformatively
// when the endpoint eventually ships.
export const grants = {
  list: (orgId, displayId) =>
    request('GET', `/api/v1/agent/organizations/${encodeURIComponent(orgId)}/displays/${encodeURIComponent(displayId)}/grants`),
  set: (orgId, displayId, targetUserId, level) =>
    request('PUT', `/api/v1/agent/organizations/${encodeURIComponent(orgId)}/displays/${encodeURIComponent(displayId)}/grants/${encodeURIComponent(targetUserId)}`,
      { level }), // 'view' | 'control'
  remove: (orgId, displayId, targetUserId) =>
    request('DELETE', `/api/v1/agent/organizations/${encodeURIComponent(orgId)}/displays/${encodeURIComponent(displayId)}/grants/${encodeURIComponent(targetUserId)}`),
};

// ---------- Connectivity ----------
// Verified (2026-05-28 reply): POST (not PATCH), full replacement of the
// org-level configuration. Connectivity is orthogonal to Privacy (the
// per-display privacy-mode toggle remains a separate axis).
export const connectivity = {
  setForOrg: (orgId, mode, whitelist) =>
    request('POST', `/api/v1/agent/organizations/${encodeURIComponent(orgId)}/connectivity`,
      { mode, whitelist }), // mode: 'full-access' | 'whitelist-only' | 'isolated'
};

// ---------- Pricing ----------
// Moved in the 2.1.x API: the old public /api/v1/pricing now 404s; the live
// path is /api/v1/agent/pricing (verified 2026-07-07 — returns { plans:[
// { name, price, monthlyPrice, displays, features } ] }). Used for the in-app
// plan comparison when a user hits a quota wall.
export const pricing = {
  get: () => request('GET', '/api/v1/agent/pricing'),
};

// ---------- Misc ----------
export const status = () => request('GET', '/api/status');
