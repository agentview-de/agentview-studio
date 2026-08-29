// What a display's capabilities response actually justifies claiming.
//
// The per-display drawer answers one question: will my widget run on that
// screen? It used to answer it with `ft.supportsFetch !== false`, which is true
// for a reported YES *and* for a missing value — and the drawer sets `caps` to
// null on any failed request, so `features` was routinely `{}`. An unreachable
// display therefore rendered three confident badges (fetch, WebSockets,
// CSS-Vars) built from no data at all, while a display that explicitly reported
// "I cannot fetch" rendered nothing. Exactly backwards: the unknown case made a
// promise and the known-bad case stayed silent.
//
// Three states, never two. A missing value is not a NO and certainly not a YES —
// it is "never reported", and the caller renders that as its own message rather
// than as an empty badge row that looks like a clean bill of health.
//
// Pure: no DOM, no i18n, no markup. The drawer maps this to badges; the tests
// pin the decision itself (test/display-capabilities.test.js).

// Feature flags in report order. `label` is a technical token (a browser API
// name), deliberately not translated — "WebGL" is "WebGL" in every language.
export const FEATURE_FLAGS = Object.freeze([
  { key: 'supportsFetch',          label: 'fetch',    title: 'HTTP fetch()' },
  { key: 'supportsWebSockets',     label: 'WS',       title: 'WebSockets' },
  { key: 'supportsCssVariables',   label: 'CSS-Vars', title: 'CSS Custom Properties' },
  { key: 'supportsBackdropFilter', label: 'Backdrop', title: 'backdrop-filter' },
  { key: 'supportsWebGl',          label: 'WebGL',    title: 'WebGL' },
  { key: 'canRunCustomJavaScript', label: 'JS',       title: 'JavaScript' },
]);

/**
 * Reduce a capabilities response to what may be shown.
 *
 * @param {object|null} caps  The raw response, or null when the request failed.
 * @returns {{ reported: boolean, facts: Array, features: Array }}
 *   `reported` false  → no response at all; render a "not reported" note.
 *   `facts`           → [{ kind, text, title? }] hardware/software readouts.
 *   `features`        → [{ key, label, title, supported }] with supported
 *                       strictly true or false; unknown flags are omitted.
 */
export function readCapabilities(caps) {
  if (!caps || typeof caps !== 'object') return { reported: false, facts: [], features: [] };

  const rt = caps.runtime ?? {};
  const screen = rt.screen ?? caps.screen ?? {};
  const browser = rt.browser ?? {};
  const input = rt.input ?? {};
  const ft = rt.features ?? {};

  const facts = [];
  if (screen.width && screen.height) {
    const dpr = Number(screen.devicePixelRatio);
    const suffix = Number.isFinite(dpr) && dpr !== 1 ? ` @ ${dpr}x` : '';
    facts.push({ kind: 'resolution', text: `${screen.width}×${screen.height}${suffix}` });
  }
  if (browser.name) {
    const version = browser.major ?? browser.version ?? '';
    facts.push({ kind: 'browser', text: `${browser.name} ${version}`.trim() });
  }
  if (rt.platform?.name) facts.push({ kind: 'platform', text: String(rt.platform.name) });
  // === true, not truthy: the API sends booleans, and a stray "false" string or
  // a 0 must not read as touch support.
  if (input.hasTouch === true || rt.hasTouch === true) facts.push({ kind: 'touch', text: 'Touch' });

  const features = [];
  for (const flag of FEATURE_FLAGS) {
    const value = ft[flag.key];
    if (value === true || value === false) features.push({ ...flag, supported: value });
  }

  return { reported: true, facts, features };
}

/** Limitations the runtime reported about itself, as a clean list. */
export function readLimitations(caps) {
  const list = caps?.runtime?.knownLimitations;
  if (!Array.isArray(list)) return [];
  return list.map(x => String(x).trim()).filter(Boolean);
}
