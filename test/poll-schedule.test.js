// A display that cannot reach its server used to keep asking at full rate.
//
// `state.failCount` was counted and printed in the debug HUD, but nothing read
// it: a screen whose API key was revoked asked every 30 s forever, and so did
// every one of its data slots. The storm was heaviest exactly when the server
// was least able to carry it.
//
// And nothing had jitter. Signage is provisioned and rebooted in groups; twenty
// screens that boot in the same second poll on the same tick forever, and the
// 6-hour hard reload re-synchronises them if they ever drift apart.

import { test, expect, describe } from './runner.js';
import { pollDelayMs, jittered, createPoller, POLL_BASE_MS, POLL_MAX_MS } from '../shared/poll-schedule.js';

// A fixed "random" so the arithmetic is checkable: 0.5 lands dead centre, i.e.
// exactly the target delay.
const mid = () => 0.5;
const at = (n, extra = {}) => pollDelayMs(n, { rand: mid, ...extra });

describe('poll schedule · backing off', () => {
  test('REGRESSION: failures slow the asking down', () => {
    expect(at(0)).toBe(POLL_BASE_MS);
    // One failure is a hiccup: the first retry keeps the normal cadence.
    expect(at(1)).toBe(POLL_BASE_MS);
    expect(at(2)).toBe(POLL_BASE_MS * 2);
    expect(at(3)).toBe(POLL_BASE_MS * 4);
    expect(at(4)).toBe(POLL_BASE_MS * 8);
  });

  test('but never so far that recovery takes all afternoon', () => {
    expect(at(5)).toBe(POLL_MAX_MS);
    expect(at(40)).toBe(POLL_MAX_MS);          // 2**40 would be days
    expect(at(1e9)).toBe(POLL_MAX_MS);
    expect(Number.isFinite(at(5000))).toBeTruthy();
  });

  test('a healthy display keeps its normal cadence', () => {
    expect(at(0)).toBe(POLL_BASE_MS);
    expect(at(-3)).toBe(POLL_BASE_MS);          // nonsense counts as healthy
    expect(at(NaN)).toBe(POLL_BASE_MS);
    expect(at(undefined)).toBe(POLL_BASE_MS);
  });
});

describe('poll schedule · breaking up the herd', () => {
  test('REGRESSION: two displays that boot together do not stay in step', () => {
    // The whole point: the spread is there while things are HEALTHY.
    const lo = pollDelayMs(0, { rand: () => 0 });
    const hi = pollDelayMs(0, { rand: () => 1 });
    expect(lo < POLL_BASE_MS).toBeTruthy();
    expect(hi > POLL_BASE_MS).toBeTruthy();
    expect(hi - lo).toBe(Math.round(POLL_BASE_MS * 0.4));
  });

  test('the spread never inverts the backoff or reaches zero', () => {
    for (const n of [0, 1, 2, 3, 4, 9]) {
      for (const r of [0, 0.001, 0.5, 0.999, 1]) {
        const ms = pollDelayMs(n, { rand: () => r });
        expect(ms > 0).toBeTruthy();
        expect(ms <= POLL_MAX_MS * 1.2).toBeTruthy();
      }
    }
    // A worse failure count is never asked sooner than a better one, whatever
    // the dice say — the ±20% bands do not overlap across a doubling.
    expect(pollDelayMs(3, { rand: () => 0 }) > pollDelayMs(2, { rand: () => 1 })).toBeTruthy();
  });

  test('a zero jitter is honoured, for a caller that wants exactness', () => {
    expect(pollDelayMs(0, { jitter: 0, rand: () => 0 })).toBe(POLL_BASE_MS);
    expect(pollDelayMs(3, { jitter: 0, rand: () => 1 })).toBe(POLL_BASE_MS * 4);
  });

  test('a caller may set its own cadence and ceiling', () => {
    expect(pollDelayMs(0, { base: 1000, jitter: 0, rand: mid })).toBe(1000);
    expect(pollDelayMs(9, { base: 1000, max: 4000, jitter: 0, rand: mid })).toBe(4000);
    // A ceiling below the base is nonsense; the base wins rather than the delay
    // collapsing to something that hammers harder than the healthy rate.
    expect(pollDelayMs(3, { base: 1000, max: 10, jitter: 0, rand: mid })).toBe(1000);
  });
});

