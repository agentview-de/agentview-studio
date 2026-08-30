// Wait until the app's REAL web fonts are decoded and usable — not just until
// the font set happens to be idle.
//
// `await document.fonts.ready` is the obvious call and it is a trap when you
// call it before anything has been rendered. The set only tracks faces some
// laid-out text has actually asked for, so on an empty page there is nothing
// pending and the promise resolves immediately. Every measurement taken after
// that reads the FALLBACK face: `font-display: swap` paints in it and swaps
// later, so the numbers are the system font's, not Inter's.
//
// That is invisible on a machine where the fallback resolves to something
// Inter-like and brutal on one where it does not. It cost a red CI run: the
// template legibility gate passed on Windows and reported five slides clipped
// on the Linux runner, all of them horizontally, all of them DejaVu Sans being
// wider than Inter.
//
// Loading every declared @font-face up front removes the machine from the
// measurement — the same reason the browser runner pins locale and timezone.
// A face that fails to fetch is skipped rather than thrown: a missing woff2
// should show up as the layout being wrong, not as a bootstrap crash.
export async function fontsLoaded() {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all([...document.fonts].map(f => f.load().catch(() => {})));
  await document.fonts.ready;
}
