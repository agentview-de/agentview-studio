// Headless test driver for the DOM-free suites — fast iteration loop and CI.
//
//   node test/run-node.mjs
//
// Runs the pure-function suites under Node (no browser). The browser remains the
// full source of truth (test/index.html) — DOM-dependent suites (sanitize, the
// plugin/schema round-trips) run there. Keep this list to suites that import
// nothing DOM-bound at module load or assertion time. Exit code: 0 pass, 1 fail.
import { runAllConsole } from './runner.js';

const suites = [
  // sanitize.test.js is intentionally absent — it asserts real DOM HTML safety
  // and only runs in the browser suite. plugin-resilience.test.js is absent for
  // the same reason: it MOUNTS all 38 plugins into a real document. escape.test.js used to be excluded for
  // the same reason, but only ONE of its cases needs a DOM (it self-skips now):
  // escapeHtml is the single escape implementation for the whole app, so its
  // tests belong in the run everybody actually executes.
  './escape.test.js',
  './safe-url.test.js',
  './module-graph.test.js',
  './live-source.test.js',
  './field-control-registry.test.js',
  './widget-host.test.js',
  // Theme-aware widget-bg fallback shared by canvas + player (fake-element DOM).
  './background.test.js',
  './admin-tab-shell.test.js',
  // Admin Tab-Shell pure response helper (list-envelope unwrapping).
  './shell.test.js',
  './canvas-geo.test.js',
  // Shape catalog geometry + the shape plugin's pure fill/schema logic. Pure
  // data and pure predicates; the DRAWN result lives in /tools/shape-sheet.html.
  './shapes.test.js',
  // Align / distribute / match-size / group-move for a multi-widget
  // selection. Pure geometry; the canvas wiring is exercised in the browser.
  './arrange.test.js',
  // Hide / lock / rename / restack — the Layers panel's model. Pure; the panel
  // itself is DOM and lives in the browser suite.
  './layers.test.js',
  // The slide master: the resolver, and the ordering promise it rests on.
  './master.test.js',
  // Print/PDF export: how the deck is cut into pages and what shape they are.
  './export-print.test.js',
  // Change Case: the character transform behind the Aa button.
  './text-case.test.js',
  // Format painter: what "make this look like that" carries, and what it does not.
  './format-painter.test.js',
  './migrate.test.js',
  // animations.test.js is pure logic (animation catalogs + schema round-trip);
  // it imports shared/animations.js + shared/slide-schema.js, neither of which
  // touches the DOM, so it is safe to run headlessly here too.
  './animations.test.js',
  // Pure shared resolvers — no DOM, no network, no real timers/randomness.
  './scheduler.test.js',
  './variant-resolver.test.js',
  // Variant-edit persist seam (before/after-persist bus hooks own the swap).
  './variant-ctx.test.js',
  './binding-resolver.test.js',
  './ics-parse.test.js',
  // Pure string transforms — store-template editor preview + slot-ref discovery.
  './store-template-preview.test.js',
  // Publish bundler seams — globals preamble + </script breakout escaping.
  // publish.js imports only shared/module-graph.js (pure) at load time.
  './publish.test.js',
  // Vendor-inline runtime resolver (DOM-free paths: null fallback + src/data lookup).
  './inline-vendor.test.js',
  // "Provide data offline" pure helpers — slug, stored-widget walk, shipped copy.
  './offline-data.test.js',
  // Multi-feed fetch+parse pipeline (rss/news-photos live + offline provisioning).
  './feeds.test.js',
  // Reactive store deep-Proxy: identity stability + path notification.
  // store.js touches localStorage/setTimeout only inside functions, not at load.
  './store.test.js',
  // Undo/redo: the pure stack, plus the two store cases that were timing bugs
  // (ctrl+Z inside the commit debounce; the missing baseline on load).
  './undo-stack.test.js',
  // Re-entrancy guards for async refreshes — coalescing bursts (fleet refresh)
  // and dropping stale answers (asset search).
  './async-refresh.test.js',
  // Reconnect schedule for the event stream (exponential, capped, jittered).
  './reconnect-backoff.test.js',
  // The two strings the player puts on a screen itself (banner), localised by
  // the display's own language setting.
  './player-messages.test.js',
  // Canvas colours: a gradient stop throws where fillStyle silently ignores.
  './css-color.test.js',
  // Which field is "the id of a display group" — the endpoints take categoryId.
  './category-id.test.js',
  // Weather widget pure formatters (colour ramp, compass, KPI subtitles).
  './weather-format.test.js',
  // Pure canvas viewport + snap math (zoom transforms, edge/centre snapping).
  './canvas-math.test.js',
  // Smart guides: even spacing, size matching, margins, grid — and the order
  // they run in, which is what decides whether the canvas feels helpful.
  './smart-snap.test.js',
  // Pure table-markup builder used by the rich-text editor.
  './rich-text-table.test.js',
  // API client pure decisions: auth-header selection + URL/proxy resolution.
  './api-url.test.js',
  // Display capability three-state reader — pins that a MISSING flag makes no
  // claim, which is the bug the drawer shipped with.
  './display-capabilities.test.js',
  // Design catalog + the icon derived from each design rects.
  './designs.test.js',
  // The slide-set template catalog. Pure: buildPlaylist takes an injectable
  // plugin lookup, so the whole store's content is checkable headlessly.
  './templates.test.js',
  // Pure logic of the four widgets the template catalog needed: the queue
  // board, the leaderboard, the opening-hours clock and the steps panel.
  './new-widgets.test.js',
  // Player front door: only a real playlist may be applied or cached.
  './playlist-response.test.js',
  // Day-parting re-check: cursor bookkeeping when the visible set changes.
  './schedule-reconcile.test.js',
  // URL-probe verdict: the status is judged for every kind, JSON included.
  './probe-verdict.test.js',
  // Importer file-type routing + the CSV/JSON pure parse cores.
  './importers.test.js',
  // Plugin contract + schema shape validation across all registered widgets.
  // Imports every plugin module but never calls render(), so it stays
  // DOM-free as long as plugins keep DOM work out of module top level.
  './schema.test.js',
  // Custom-widget engine pure transforms (tokens/filters/CSS scope+sanitize).
  // The DOM sanitize cases self-skip under node; the browser suite runs them.
  './custom-template.test.js',
  // "My widgets" store: pure entry helpers + in-memory storage round-trip.
  './custom-widgets.test.js',
  // Inspector/Designer field-tier filter (pure) — basic vs all.
  './tier-filter.test.js',
  // Shared collapsible-section storage convention (both inspector builders).
  './fold-section.test.js',
  // Shared brand-kit colour grid (slide / playlist / org editors).
  './brand-kit-form.test.js',
  // Widget Designer "Looks" galleries — shape + every patch key is a real field.
  './looks.test.js',
  // Multi-display sync: the shared timeline AND the tick that keeps two screens
  // on one wall showing the same slide (simulated over an hour, both ways).
  './sync-clock.test.js',
  // The calendar widget's five views — multi-day events, escaping, locale.
  './calendar-views.test.js',
  // "Text in Slides aufteilen" — one slide per heading, heading included.
  './smart-split.test.js',
  // One way to write a server timestamp — the Studio's language, everywhere.
  './format-date.test.js',
  './format-bytes.test.js',
  // The sandbox invariant for the two web-embed widgets — the DOM half of
  // this suite skips itself here and runs in the browser page.
  './web-embed.test.js',
  './refresh-field.test.js',
  './poll-schedule.test.js',
  './plugin-network.test.js',
  './format-number.test.js',
  './current-slide.test.js',
];

// A suite that fails to import must not abort the others — but it MUST fail the
// run. It used to only print a warning, so the suite silently vanished from the
// count and the run still exited 0 and said "All N tests passed". That is how a
// broken import ships: the number quietly drops and nothing goes red. (Found by
// exactly that: a missing import took shell.test.js out and the run still
// reported success, four tests lighter.)
const loadErrors = [];
for (const s of suites) {
  try {
    await import(s);
  } catch (e) {
    loadErrors.push({ suite: s, message: e?.message ?? String(e) });
    console.error(`! could not load ${s}: ${e.message}`);
  }
}

const { fail } = await runAllConsole();
if (loadErrors.length) {
  console.error(`\n✗ ${loadErrors.length} suite(s) could not be loaded — their tests did not run:`);
  for (const e of loadErrors) console.error(`    ${e.suite}: ${e.message}`);
}
process.exit(fail === 0 && loadErrors.length === 0 ? 0 : 1);
