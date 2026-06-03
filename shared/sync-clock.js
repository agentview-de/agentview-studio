// Server-time anchor based slide selection.
//
// Publish-flow stamps playlist.syncAnchor = { epochMs, slideMs[] } onto the
// playlist before bundling. Each display computes its current slide from the
// server clock without any push/pull coordination between displays:
//
//   currentIdx = floor((Date.now() - epochMs) / sum(slideMs)) % len
//
// This works because:
//   • all displays share Date.now() (give or take their own clock drift)
//   • slideMs[] is the SAME on every display (it's in the bundled playlist)
//   • epochMs comes from the same publish event
// → frame-accurate sync within ~one slide-tick.
//
// When syncAnchor is absent OR slideMs[] is shorter than the slide list (e.g.
// schedule excluded some), the caller should fall back to the existing
// per-display advance() loop in player/runtime.js.

export function computeSyncedIndex(syncAnchor, slidesLength, now = Date.now()) {
  if (!syncAnchor || !Array.isArray(syncAnchor.slideMs) || !syncAnchor.slideMs.length) return null;
  if (!Number.isFinite(syncAnchor.epochMs)) return null;
  if (!Number.isInteger(slidesLength) || slidesLength <= 0) return null;
  if (syncAnchor.slideMs.length !== slidesLength) return null;

  const total = syncAnchor.slideMs.reduce((a, b) => a + (Number.isFinite(+b) ? +b : 0), 0);
  if (total <= 0) return null;

  const elapsed = ((now - syncAnchor.epochMs) % total + total) % total;
  let acc = 0;
  for (let i = 0; i < syncAnchor.slideMs.length; i++) {
    acc += syncAnchor.slideMs[i];
    if (elapsed < acc) return i;
  }
  return syncAnchor.slideMs.length - 1;
}

// Build a syncAnchor for a playlist. Used by publish-flow at deploy time.
// duration is in seconds; sync anchor uses milliseconds.
export function buildSyncAnchor(playlist, now = Date.now()) {
  if (!playlist?.slides?.length) return null;
  const slideMs = playlist.slides.map(s => Math.max(1, +s.duration || 10) * 1000);
  return { epochMs: now, slideMs };
}
