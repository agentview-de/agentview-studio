// agentView REST API client.
//
// The local CORS proxy in server.mjs mirrors /api/* and /data/* to agentview.de.
// When running through it we keep relative URLs; otherwise we hit baseUrl
// directly (browser may block CORS unless the API allows your origin).

import { state } from './store.js';
import { toast } from './ui/toast.js';
import { t } from './i18n.js';
import { authHeader, resolveUrl } from './api-url.js';

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

// duration is a non-nullable int32 in [1, 86400]; return it as a spreadable
// fragment only when valid, so absent/invalid values are omitted (not sent null).
function validDuration(d) {
  const n = Number(d);
  return Number.isInteger(n) && n >= 1 && n <= 86400 ? { duration: n } : {};
}

// ---------- Auth ----------
export const auth = {
  me: () => request('GET', '/api/v1/agent/me'),
  sessionRequest: (agentIdentifier = 'agentView Studio') =>
    request('POST', '/api/v1/agent/session/request', { agentIdentifier, scope: 'admin' }),
  sessionStatus: (id) =>
    request('GET', `/api/v1/agent/session/status?id=${encodeURIComponent(id)}`),
  apiKeyList: () => request('GET', '/api/v1/agent/api-keys'),
  apiKeyCreate: (params) => request('POST', '/api/v1/agent/api-keys', params),
  apiKeyRevoke: (id) => request('DELETE', `/api/v1/agent/api-keys/${encodeURIComponent(id)}`),
  licenseInfo: () => request('GET', '/api/v1/agent/license-info'),
  rotateApprovalSecret: () => request('POST', '/api/v1/agent/account/approval-secret/rotate'),
};

// ---------- Displays ----------
export const displays = {
  list: () => request('GET', '/api/v1/agent/displays'),
  get: (id) => request('GET', `/api/v1/agent/displays/${id}`),
  create: (body) => request('POST', '/api/v1/agent/displays', body),
  patch: (id, body) => request('PATCH', `/api/v1/agent/displays/${id}`, body),
  remove: (id) => request('DELETE', `/api/v1/agent/displays/${id}`),
  pairByCode: (body) => request('POST', '/api/v1/agent/displays/pair-by-code', body),
  capabilities: (id) => request('GET', `/api/v1/agent/displays/${id}/capabilities`),
  configure: (id, body) => request('POST', `/api/v1/agent/displays/${id}/configure`, body),
  lock: (id) => request('POST', `/api/v1/agent/displays/${id}/lock`),
  unlock: (id) => request('POST', `/api/v1/agent/displays/${id}/unlock`),
  setPrivacyMode: (id, mode) =>
    request('PATCH', `/api/v1/agent/displays/${id}/privacy-mode`, { privacyMode: mode }),
  setEmbeddableOrigins: (id, origins) =>
    request('PATCH', `/api/v1/agent/displays/${id}/embeddable-origins`, { origins }),
  previewLink: (id) => request('POST', `/api/v1/agent/displays/${id}/preview-link`),
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
  // Which content is currently running → { currentContentDescription, … }
  contentState: (id) => request('GET', `/api/v1/agent/displays/${id}/content`),
  // Raw rendered HTML currently on the display (live or idle). Server replaces
  // a template's {{slot:…}} with real read URLs before serving, so this is the
  // source for the "Inhalte" tab's preview + slot discovery.
  readHtml: (id, type = 'live') =>
    request('GET', `/api/v1/agent/displays/${id}/html${type ? `?contentType=${encodeURIComponent(type)}` : ''}`),
  // Pre-publish dry-run validation (1 MB limit) — returns warnings, never ships.
  testContent: (html) => request('POST', '/api/v1/agent/displays/test/content', { html }),
  // Load a plain URL in the display's iframe (alternative to HTML content).
  sendUrl: (id, url, opts = {}) =>
    request('POST', `/api/v1/agent/displays/${id}/url`,
      { url, description: opts.description ?? 'agentView Studio URL', contentDescription: opts.description ?? 'agentView Studio URL' }),
  // Adopt an unconfigured display.
  claim: (id) => request('POST', `/api/v1/agent/displays/${id}/claim`),
  getSourceLock: (id) => request('GET', `/api/v1/owner/displays/${id}/source-lock`),
  setSourceLock: (id, apiKeyId) => request('PUT', `/api/v1/owner/displays/${id}/source-lock`, { apiKeyId }),
};

// ---------- Groups (native agentView display-categories) ----------
// Verified live: an agent `avk_` key IS authorised on the owner-scoped category
// routes (they're merely absent from the agent OpenAPI spec). So "Groups" map to
// real display-categories — server-side, persistent, visible in the owner portal.
// Category membership is NOT on the display object; read it via the agent
// displays filter (?categoryId=…). Category id field is `categoryId`.
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
};

// ---------- Assets ----------
export const assets = {
  list: () => request('GET', '/api/v1/assets'),
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
  remove: (id) => request('DELETE', `/api/v1/assets/${id}`),
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

export const slots = {
  list: () => request('GET', '/api/v1/data'),
  // PUT requires ?label= when creating a new slug (and a type). Sending both
  // always is safe — they're ignored on update.
  put: (slug, value, opts = {}) => {
    // type must be 'value' | 'aggregate' (NOT 'json'); label required on create.
    const qs = new URLSearchParams({ label: opts.label ?? slug, type: opts.type ?? 'value' });
    return request('PUT', `/api/v1/data/${encodeURIComponent(slug)}?${qs.toString()}`, value);
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
  search: (q) => request('GET', `/api/v1/agent/public-apis?query=${encodeURIComponent(q ?? '')}&cors_only=true`),
  categories: () => request('GET', '/api/v1/agent/public-apis/categories'),
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
export const storeTemplates = {
  categories: () => request('GET', '/api/v1/store/categories'),
  search: (query, category) => {
    const qs = new URLSearchParams();
    if (query) qs.set('q', query);
    if (category) qs.set('category', category);
    return request('GET', '/api/v1/store/templates?' + qs.toString());
  },
  details: (slug) => request('GET', `/api/v1/store/templates/${encodeURIComponent(slug)}`),
  // Raw display-HTML body of a template + its static slot defs + allowed
  // origins — the source for "Insert as slide". {{asset:…}} is server-resolved
  // to public URLs; {{slot:KEY.prop}} stays literal so the template's own JS
  // falls back to its inline defaults in the editor (no live slot bound yet).
  // Anonymous, like the rest of the public store. Schema verified against the
  // MCP manifest + live response (2026-06-02).
  content: (slug, version) =>
    request('GET', `/api/v1/store/templates/${encodeURIComponent(slug)}/content`
      + (version ? `?version=${encodeURIComponent(version)}` : '')),
  installOptions: (slug) =>
    request('GET', `/api/v1/store/templates/${encodeURIComponent(slug)}/install-options`),
  sendToDisplay: (slug, displayId, overrides = {}) =>
    request('POST', `/api/v1/store/templates/${encodeURIComponent(slug)}/send`,
      { displayId, slotOverrides: overrides }),
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
// Structured JSON (verified 2026-05-28 reply): plan-name, monthly/annual
// price, included licenses, feature list. Used for the in-app plan comparison
// when a user hits a quota wall.
export const pricing = {
  get: () => request('GET', '/api/v1/pricing'),
};

// ---------- Misc ----------
export const status = () => request('GET', '/api/status');
