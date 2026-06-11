// Injects the ticker scroll keyframes once per document (admin preview,
// fullscreen preview iframe, live player). Shared by rss.js (ticker mode) and
// ticker.js — both used to inject their own <style> guarded on the SAME
// element id ('bb-ticker-kf') but with DIFFERENT rule sets: rss.js only
// defined bb-ticker-scroll, so when an RSS widget rendered first on a page,
// ticker.js skipped its own injection and the rtl keyframe never existed —
// a 'Left to right' ticker silently showed a frozen track. This ONE helper
// always defines BOTH directions, so render order can't matter.
//
// Directions: bb-ticker-scroll moves a double-copied track right→left (the
// default for ltr text); bb-ticker-scroll-rtl moves left→right — the natural
// direction for Arabic / Hebrew content and a popular stylistic flip. Both
// animate to/from translateX(-50%), so a track holding two identical copies
// of its content loops seamlessly.
export function ensureTickerKeyframes() {
  if (document.getElementById('bb-ticker-kf')) return;
  const style = document.createElement('style');
  style.id = 'bb-ticker-kf';
  style.textContent =
    '@keyframes bb-ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }' +
    '@keyframes bb-ticker-scroll-rtl { from { transform: translateX(-50%); } to { transform: translateX(0); } }';
  document.head.appendChild(style);
}