describe('poll schedule · the six-hour reload', () => {
  test('REGRESSION: a batch of displays does not reload in unison', () => {
    const six = 6 * 60 * 60 * 1000;
    expect(jittered(six, 0.05, mid)).toBe(six);
    const lo = jittered(six, 0.05, () => 0);
    const hi = jittered(six, 0.05, () => 1);
    expect(hi - lo).toBe(Math.round(six * 0.1));   // ±18 min of spread
    expect(lo > 0).toBeTruthy();
  });

  test('it stays a positive delay for any input', () => {
    expect(jittered(0, 0.5, () => 0) > 0).toBeTruthy();
    expect(jittered(-5, 0.5, () => 0) > 0).toBeTruthy();
    expect(jittered(100, 5, () => 0) > 0).toBeTruthy();   // frac clamped to 1
  });
});

describe('poll schedule · the loop itself', () => {
  // A fake clock: timers are run by hand, so a 5-minute backoff costs nothing.
  function clock() {
    const q = new Map();
    let id = 0, now = 0;
    return {
      setTimer: (fn, ms) => { q.set(++id, { fn, at: now + ms }); return id; },
      clearTimer: (i) => q.delete(i),
      pending: () => [...q.values()].map(e => e.at - now),
      /** Run every timer that is due, once. */
      async advance(ms) {
        now += ms;
        for (const [i, e] of [...q]) if (e.at <= now) { q.delete(i); await e.fn(); }
      },
      size: () => q.size,
    };
  }
  const poller = (attempt, c, delay = f => (f ? 100 * 2 ** (f - 1) : 100)) =>
    createPoller(attempt, { delay, setTimer: c.setTimer, clearTimer: c.clearTimer });

  test('it fetches at once, then arms itself', async () => {
    const c = clock();
    let calls = 0;
    const p = poller(() => { calls++; return true; }, c);
    p.start();
    await Promise.resolve();
    expect(calls).toBe(1);            // no waiting for the first render's data
    expect(c.pending()).toEqual([100]);
    await c.advance(100);
    expect(calls).toBe(2);
  });

  test('REGRESSION: consecutive failures stretch the gap', async () => {
    const c = clock();
    const p = poller(() => false, c);
    p.start();
    await Promise.resolve();
    expect(c.pending()).toEqual([100]);
    await c.advance(100);
    expect(c.pending()).toEqual([200]);
    await c.advance(200);
    expect(c.pending()).toEqual([400]);
    expect(p.fails).toBe(3);
  });

  test('one success puts it straight back on cadence', async () => {
    const c = clock();
    let ok = false;
    const p = poller(() => ok, c);
    p.start();
    await Promise.resolve();
    await c.advance(100);
    expect(p.fails).toBe(2);
    ok = true;
    await c.advance(200);
    expect(p.fails).toBe(0);
    expect(c.pending()).toEqual([100]);
  });

  test('REGRESSION: a slow answer does not stack up requests', async () => {
    const c = clock();
    let inFlight = 0, overlapped = false, release;
    const p = poller(async () => {
      if (++inFlight > 1) overlapped = true;
      await new Promise(r => { release = r; });
      inFlight--;
      return true;
    }, c);
    p.start();
    await Promise.resolve();
    // While the first attempt hangs, nothing else may be armed — setInterval
    // would have fired again and again straight past it.
    expect(c.size()).toBe(0);
    release();
    await Promise.resolve(); await Promise.resolve();
    expect(overlapped).toBeFalsy();
    expect(c.size()).toBe(1);
  });

  test('REGRESSION: stopping mid-flight does not resurrect the poll', async () => {
    const c = clock();
    let release;
    const p = poller(async () => { await new Promise(r => { release = r; }); return true; }, c);
    p.start();
    await Promise.resolve();
    p.stop();                       // the slot left the playlist while in flight
    release();
    await Promise.resolve(); await Promise.resolve();
    expect(c.size()).toBe(0);
    expect(p.active).toBeFalsy();
  });

  test('a thrown attempt counts as a failure, it does not kill the loop', async () => {
    const c = clock();
    let n = 0;
    const p = poller(() => { n++; throw new Error('offline'); }, c);
    p.start();
    await Promise.resolve();
    expect(c.pending()).toEqual([100]);
    await c.advance(100);
    expect(n).toBe(2);              // still going
  });

  test('start() twice is one loop, not two', async () => {
    const c = clock();
    let n = 0;
    const p = poller(() => { n++; return true; }, c);
    p.start(); p.start();
    await Promise.resolve();
    expect(n).toBe(1);
    expect(c.size()).toBe(1);
  });
});
