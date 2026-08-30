// Headless browser test driver — the CI gate for the DOM-dependent suites that
// the Node runner deliberately skips (sanitize, schema, slide round-trip, the
// canvas z-order/hit-testing integration suite). The browser remains the source
// of truth; this just drives test/index.html + canvas-zorder.test.html in
// headless Chromium and fails the build on any failing assertion or boot error.
//
//   node test/run-browser.mjs
//
// Requires the dev devDependencies (playwright) and a Chromium binary:
//   npm install && npx playwright install --with-deps chromium
//
// Exit code: 0 = all green, 1 = a test failed / a page failed to boot / Chromium
// is missing. The dev server (server.mjs) is spawned on a fixed port and torn
// down on exit.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PORT = Number(process.env.TEST_PORT ?? 8190);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = [
  // `expect` marks console output a page legitimately produces. Everything
  // else is reported, so the console stays a signal rather than a stream.
  { name: 'browser suite', path: '/test/index.html', expect: /fake Error: boom|widget render failed/i },
  // The page that loads the editor's own stylesheet: z-order and hit-testing,
  // and anything else only real CSS can answer.
  { name: 'editor CSS', path: '/test/canvas-zorder.test.html' },
  // Opens real dialogs — they fade for 200 ms and hold the page inert while
  // they are up, which is more than the shared page's budget can absorb.
  // The declared line is Chrome saying the finding out loud: the sandboxed
  // frame refuses confirm() and answers "no" instead. That is the measurement,
  // not noise.
  {
    name: 'dialogs',
    path: '/test/dialogs.test.html',
    expect: /Ignored call to 'confirm\(\)'|Failed to load resource|ERR_|net::/i,
  },
  // Boots the editor in an iframe and clicks the inspector's alignment row.
  // Its own page because the app boot is slow and the shared suite has a
  // budget; the editor legitimately fetches things it cannot reach here.
  {
    name: 'inspector alignment',
    path: '/test/inspector-align.test.html',
    expect: /Failed to load resource|ERR_|net::/i,
  },
  // Builds the real publish bundle and boots it — the only check that the
  // artefact those pieces produce actually plays.
  { name: 'publish end-to-end', path: '/test/publish-e2e.test.html' },
  // Mounts all 38 plugins at once and lets them settle: their <img>/<video>
  // sources try to load for real (relative demo URLs resolve against /test/ and
  // 404) and a widget whose vendor library is absent says so. That is the point
  // of the page, not a smell.
  // Nine admin views, each fetching on activation and none with a teardown to
  // await: one request escapes the stub per run. Expected here, nowhere else.
  {
    name: 'Verwaltung & Displays',
    path: '/test/admin-tabs.test.html',
    expect: /Failed to load resource|ERR_|net::/i,
  },
  {
    name: 'plugin resilience',
    path: '/test/plugin-resilience.test.html',
    expect: /Failed to load resource|pdf\.js not loaded|PDF render error|ERR_|net::/i,
  },
  // Renders all 97 template slides at their true design size, in both
  // languages, with the app's REAL stylesheets loaded — which is why it needs
  // its own page: every type size in the catalog is a cqmin clamp that only
  // exists in slide-themes.css, and the shared suite runs without app CSS.
  // The image widgets reach for demo URLs that 404 here, as everywhere else.
  {
    name: 'template & widget legibility',
    path: '/test/template-legibility.test.html',
    expect: /Failed to load resource|ERR_|net::/i,
  },
];

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('✗ playwright is not installed. Run: npm install && npx playwright install --with-deps chromium');
  process.exit(1);
}

// --- spawn the dev server ---------------------------------------------------
const server = spawn('node', ['server.mjs', '--no-browser', '--port', String(PORT)], {
  cwd: ROOT,
  stdio: ['ignore', 'ignore', 'inherit'],
});
const stopServer = () => { try { server.kill(); } catch { /* already gone */ } };
process.on('exit', stopServer);

async function waitForServer(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`dev server did not come up on ${url} within ${timeoutMs}ms`);
}

// --- the dev server's own guards --------------------------------------------
// This driver is the only place that runs server.mjs under test, so its two
// static-file rules are checked here rather than in a DOM suite: nothing may
// escape the repository root, and the repository around the app is not the
// app — `.git/config` can carry a token, node_modules is a few thousand files
// nothing here loads.
async function checkServerGuards(base) {
  const CASES = [
    ['/index.html', 200, 'the app itself is served'],
    ['/styles/tokens.css', 200, 'so are its assets'],
    // Only the ENCODED form is testable from here: fetch() (like every URL
    // parser) collapses a literal `/../` before the request is sent, so the
    // server never sees it. The raw form is a curl --path-as-is exercise.
    ['/%2e%2e%2fpackage.json', 403, 'an encoded traversal does not escape the root'],
    ['/%2e%2e%2f%2e%2e%2fWindows%2fwin.ini', 403, 'nor a longer one'],
    ['/.git/config', 404, 'the repository is not the app'],
    ['/node_modules/playwright/package.json', 404, 'neither are the dev dependencies'],
    // A proxy prefix matches a whole path SEGMENT: `/send` is an endpoint, not
    // a folder, and a plain startsWith sent `/sendungen.html` to the upstream
    // API instead of serving it from disk. The STATUS alone cannot show that —
    // the upstream answers 404 for those paths too, so the check would pass
    // for the wrong reason (it did, on the first attempt). The body is what
    // tells the two apart: only serveStatic writes "404 not found: <path>".
    ['/sendungen.html', 404, 'a static path is not swallowed by the /send prefix', '404 not found: /sendungen.html'],
    ['/database.html', 404, 'nor by /data/', '404 not found: /database.html'],
  ];
  let pass = 0;
  const failures = [];
  for (const [path, want, why, bodyStartsWith] of CASES) {
    let got = 0;
    let body = '';
    try {
      const res = await fetch(base + path, { redirect: 'manual' });
      got = res.status;
      if (bodyStartsWith) body = await res.text();
    } catch { got = -1; }
    const okStatus = got === want;
    const okBody = !bodyStartsWith || body.startsWith(bodyStartsWith);
    if (okStatus && okBody) pass++;
    else if (!okStatus) failures.push(`    ✗ dev server › ${why} (${path}: expected ${want}, got ${got})`);
    else failures.push(`    ✗ dev server › ${why} (${path}: body was ${JSON.stringify(body.slice(0, 60))})`);
  }
  console.log(`${failures.length ? '✗' : '✓'} dev server guards: ${pass}/${CASES.length} passed` +
    (failures.length ? `, ${failures.length} FAILED` : ''));
  for (const f of failures) console.error(f);
  return { pass, fail: failures.length };
}

