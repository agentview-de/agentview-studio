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
  // escape.test.js / sanitize.test.js are intentionally absent — they assert
  // real DOM attribute/HTML safety and only run in the browser suite.
  './safe-url.test.js',
  './module-graph.test.js',
  './live-source.test.js',
  './field-control-registry.test.js',
  './widget-host.test.js',
  './admin-tab-shell.test.js',
  './canvas-geo.test.js',
  './migrate.test.js',
  // animations.test.js is pure logic (animation catalogs + schema round-trip);
  // it imports shared/animations.js + shared/slide-schema.js, neither of which
  // touches the DOM, so it is safe to run headlessly here too.
  './animations.test.js',
  // Pure shared resolvers — no DOM, no network, no real timers/randomness.
  './scheduler.test.js',
  './variant-resolver.test.js',
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
  // Weather widget pure formatters (colour ramp, compass, KPI subtitles).
  './weather-format.test.js',
  // Pure canvas viewport + snap math (zoom transforms, edge/centre snapping).
  './canvas-math.test.js',
  // Pure table-markup builder used by the rich-text editor.
  './rich-text-table.test.js',
  // API client pure decisions: auth-header selection + URL/proxy resolution.
  './api-url.test.js',
  // Importer file-type routing + the CSV/JSON pure parse cores.
  './importers.test.js',
];

for (const s of suites) {
  try {
    await import(s);
  } catch (e) {
    // A suite that hasn't been written yet (or fails to import) shouldn't abort
    // the others — report and continue so the rest still run.
    console.error(`! could not load ${s}: ${e.message}`);
  }
}

const { fail } = await runAllConsole();
process.exit(fail === 0 ? 0 : 1);
