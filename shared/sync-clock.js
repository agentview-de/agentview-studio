// Server-time anchor based slide selection.
//
// Publish-flow stamps playlist.syncAnchor = { epochMs, slideMs[] } onto the
// playlist before bundling. Each display computes its current slide from the
// server clock without any push/pull coordination between displays:
//
//   currentIdx = the slot of ((Date.now() - epochMs) mod sum(slideMs))
//
// This works because:
//   • all displays share Date.now() (give or take their own clock drift)
//   • slideMs[] is the SAME on every display (it's in the bundled playlist)
//   • epochMs comes from the same publish event
//
// Knowing WHICH slide is only half of it: a display also has to flip at the
// same instant as its neighbour. That is what `remainingMs` is for — the
// player must arm its next tick at the END OF THE CURRENT SLOT, never at
// `now + slide.duration`. Waiting a full duration from whenever this display
// happened to tick keeps it permanently out of phase with the wall clock: two
// screens on the same wall, booted seven seconds apart, then showed DIFFERENT
// slides for 70 % of the time while both were, at each of their own ticks,
// picking the "right" index. See test/sync-clock.test.js.
//
// When syncAnchor is absent OR slideMs[] does not match the slide list (e.g.
// schedule excluded some), the caller should fall back to the existing
// per-display advance() loop in player/runtime.js.

// The floor BOTH ends of this feature apply to a slide duration. The anchor's
// timeline and the player's timer have to be built from the same number: while
// buildSyncAnchor floored at 1 s and the player at 2 s, a one-second slide was
// budgeted half the time it actually got, and every slide after it in the loop
// drifted away from the anchor for good.
export const SYNC_MIN_SEC = 2;

// The one duration fallback chain. The player reads
// `slide.duration ?? defaults.duration ?? 10`; the anchor used to read
// `+s.duration || 10` and never looked at the playlist defaults — so a playlist
// that set its duration once, at the top, produced an anchor running on a
// different timeline than the display it was built for.
export function slideDurationSec(slide, defaults) {
  const raw = slide?.duration ?? defaults?.duration ?? 10;
  const sec = Number.isFinite(+raw) && +raw > 0 ? +raw : 10;
  return Math.max(SYNC_MIN_SEC, sec);
}

// Where the shared clock stands right now:
//   { index, remainingMs, elapsedMs, totalMs }  — or null when the anchor
// cannot be used and the caller has to advance on its own.
export function syncedSlot(syncAnchor, slidesLength, now = Date.now()) {
  if (!syncAnchor || !Array.isArray(syncAnchor.slideMs) || !syncAnchor.slideMs.length) return null;
  if (!Number.isFinite(syncAnchor.epochMs)) return null;
  if (!Number.isInteger(slidesLength) || slidesLength <= 0) return null;
  if (syncAnchor.slideMs.length !== slidesLength) return null;

  // Coerce ONCE, here, and use that copy for both the sum and the walk. The two
  // used to disagree: the sum mapped a non-number to 0, the walk added it raw —
  // so a single "8000" out of a hand-edited bundle turned the accumulator into
  // a string and every display parked on the last slide.
  const ms = syncAnchor.slideMs.map(v => (Number.isFinite(+v) && +v > 0 ? +v : 0));
  const totalMs = ms.reduce((a, b) => a + b, 0);
  if (totalMs <= 0) return null;

  const elapsedMs = ((now - syncAnchor.epochMs) % totalMs + totalMs) % totalMs;
  let acc = 0;
  for (let i = 0; i < ms.length; i++) {
    acc += ms[i];
    if (elapsedMs < acc) return { index: i, remainingMs: acc - elapsedMs, elapsedMs, totalMs };
  }
  // Only reachable through floating-point dust at the very end of the loop.
  return { index: ms.length - 1, remainingMs: 0, elapsedMs, totalMs };
}

export function computeSyncedIndex(syncAnchor, slidesLength, now = Date.now()) {
  return syncedSlot(syncAnchor, slidesLength, now)?.index ?? null;
}

// Build a syncAnchor for a playlist. Used by publish-flow at deploy time.
// duration is in seconds; sync anchor uses milliseconds.
export function buildSyncAnchor(playlist, now = Date.now()) {
  if (!playlist?.slides?.length) return null;
  const slideMs = playlist.slides.map(s => slideDurationSec(s, playlist.defaults) * 1000);
  return { epochMs: now, slideMs };
}
