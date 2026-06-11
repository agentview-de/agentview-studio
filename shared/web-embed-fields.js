// Shared schema fields for the two web-embedding widgets (iframe.js,
// embed.js's URL mode) — the url / reloadSec / sandbox / permission set.
// Centralised (like media-fit.js / widget-color.js) so the security wording
// and validate logic cannot drift between the two widgets again: they explain
// the IDENTICAL trade-off and must do so identically.
//
// ── THE SANDBOX INVARIANT ───────────────────────────────────────────────────
// NEVER grant 'allow-same-origin'. Combined with 'allow-scripts' it is the
// classic sandbox escape: the framed page gains same-origin access to the
// player's DOM, storage and cookies, and can strip its own sandbox attribute.
// Permission toggles here only ever ADD harmless tokens (allow-forms,
// allow-popups) on top of 'allow-scripts'; sandboxTokens() below is the one
// place the token string is assembled, so the invariant is enforced in code,
// not just documented. Any future toggle must extend that list — never
// replace the approach, and never with 'allow-same-origin'.
// ─────────────────────────────────────────────────────────────────────────────

// Mixed-content validator shared by every URL field that ends up rendered on
// an https player (web embeds, remote JSON, camera streams): browsers block
// plain-http subresources/frames on https pages, so the URL "works" in the
// editor preview on http://localhost and then silently fails on the display.
// Returns an inspector validate() result ({ level, message }) or null when fine.
export function mixedContentWarning(url) {
  return /^http:\/\//i.test(String(url ?? '').trim())
    ? { level: 'warn', message: 'http:// URLs are blocked as mixed content on https displays — use an https:// URL where possible.' }
    : null;
}

// Spread into a plugin's schema().fields. Emits the shared url, reloadSec,
// sandbox and permission fields with the canonical labels/help. The keys match
// the stored shapes of both widgets (url / reloadSec / sandbox) so existing
// content keeps working; allowForms/allowPopups are additive (widgets should
// default both to false in defaults()).
//
// opts: { showIf?, reloadShowIf? } — showIf gates the URL-mode-only fields
// (url + reloadSec); embed.js passes its `c => (c.mode ?? 'url') === 'url'`
// gate, iframe.js omits it. reloadShowIf overrides the gate for reloadSec
// alone (defaults to showIf) for widgets that reload in non-URL modes too.
export function webEmbedFields(opts = {}) {
  const gated = (f, showIf) => (showIf ? { ...f, showIf } : f);
  return [
    gated({ key: 'url', type: 'url', label: 'Web URL', test: 'embed', placeholder: 'https://…',
      help: 'Many sites block iframe embedding (X-Frame-Options/CSP). Keep Sandbox on for unknown sources.',
      validate: (v) => mixedContentWarning(v) }, opts.showIf),
    gated({ key: 'reloadSec', type: 'duration', label: 'Reload every (0 = never)', min: 0,
      help: 'Refresh the page on a timer so embedded dashboards / status pages stay live. Intervals under 5 seconds are ignored to protect the player.',
      validate: (v) => {
        const s = Number(v) || 0;
        return s > 0 && s < 5
          ? { level: 'warn', message: 'Intervals under 5 seconds are ignored to protect the player.' }
          : null;
      } }, opts.reloadShowIf ?? opts.showIf),
    { key: 'sandbox', type: 'toggle', label: 'Sandbox (allow-scripts only)',
      help: '⚠️ On = scripts only, isolated from the player (no same-origin access). Off = the embedded page can navigate the whole player away, open popups, and trigger downloads. Only disable for fully trusted internal URLs.' },
    { key: 'allowForms', type: 'toggle', label: 'Allow forms',
      showIf: c => c.sandbox !== false,
      help: 'Adds the allow-forms sandbox token so trusted internal tools (e.g. a shop-floor terminal with a login form) work without disabling the sandbox entirely. Never grants same-origin access.' },
    { key: 'allowPopups', type: 'toggle', label: 'Allow popups',
      showIf: c => c.sandbox !== false,
      help: 'Adds the allow-popups sandbox token. Leave off for signage — a popup can cover the whole screen.' },
  ];
}

// Spread into a plugin's defaults() — the shared keys only; widget-specific
// knobs (scale, background, mode, html, …) stay in each plugin's defaults.
export function webEmbedDefaults() {
  return { url: '', reloadSec: 0, sandbox: true, allowForms: false, allowPopups: false };
}

// Render-side seam: the sandbox attribute value for the embed <iframe>, or
// null when the user explicitly disabled sandboxing (sandbox === false →
// don't set the attribute at all). This is the ONLY place the token string is
// built — see the invariant note above; 'allow-same-origin' must never appear.
export function sandboxTokens(content) {
  const c = content ?? {};
  if (c.sandbox === false) return null;
  const tokens = ['allow-scripts'];
  if (c.allowForms) tokens.push('allow-forms');
  if (c.allowPopups) tokens.push('allow-popups');
  return tokens.join(' ');
}
