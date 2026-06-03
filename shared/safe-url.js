// Safe URL helpers. Used wherever a URL drops into a CSS context — CSS
// `url('…')` can be escaped out of via embedded `)` or `'` even after HTML
// entity escaping. The whitelisted protocols + canonical quoting here are the
// minimum to keep untrusted URLs (asset library, RSS feeds, AI-authored slide
// JSON) from injecting CSS rules.

// Accept only http(s), data:image/, and relative paths. Reject `javascript:`,
// `vbscript:`, `file:`, and anything we can't recognise.
export function isSafeImgUrl(s) {
  const v = String(s ?? '').trim();
  if (!v) return false;
  // Protocol-relative URLs (`//evil.com/x.png`) inherit the page scheme and load
  // from an arbitrary host. Reject them before the relative-path check below,
  // which would otherwise accept them on the leading `/`. (Privacy/SSRF probing.)
  if (/^\/\//.test(v)) return false;
  if (/^https?:\/\//i.test(v)) return true;
  if (/^data:image\//i.test(v)) return true;
  if (/^(\/|\.\/|\.\.\/)/.test(v)) return true;
  // No scheme at all (e.g. "foo.png") = treat as relative.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) return true;
  return false;
}

// Returns a CSS `url(...)` value with the URL safely encoded — usable inside
// a `style="..."` attribute. Returns empty string for unsafe URLs so the
// caller's CSS rule degrades cleanly (no background, not broken syntax).
//
// JSON.stringify yields `"…"` with embedded `"` escaped — `url("…")` accepts
// double-quoted strings per CSS spec. encodeURI on top handles parens and any
// remaining unescaped chars that could break the function call.
export function cssUrl(url) {
  if (!isSafeImgUrl(url)) return '';
  const safe = encodeURI(String(url).trim())
    .replace(/"/g, '%22')
    .replace(/\)/g, '%29');
  return `url("${safe}")`;
}
