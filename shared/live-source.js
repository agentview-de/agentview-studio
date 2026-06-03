// Live data source — the one place the "fetch a URL, optionally poll it, abort
// safely, back off on errors, clean up the timer" loop lives.
//
// Before this seam, ~5 widget plugins (live-json, currency, kpi-cards,
// data-table, chart) each hand-rolled childSignal + fetch + !ok-throw +
// AbortError handling + a poll timer + dispose, with subtly different policies.
// liveSource() owns that spine; each plugin keeps ONLY its rendering and its
// error copy (passed as onData / onError). The interface is small; the timer,
// abort, backoff and CORS detection sit behind it.
//
// Not every live plugin funnels through here: rss / news-photos do bespoke
// multi-feed parallel fetches with their own rotation timers, and weather keeps
// a cross-instance response cache that dedupes concurrent widgets — those data
// layers earn their keep and stay as they are.
//
// The fetch + timers are injectable (_fetch / _setTimer / _clearTimer) purely so
// the loop is unit-testable with a fake clock and fake fetch (test/
// live-source.test.js) — callers never pass them.

import { childSignal } from './plugin-contract.js';

// A failed fetch() (DNS, offline, or — most often for signage — a missing
// Access-Control-Allow-Origin) rejects with a TypeError whose message mentions
// fetch/network. We treat that as CORS-shaped: retrying rarely helps, so a
// polling source can choose to stop immediately rather than hammer a wall.
const CORS_RE = /fetch|cors|network/i;

// Start a live source. Returns a dispose() that stops polling and aborts any
// in-flight request. Idempotent: dispose -> (no further onData/onError fire).
//
// opts:
//   url            string — the resource to fetch
//   signal         parent AbortSignal (ctx.signal); the source aborts with it
//   intervalMs     0 (default) = fetch ONCE; > 0 = poll every intervalMs after
//                  each success (setTimeout-chained, so requests never overlap)
//   parse          'json' (default) | 'text' | (response) => any
//   fetchInit      extra fetch init merged in (e.g. { cache: 'no-store' });
//                  `signal` is always injected and cannot be overridden
//   maxErrors      consecutive errors before a POLLING source gives up
//                  (default 3; 0 = never give up). A one-shot source (intervalMs
//                  0) always gives up after its single failure.
//   stopOnCorsError  give up immediately on a CORS-shaped error (default true)
//   backoff        between transient retries wait min(60s, intervalMs * tries)
//                  instead of a flat intervalMs (default true)
//   onData(data)   called on each success. MAY THROW to signal an app-level
//                  failure (e.g. an API that returns HTTP 200 with an error
//                  body) — the throw is routed to onError like any fetch error.
//   onError(err, info)  info = { consecutive, cors, gaveUp }. Called on every
//                  failure; check info.gaveUp to tell a transient retry from a
//                  terminal stop.
export function liveSource({
  url,
  signal,
  intervalMs = 0,
  parse = 'json',
  fetchInit = {},
  maxErrors = 3,
  stopOnCorsError = true,
  backoff = true,
  onData,
  onError,
  _fetch = (u, init) => fetch(u, init),
  _setTimer = (fn, ms) => setTimeout(fn, ms),
  _clearTimer = (id) => clearTimeout(id),
} = {}) {
  const ctrl = childSignal(signal);
  let timer = null;
  let consecutive = 0;
  let stopped = false;

  const readBody = (r) =>
    typeof parse === 'function' ? parse(r) : parse === 'text' ? r.text() : r.json();

  const schedule = (ms) => {
    if (stopped || ctrl.signal.aborted) return;
    timer = _setTimer(tick, ms);
  };

  async function tick() {
    if (stopped || ctrl.signal.aborted) return;
    try {
      const r = await _fetch(url, { ...fetchInit, signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await readBody(r);
      if (stopped || ctrl.signal.aborted) return;
      onData?.(data);             // may throw → handled as an app-level failure
      consecutive = 0;
      if (intervalMs > 0) schedule(intervalMs);
    } catch (e) {
      if (e?.name === 'AbortError' || ctrl.signal.aborted) return;
      consecutive++;
      const cors = e instanceof TypeError && CORS_RE.test(e.message ?? '');
      const gaveUp =
        intervalMs <= 0 ||
        (stopOnCorsError && cors) ||
        (maxErrors > 0 && consecutive >= maxErrors);
      onError?.(e, { consecutive, cors, gaveUp });
      if (gaveUp) return;
      schedule(backoff ? Math.min(60000, intervalMs * consecutive) : intervalMs);
    }
  }

  tick();

  return () => {
    if (stopped) return;
    stopped = true;
    _clearTimer(timer);
    ctrl.abort();
  };
}