// --- drive the pages --------------------------------------------------------
let totalPass = 0;
let totalFail = 0;
let hadError = false;

try {
  await waitForServer(`http://localhost:${PORT}/index.html`);
  const guards = await checkServerGuards(`http://localhost:${PORT}`);
  totalPass += guards.pass;
  totalFail += guards.fail;
  // Pin the machine OUT of the run.
  //
  // `newContext()` with no locale follows the developer's OS. A publish
  // end-to-end test asserted a price of "6,50" from a fixture that never set a
  // language — green on a German laptop, red on the English CI runner, and red
  // there since v1.5.0 while the local run reported every suite passing. A test
  // that only holds on one machine tests the machine.
  //
  // en-US and UTC because that is what CI already runs: a green run here now
  // means a green run there. A test that needs another language or another zone
  // says so in its own fixture, which is the only place it can be read.
  const CONTEXT = { locale: 'en-US', timezoneId: 'UTC' };

  // --expose-gc gives the page a real window.gc(), so a retention test can prove
  // that a torn-down slide is actually COLLECTED rather than merely dereferenced
  // (test/current-slide.test.js). Nothing else in the suite depends on it.
  const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] });
  try {
    for (const page of PAGES) {
      const ctx = await browser.newContext(CONTEXT);
      const tab = await ctx.newPage();
      const consoleErrors = [];
      tab.on('pageerror', e => consoleErrors.push(String(e?.stack || e?.message || e)));
      tab.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

      const url = `http://localhost:${PORT}${page.path}`;
      await tab.goto(url, { waitUntil: 'load' });
      const startedAt = Date.now();

      let results;
      try {
        results = await tab.waitForFunction(
          () => window.__TEST_RESULTS__ || null,
          // 20s was chosen when this page ran a few hundred tests; it now runs
          // fifteen hundred and has been the limiting factor three rounds
          // running — and it fails by reporting NOTHING, so the cost of being
          // close to it is invisible. The duration is printed below so growth
          // stays visible instead of surprising the next person.
          { timeout: 60000 },
        ).then(h => h.jsonValue());
      } catch {
        hadError = true;
        const boot = await tab.$eval('#boot-error', el => el.textContent).catch(() => '');
        // Where it stopped. Without this the message is "never produced
        // results" and nothing else — the same dead end three rounds running.
        const at = await tab.evaluate(() => window.__TEST_PROGRESS__ ?? null).catch(() => null);
        console.error(`\n✗ ${page.name} (${page.path}) never produced results.` +
          (at ? `\n  stopped in: ${at.suite} › ${at.test}  (after ${at.done} tests)` : '') +
          (boot ? `\n  boot error: ${boot.trim()}` : ''));
        await ctx.close();
        continue;
      }

      totalPass += results.pass;
      totalFail += results.fail;
      const failures = results.results.filter(r => !r.ok);
      const mark = results.fail === 0 ? '✓' : '✗';
      const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`${mark} ${page.name}: ${results.pass}/${results.total} passed` +
        (results.fail ? `, ${results.fail} FAILED` : '') + `  (${secs}s)`);
      for (const f of failures) {
        console.error(`    ✗ ${f.suite} › ${f.name}`);
        // …and WHY. The runner records the assertion message and this dropped
        // it on the floor, so every browser failure began with reproducing the
        // test by hand just to find out what the numbers actually were.
        if (f.err) console.error('      ' + String(f.err).replace(/\s+/g, ' ').slice(0, 300));
      }
      // Console/page errors that didn't already fail an assertion are still a smell.
      if (consoleErrors.length && results.fail === 0) {
        // Each page declares the output it legitimately produces (see PAGES).
        const real = page.expect ? consoleErrors.filter(e => !page.expect.test(e)) : consoleErrors;
        if (real.length) console.warn(`    ⚠ ${real.length} console error(s) on ${page.path}`);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
} catch (e) {
  console.error('✗ browser test driver failed:', e.message);
  hadError = true;
}

stopServer();

console.log(`\n${totalFail === 0 && !hadError ? '✓' : '✗'} browser suites: ${totalPass} passed, ${totalFail} failed`);
process.exit(totalFail === 0 && !hadError ? 0 : 1);
