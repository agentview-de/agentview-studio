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
