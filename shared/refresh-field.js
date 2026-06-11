// Schema-field factory for the auto-refresh interval — return it straight
// into a plugin's schema().fields. EVERY live/network widget (data-table,
// chart, kpi-cards, currency, …) uses this ONE definition so the key
// ('refreshSec'), the duration control, and the '0 = once' sentinel read the
// same everywhere — and long-running displays stop going stale because a
// widget simply forgot to offer the knob.
//
// The value is SECONDS (type 'duration' per the seconds convention; never a
// plain number field). 0 means "fetch once at render". The render side is
// responsible for the 5-second floor — clamp positive values UP via
// `Math.max(5000, refreshSec * 1000)` (data-table.js is the reference) so a
// stray "2" polls every 5 s instead of silently never refreshing.
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
