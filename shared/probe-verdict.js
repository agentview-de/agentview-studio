// The verdict half of the URL probe, separated from the network half.
//
// probe.js exists to give the customer "a concrete, honest verdict instead of a
// silently-blank widget at runtime" — its own words. For JSON sources it did the
// opposite: the json branch returned before the shared `if (!r.ok)` check, so a
// 404 answering with `{"error":"not found"}` was reported as
//
//     ✓ Valid JSON · 1 top-level entries
//
// green, next to the field. The user then shipped that widget to a screen and
// got nothing. The feed / embed / stream branches all checked the status; only
// the one people paste API URLs into did not.
//
// Second, smaller thing this fixes: a body of literal `null` is valid JSON, but
// `Object.keys(null)` throws, so it used to be reported as "not valid JSON".
//
// Pure — no fetch, no i18n. Returns a message KEY plus params; the caller
// translates. Tested in test/probe-verdict.test.js.

/**
 * Verdict for a readable (CORS-allowed) response.
 * @param {{kind: string, ok: boolean, status: number, bodyText?: string}} r
 * @returns {{level: 'ok'|'warn'|'error', key: string, params?: object}}
 */
export function corsVerdict({ kind, ok, status, bodyText = '' }) {
  // The status comes first for EVERY kind. It used to come first for every kind
  // except the one that mattered most.
  if (!ok) return { level: 'warn', key: 'probe.httpStatus', params: { status } };

  if (kind === 'json') {
    let parsed;
    try { parsed = JSON.parse(bodyText); } catch { return { level: 'warn', key: 'probe.notJson' }; }
    return { level: 'ok', key: 'probe.jsonOk', params: { n: topLevelCount(parsed) } };
  }
  if (kind === 'feed') return { level: 'ok', key: 'probe.feedOk' };
  return { level: 'ok', key: 'probe.reachable', params: { status } };
}

/**
 * Verdict when only an opaque (no-cors) response came back: the host answered,
 * but the browser will not let us read it.
 */
export function opaqueVerdict(kind) {
  if (kind === 'feed') return { level: 'error', key: 'probe.feedBlocked' };
  if (kind === 'json') return { level: 'warn', key: 'probe.corsBlocked' };
  if (kind === 'embed') return { level: 'warn', key: 'probe.embedMaybe' };
  if (kind === 'stream') return { level: 'warn', key: 'probe.streamMaybe' };
  return { level: 'ok', key: 'probe.reachableNoCors' };
}

// How many top-level entries a parsed JSON value has. null and primitives are
// valid JSON with nothing in them — they must not be mistaken for a parse error.
function topLevelCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === 'object') return Object.keys(value).length;
  return 0;
}
