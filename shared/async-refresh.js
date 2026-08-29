// Two guards for re-entrant async refreshes, and the rule for choosing between
// them. Both bugs they fix were live in the Displays dashboard and the asset
// library — the two screens that refresh from more than one trigger.
//
// coalesce()   — for a refresher that takes no meaningful arguments and is
//                fired from many places at once. refreshFleet() has TEN
//                callers, one of which is an SSE handler: when a wall of
//                displays comes back after a network blip, every
//                `display_online` event started its own full refresh. Each run
//                is 2 + N requests (displays, groups, then one member lookup
//                per group), so twenty events meant twenty overlapping fan-outs
//                — and because the run writes `state.fleet.displays` before its
//                member lookups and `state.fleet.groups` after them, the two
//                halves of the dashboard could end up coming from different
//                runs. Coalescing collapses a burst into: the run in flight,
//                plus at most one more afterwards to pick up whatever the burst
//                announced.
//
// newestOnly() — for a refresher whose ARGUMENTS differ per call, where a
//                trailing run would be wrong and only the newest answer counts.
//                Typing in the asset search fires one request per keystroke
//                (debounced, but that only narrows the window): the shorter
//                query matches more rows, so it is the more likely to be slow,
//                and its late answer overwrote the results of the longer one.
//                The search box then showed "logo-2024" above the hits for
//                "logo" with nothing to hint at the mismatch.
//
// Rule of thumb: same request every time → coalesce. Different request each
// time → newestOnly.

/**
 * Wrap an async function so overlapping calls collapse.
 *
 * While a run is in flight, further calls do not start one — they mark that
 * another run is wanted and resolve with ITS result. At most one run is ever
 * queued, so a burst of any size costs two runs, not one per event.
 *
 * @param {(...a: any[]) => Promise<any>} fn
 * @param {{ merge?: (pending: any[], next: any[]) => any[] }} [opts]
 *   `merge` folds the arguments of calls that arrive during a run into the
 *   arguments of the queued one. The default keeps the newest call's arguments;
 *   pass a union (or a widening) when dropping the earlier ones would lose work.
 * @returns {((...a: any[]) => Promise<any>) & { isRunning(): boolean, isQueued(): boolean }}
 */
export function coalesce(fn, { merge = (_pending, next) => next } = {}) {
  let inFlight = null;
  let queuedArgs = null;
  let queuedPromise = null;
  let settleQueued = null;

  function runNow(args) {
    const p = (async () => fn(...args))();
    // Chain the handover off the run, and keep `inFlight` non-null until the
    // handover has happened — so a call arriving in the same tick still queues.
    inFlight = p.then(handover, e => { handover(); throw e; });
    inFlight.catch(() => {});   // the caller owns the error; this chain is bookkeeping
    return p;
  }

  function handover() {
    inFlight = null;
    if (!queuedArgs) return;
    const args = queuedArgs;
    const settle = settleQueued;
    queuedArgs = null;
    queuedPromise = null;
    settleQueued = null;
    runNow(args).then(settle.resolve, settle.reject);
  }

  const call = (...args) => {
    if (!inFlight) return runNow(args);
    queuedArgs = queuedArgs ? merge(queuedArgs, args) : args;
    if (!queuedPromise) {
      queuedPromise = new Promise((resolve, reject) => { settleQueued = { resolve, reject }; });
    }
    return queuedPromise;
  };
  call.isRunning = () => inFlight !== null;
  call.isQueued = () => queuedArgs !== null;
  return call;
}

/**
 * A source of "am I still the newest call?" tokens.
 *
 *   const newToken = newestOnly();
 *   async function refresh(query) {
 *     const isCurrent = newToken();
 *     const rows = await api.list(query);
 *     if (!isCurrent()) return;     // a newer refresh has started — drop this answer
 *     state.rows = rows;
 *   }
 *
 * @returns {() => (() => boolean)}
 */
export function newestOnly() {
  let seq = 0;
  return () => {
    const mine = ++seq;
    return () => mine === seq;
  };
}
