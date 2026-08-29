// Re-entrant refreshes. Both guards exist because the Displays dashboard and
// the asset library refresh from more than one trigger at a time.
//
// The fleet refresh had ten callers, one of them an SSE handler: twenty
// displays coming back online meant twenty overlapping fan-outs of 2 + N
// requests each, and since a run writes state.fleet.displays before its member
// lookups and state.fleet.groups after them, the halves could come from
// different runs. The asset search fired one request per (debounced) keystroke,
// and the shorter query — which matches more rows and is therefore the likelier
// one to be slow — overwrote the results of the longer one.

import { test, expect, describe } from './runner.js';
import { coalesce, newestOnly } from '../shared/async-refresh.js';

// A promise whose resolution this test controls, so ordering is explicit
// rather than a race against real timers.
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(r => setTimeout(r, 0));

describe('coalesce · a burst costs two runs, not one per event', () => {
  test('a single call runs straight through', async () => {
    const c = coalesce(async x => `ran:${x}`);
    expect(await c('a')).toBe('ran:a');
    expect(c.isRunning()).toBeFalsy();
  });

  test('REGRESSION: twenty calls during one run produce exactly two runs', async () => {
    const started = [];
    const gate = deferred();
    const c = coalesce(async n => { started.push(n); if (started.length === 1) await gate.promise; return n; });

    const first = c(0);
    const rest = [];
    for (let i = 1; i <= 20; i++) rest.push(c(i));
    expect(started).toEqual([0]);          // nothing else started while #0 runs
    expect(c.isQueued()).toBeTruthy();

    gate.resolve();
    await first;
    await Promise.all(rest);
    expect(started).toEqual([0, 20]);      // the run in flight, then ONE catch-up
  });

  test('every queued caller gets the trailing run’s result', async () => {
    const gate = deferred();
    let n = 0;
    const c = coalesce(async () => { const mine = ++n; if (mine === 1) await gate.promise; return mine; });
    const a = c(), b = c(), d = c();
    gate.resolve();
    expect(await a).toBe(1);
    expect(await b).toBe(2);
    expect(await d).toBe(2);               // b and d share the one catch-up run
  });

  test('the catch-up run keeps the NEWEST arguments by default', async () => {
    const seen = [];
    const gate = deferred();
    const c = coalesce(async q => { seen.push(q); if (seen.length === 1) await gate.promise; return q; });
    const first = c('a'); c('ab'); const last = c('abc');
    gate.resolve();
    await first; await last;
    expect(seen).toEqual(['a', 'abc']);
  });

  test('merge folds the arguments of the calls that were collapsed', async () => {
    const seen = [];
    const gate = deferred();
    // The shape refreshRunning() needs: a call for "all displays" (no ids)
    // absorbs everything; otherwise the id lists are unioned.
    const merge = ([a], [b]) => (!a?.length || !b?.length ? [undefined] : [[...new Set([...a, ...b])]]);
    const c = coalesce(async ids => { seen.push(ids); if (seen.length === 1) await gate.promise; return ids; }, { merge });

    const first = c(['d1']);
    c(['d2']); const last = c(['d3', 'd2']);
    gate.resolve();
    await first; await last;
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual(['d1']);
    expect(seen[1]).toEqual(['d2', 'd3']);   // nothing announced during the run is lost
  });

  test('an "everything" call absorbs the id lists around it', async () => {
    const seen = [];
    const gate = deferred();
    const merge = ([a], [b]) => (!a?.length || !b?.length ? [undefined] : [[...new Set([...a, ...b])]]);
    const c = coalesce(async ids => { seen.push(ids); if (seen.length === 1) await gate.promise; return ids; }, { merge });
    const first = c(['d1']);
    c(['d2']); c(undefined); const last = c(['d9']);
    gate.resolve();
    await first; await last;
    expect(seen[1]).toBe(undefined);
  });

  test('a failing run rejects its callers and does not wedge the guard', async () => {
    let n = 0;
    const c = coalesce(async () => { n++; throw new Error(`boom ${n}`); });
    let msg = '';
    try { await c(); } catch (e) { msg = e.message; }
    expect(msg).toBe('boom 1');
    expect(c.isRunning()).toBeFalsy();
    let msg2 = '';
    try { await c(); } catch (e) { msg2 = e.message; }
    expect(msg2).toBe('boom 2');           // still callable
  });

  test('a failing run still hands over to the queued one', async () => {
    const started = [];
    const gate = deferred();
    const c = coalesce(async n => {
      started.push(n);
      if (started.length === 1) { await gate.promise; throw new Error('first failed'); }
      return n;
    });
    const first = c(1);
    const queued = c(2);
    gate.resolve();
    let failed = '';
    try { await first; } catch (e) { failed = e.message; }
    expect(failed).toBe('first failed');
    expect(await queued).toBe(2);
    expect(started).toEqual([1, 2]);
  });

  test('calls after everything settled start a fresh run', async () => {
    let n = 0;
    const c = coalesce(async () => ++n);
    expect(await c()).toBe(1);
    await tick();
    expect(await c()).toBe(2);
  });
});

describe('newestOnly · only the newest answer may land', () => {
  test('REGRESSION: the slow answer to the older query is dropped', async () => {
    const newToken = newestOnly();
    const rows = [];
    // "logo" is broader, so it comes back LAST — the exact ordering that broke
    // the asset search.
    const slow = (async () => { const ok = newToken(); await tick(); await tick(); if (ok()) rows.push('logo'); })();
    const fast = (async () => { const ok = newToken(); await tick(); if (ok()) rows.push('logo-2024'); })();
    await Promise.all([slow, fast]);
    expect(rows).toEqual(['logo-2024']);
  });

  test('the newest token stays current while it is the newest', () => {
    const newToken = newestOnly();
    const a = newToken();
    expect(a()).toBeTruthy();
    const b = newToken();
    expect(a()).toBeFalsy();
    expect(b()).toBeTruthy();
  });

  test('two sources of tokens do not interfere', () => {
    const one = newestOnly(), two = newestOnly();
    const a = one();
    two(); two();
    expect(a()).toBeTruthy();
  });
});
