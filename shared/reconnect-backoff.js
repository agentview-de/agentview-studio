// How long to wait before the next reconnect attempt.
//
// The Studio's event stream used to wait a flat five seconds, forever. Two
// things are wrong with that. A server that is down gets hammered by every open
// editor at the same cadence — and because every editor lost the stream at the
// same moment, they retry in lockstep, which is exactly the shape of a
// thundering herd. And five seconds never becomes five minutes, so a stream
// that is down for an hour costs 720 pointless requests per editor.
//
// Exponential with jitter fixes both: the interval grows towards a cap, and the
// jitter spreads clients that dropped together. `rand` is injectable so the
// schedule can be tested without randomness (test/reconnect-backoff.test.js).

/**
 * @param {number} attempt  1 for the first retry after a working connection.
 * @param {{ base?: number, cap?: number, jitter?: number, rand?: () => number }} [opts]
 *   base   delay for attempt 1, in ms (doubles per attempt)
 *   cap    upper bound before jitter, in ms
 *   jitter fraction of the delay to spread over, ±; 0 disables it
 * @returns {number} milliseconds to wait, never negative and never above `cap`.
 */
export function backoffDelay(attempt, { base = 1000, cap = 60_000, jitter = 0.25, rand = Math.random } = {}) {
  const n = Math.max(1, Math.floor(attempt) || 1);
  // 2 ** (n - 1) overflows to Infinity long before it matters; min() handles it.
  const raw = Math.min(cap, base * 2 ** (n - 1));
  if (!jitter) return Math.round(raw);
  const spread = raw * jitter;
  const jittered = raw - spread + rand() * spread * 2;
  return Math.round(Math.max(0, Math.min(cap, jittered)));
}
