// Canonical HTML escape helpers. Replaces the ~10 identical copies scattered
// across plugins. Keep this file dependency-free so anything can import it.
//
// escapeHtml: safe in HTML text content (between tags)
// escapeAttr: safe in double-quoted HTML attributes (also handles >/' for
//   tools that mix them, identical to escapeHtml in practice — kept as a
//   separate symbol so the intent at call sites is obvious)

const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => MAP[ch]);
}

export function escapeAttr(s) {
  return escapeHtml(s);
}
