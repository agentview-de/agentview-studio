// Shared schema fields for the remote-JSON data widgets (chart, kpi-cards,
// data-table, and progress when it gains its live mode) — the source /
// dataUrl / refreshSec trio. The three plugins used to hand-roll this set
// with diverging placeholders, help and (mostly missing) validate; one
// factory means one English string each, one German overlay key each, and
// validation that cannot drift. The keys (source, dataUrl, refreshSec) match
// the stored content shapes exactly, so existing slides keep working.

import { SOURCE_OPTIONS } from './offline-data.js';
import { refreshSecField } from './refresh-field.js';
import { mixedContentWarning } from './web-embed-fields.js';

// Spread into a plugin's schema().fields, typically right under the inline
// content field inside the 'Data' section. Emits:
//   source     — the inline / live URL / provided-offline select.
//   dataUrl    — type 'url' with test:'json' and a validate that warns when a
//                URL mode is selected but no URL is entered yet, and on
//                http:// mixed content. Only visible in the URL modes.
//   refreshSec — the shared duration field (see shared/refresh-field.js),
//                visible in live-URL mode only (offline data is refreshed by
//                the Studio, inline data never goes stale). Render side must
//                apply the 5-second floor: Math.max(5000, refreshSec * 1000).
//
// opts: { urlHelp?, placeholder? } — override the canonical dataUrl help /
// placeholder where a widget documents a specific JSON shape (data-table's
// array-of-objects note, for example).
export function remoteJsonFields(opts = {}) {
  return [
    { key: 'source', type: 'select', label: 'Data source', options: SOURCE_OPTIONS,
      help: 'Offline: the Studio fetches the JSON URL on “Refresh data” and stores it; the display reads that — no live call, no internet needed on the screen.' },
    { key: 'dataUrl', type: 'url', label: 'Remote JSON URL', test: 'json',
      showIf: c => c.source === 'url' || c.source === 'stored',
      placeholder: opts.placeholder ?? 'https://api.example.com/data.json',
      help: opts.urlHelp ?? 'Must return JSON and allow CORS for whichever side fetches it (display in Live mode, Studio in Offline mode).',
      validate: (v, c) => {
        const url = String(v ?? '').trim();
        // The field is only visible in the URL modes, but validate against the
        // mode anyway — a stale warning must not appear for inline content.
        if (!url) {
          return (c?.source === 'url' || c?.source === 'stored')
            ? { level: 'warn', message: 'Data source is set to a URL, but no URL is entered yet.' }
            : null;
        }
        return mixedContentWarning(url);
      } },
    refreshSecField({
      help: 'Polls the JSON URL on a timer so live data stays current. Positive values below 5 seconds are raised to the 5-second player minimum.',
      showIf: c => c.source === 'url',
    }),
  ];
}
