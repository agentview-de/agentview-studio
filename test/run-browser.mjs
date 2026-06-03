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
  { name: 'browser suite', path: '/test/index.html' },
  { name: 'canvas z-order', path: '/test/canvas-zorder.test.html' },
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

// --- drive the pages --------------------------------------------------------
let totalPass = 0;
let totalFail = 0;
let hadError = false;

try {
  await waitForServer(`http://localhost:${PORT}/index.html`);
  const browser = await chromium.launch();
  try {
    for (const page of PAGES) {
      const ctx = await browser.newContext();
      const tab = await ctx.newPage();
      const consoleErrors = [];
      tab.on('pageerror', e => consoleErrors.push(String(e?.stack || e?.message || e)));
      tab.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

      const url = `http://localhost:${PORT}${page.path}`;
      await tab.goto(url, { waitUntil: 'load' });

      let results;
      try {
        results = await tab.waitForFunction(
          () => window.__TEST_RESULTS__ || null,
          { timeout: 20000 },
        ).then(h => h.jsonValue());
      } catch {
        hadError = true;
        const boot = await tab.$eval('#boot-error', el => el.textContent).catch(() => '');
        console.error(`\n✗ ${page.name} (${page.path}) never produced results.` +
          (boot ? `\n  boot error: ${boot.trim()}` : ''));
        await ctx.close();
        continue;
      }

      totalPass += results.pass;
      totalFail += results.fail;
      const failures = results.results.filter(r => !r.ok);
      const mark = results.fail === 0 ? '✓' : '✗';
      console.log(`${mark} ${page.name}: ${results.pass}/${results.total} passed` +
        (results.fail ? `, ${results.fail} FAILED` : ''));
      for (const f of failures) {
        console.error(`    ✗ ${f.suite} › ${f.name}`);
      }
      // Console/page errors that didn't already fail an assertion are still a smell.
      if (consoleErrors.length && results.fail === 0) {
        // The widget-host suite intentionally logs a "fake Error: boom" — ignore that.
        const real = consoleErrors.filter(e => !/fake Error: boom|widget render failed/i.test(e));
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
