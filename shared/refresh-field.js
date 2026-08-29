// Schema-field factory for the auto-refresh interval — return it straight
// into a plugin's schema().fields. EVERY live/network widget (data-table,
// chart, kpi-cards, currency, …) uses this ONE definition so the key
// ('refreshSec'), the duration control, and the '0 = once' sentinel read the
// same everywhere — and long-running displays stop going stale because a
// widget simply forgot to offer the knob.
//
// The value is SECONDS (type 'duration' per the seconds convention; never a
// plain number field). 0 means "fetch once at render", and the render side
// turns the number into a timer with refreshIntervalMs() below.
//
// opts: { label?, help?, min?, showIf? } — label/help override the canonical
// wording (pass help: '' to suppress the help line entirely), min defaults to
// 0 so the '0 = once' sentinel stays reachable, showIf passes through (the
// usual gate is live/url mode, e.g. `c => c.source === 'url'`).
export function refreshSecField(opts = {}) {
  const f = {
    key: 'refreshSec', type: 'duration',
    label: opts.label ?? 'Refresh every (0 = once)',
    min: opts.min ?? 0,
    help: opts.help ?? 'Polls the source on a timer so long-running displays stay current. Positive values below 5 seconds are raised to the 5-second player minimum.',
  };
  if (opts.showIf) f.showIf = opts.showIf;
  return f;
}

// The render-side half of the same field: seconds in, milliseconds out.
//
// The 5-second floor used to be prose — "clamp positive values UP via
// Math.max(5000, refreshSec * 1000), data-table.js is the reference" — and
// THIRTEEN widgets each wrote that expression by hand. All thirteen got it
// right, which is exactly the situation in which the fourteenth will not: a
// display polling somebody's API every second is a small denial-of-service
// that runs unattended, and nothing in the code would have said so.
//
// 0 (or anything that is not a positive number) means "fetch once" — the
// caller arms no timer at all.
export const REFRESH_MIN_MS = 5000;

export function refreshIntervalMs(refreshSec, { min = REFRESH_MIN_MS } = {}) {
  const sec = Number(refreshSec);
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  return Math.max(min, Math.round(sec * 1000));
}
