// How often a display asks its server again.
//
// Two things go wrong when the answer is "always exactly every 30 seconds".
//
// NO BACKOFF. The player counted failures into `state.failCount` and printed
// them in the debug HUD, but nothing ever read that number to slow down. A
// display whose API key was revoked, or whose venue lost its uplink, kept
// asking every 30 s forever — 2 880 requests a day, per display, PER SLOT,
// every one of them refused. The storm is heaviest exactly when the server is
// least able to carry it, and it never lets up until someone walks to the
// screen.
//
// NO JITTER. Signage displays are provisioned, powered and rebooted in groups:
// a building's power returns, twenty screens boot within the same second, and
// from then on they poll on the same tick forever — the 6-hour hard reload
// re-synchronises them if anything drifts. Backoff alone does not fix that;
// it just makes the herd arrive together less often. The spread has to be
// there while things are HEALTHY, which is why jitter is applied to every
// delay and not only to the failing ones.
//
// The cap is what buys recovery: 30 s → 30 s → 1 → 2 → 4 → 5 min, so a
// display is never more than about five minutes behind a server that returns.

export const POLL_BASE_MS = 30_000;
export const POLL_MAX_MS = 5 * 60_000;

/**
 * The delay before the next attempt.
 *
 * @param {number} failCount  consecutive failures so far (0 = healthy)
 * @param {object} [opts]
 * @param {number} [opts.base]    healthy cadence, ms
 * @param {number} [opts.max]     ceiling for the backoff, ms
 * @param {number} [opts.jitter]  fraction of the delay to spread by, ±
 * @param {() => number} [opts.rand]  injectable for tests
 * @returns {number} ms, always ≥ 1
 */
export function pollDelayMs(failCount, {
  base = POLL_BASE_MS, max = POLL_MAX_MS, jitter = 0.2, rand = Math.random,
} = {}) {
  const b = Math.max(1, base);
  const n = Math.max(0, Math.floor(Number(failCount)) || 0);
  // 2 ** n overflows to Infinity long before a display has failed that often;
  // Math.min against the cap keeps it finite either way, but clamping the
  // exponent first keeps the arithmetic honest.
  // 2**(n-1), not 2**n: the FIRST retry stays on the normal cadence. A single
  // failed poll is a Wi-Fi hiccup, not an outage, and making a menu board wait
  // an extra minute for it costs freshness without sparing the server anything.
  const grown = n === 0 ? b : b * 2 ** Math.min(n - 1, 30);
  const target = Math.min(Math.max(b, max), grown);
  const spread = target * Math.max(0, Math.min(1, jitter));
  return Math.max(1, Math.round(target - spread + rand() * spread * 2));
}

/**
 * The same spread for one-shot timers — the 6-hour hard reload, above all.
 * Without it a batch of displays provisioned together reloads together, and
 * every reload re-fetches the playlist and every slot at the same instant.
 *
 * @param {number} ms
 * @param {number} [frac]  ± fraction to spread by
 * @param {() => number} [rand]
 */
export function jittered(ms, frac = 0.05, rand = Math.random) {
  const spread = Math.max(0, ms) * Math.max(0, Math.min(1, frac));
  return Math.max(1, Math.round(ms - spread + rand() * spread * 2));
}

/**
 * A self-arming poll loop.
 *
 * `setInterval` cannot do this job twice over: it cannot vary its cadence to
 * back off, and it keeps firing while a slow answer is still in flight, so a
 * struggling connection ends up carrying a growing pile of overlapping
 * requests. This waits for each attempt, then arms the next one from the
 * failure count.
 *
 * @param {() => Promise<boolean>|boolean} attempt  resolves truthy on success
 * @param {object} [opts]
 * @param {(fails: number) => number} [opts.delay]  ms until the next attempt
 * @param {typeof setTimeout} [opts.setTimer]
 * @param {typeof clearTimeout} [opts.clearTimer]
 */
export function createPoller(attempt, {
  delay = pollDelayMs, setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  let timer = null;
  let running = false;
  let fails = 0;

  async function tick() {
    timer = null;
    let ok = false;
    try { ok = !!(await attempt()); } catch { ok = false; }
    // Stopped while we awaited — arming here would resurrect a poll nobody
    // asked for, which is how a slot dropped from the playlist kept fetching.
    if (!running) return;
    fails = ok ? 0 : fails + 1;
    timer = setTimer(tick, delay(fails));
  }

  return {
    /** Runs the first attempt immediately, so the first render has data. */
    start() {
      if (running) return;
      running = true;
      tick();
    },
    stop() {
      running = false;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
    get fails() { return fails; },
    get active() { return running; },
  };
}
