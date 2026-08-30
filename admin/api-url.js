// Pure decision logic for the API client, extracted from api.js so it can be
// unit-tested without a DOM or network. api.js wires these to the live
// state.connection + location.

// Map a credential to exactly ONE auth header. API keys (`avk_…`) go via
// X-API-Key, which the server prioritises and short-circuits; the session flow
// returns a Bearer JWT. Sending a JWT under X-API-Key makes the server validate
// it as a key (which fails) and never fall through to Bearer → 401. Empty
// credential → no header at all.
export function authHeader(apiKey) {
  if (!apiKey) return {};
  if (/^avk_/.test(apiKey)) return { 'X-API-Key': apiKey };
  return { Authorization: `Bearer ${apiKey}` };
}

// Resolve a request path. Absolute URLs pass through. When the app is served by
// anything other than agentview.de (the local server.mjs proxy, or any static
// host) we keep the path relative so the proxy mirrors /api/* + /data/*
// same-origin; only when served directly from agentview.de do we prefix the
// configured baseUrl.
export function resolveUrl(path, { host, baseUrl }) {
  if (path.startsWith('http')) return path;
  if (host && host !== 'agentview.de') return path;
  return baseUrl + path;
}

// ---------- Store catalog query ----------
// Verified live against Screen.Server 2.1.120 (2026-08-28):
//   • the free-text filter is `search=` — `q=` is silently IGNORED and returns
//     the unfiltered catalog, so a search box wired to `q` looks broken;
//   • `category=` narrows to one category slug;
//   • `language=` ('de' | 'en') localises title, shortDescription and the
//     embedded category title — without it the API answers in German.
// Empty values are dropped so we never send `search=` and pin the server to an
// empty-string filter.
export function storeQuery({ search, category, language, limit, offset } = {}) {
  const qs = new URLSearchParams();
  if (search) qs.set('search', search);
  if (category) qs.set('category', category);
  if (language) qs.set('language', language);
  if (limit != null) qs.set('limit', String(limit));
  if (offset) qs.set('offset', String(offset));
  return qs.toString();
}

// The list endpoint caps `limit` at 100 server-side and reports `total`, so a
// catalog bigger than one page has to be walked with `offset` — a single
// unpaged call silently truncated the Library to the first page. Returns the
// next offset, or null when the catalog is exhausted.
export function nextStoreOffset({ offset = 0, limit = 0, returned = 0, total } = {}) {
  if (!returned) return null;                       // empty page → done
  const next = offset + returned;
  if (Number.isFinite(total)) {
    // The total decides. A page shorter than the limit does NOT mean the end
    // when the server said there is more: endpoints cap `limit` at their own
    // maximum, so asking for 200 where the cap is 100 comes back short on
    // every single page. Reading that as "exhausted" is how a caller ends up
    // with the first page and no idea.
    return next >= total ? null : next;
  }
  if (limit && returned < limit) return null;       // short page, no total → done
  return next;
}

// ---------- List envelopes ----------
// agentView's list endpoints answer in several shapes: a bare array, or an
// object wrapping the rows under an endpoint-specific key (`templates`,
// `assets`, `slots`, …) or a generic `items` / `data` / `results`. For the
// owner API the shape is not merely inconsistent but UNDOCUMENTED — its spec
// declares every response as a bare "200 OK" with no schema — so a caller
// cannot know before the server answers. Try the endpoint's own key(s) first,
// then the generic wraps, and return [] rather than letting a `.map` of
// undefined throw a list view into a blank page.
export function unwrapList(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of [...keys, 'items', 'data', 'results']) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}
