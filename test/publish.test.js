// Tests for the publish bundler's pure seams: the `window.BB_*` globals preamble
// and the `</script` breakout escaping. The full bundlePlayer() does a network
// fetch of display.html and walks the module graph (covered by module-graph
// tests), so here we exercise only the framework- and network-free helpers.

import { test, expect, describe } from './runner.js';
import { buildGlobalLines, escapeScriptBody, inlineLocalScripts, rewriteCssAssetUrls } from '../admin/publish.js';

// Fake resolver: maps any absolute URL to a deterministic asset URL by basename,
// so the font-url rewrite logic is exercised without a network round-trip.
const fakeResolve = async (absUrl) => 'https://assets.example/' + absUrl.split('/').pop();
// Fake fetcher: returns a stub script body keyed by path, no network.
const fakeFetch = async (path) => `/*${path}*/window.__loaded=(window.__loaded||0)+1;`;

describe('publish · escapeScriptBody', () => {
  test('neutralises a literal </script so it cannot close the inline tag', () => {
    const out = escapeScriptBody('var x = "</script>";');
    expect(out).notToContain('</script');
    expect(out).toContain('<\\/script');
  });

  test('is case-insensitive (</SCRIPT, </Script)', () => {
    expect(escapeScriptBody('a</SCRIPT b')).notToContain('</SCRIPT');
    expect(escapeScriptBody('a</Script b')).notToContain('</Script');
  });

  test('leaves ordinary content untouched', () => {
    expect(escapeScriptBody('window.X = 1;')).toBe('window.X = 1;');
  });
});

describe('publish · buildGlobalLines', () => {
  test('always emits BB_READ_URL and BB_STUDIO_VERSION first', () => {
    const lines = buildGlobalLines('https://r.example/abc', {});
    expect(lines[0]).toContain('window.BB_READ_URL');
    expect(lines[0]).toContain('https://r.example/abc');
    expect(lines[1]).toContain('window.BB_STUDIO_VERSION');
  });

  test('passes through well-named BB_ globals, JSON-encoded', () => {
    const lines = buildGlobalLines('', { BB_ORG_BRAND: { font: 'Inter' } });
    const joined = lines.join('');
    expect(joined).toContain('window.BB_ORG_BRAND = {"font":"Inter"};');
  });

  test('ignores badly-named keys and undefined values', () => {
    const lines = buildGlobalLines('', { notBB: 1, 'BB-bad': 2, BB_OK: undefined, BB_GOOD: 3 });
    const joined = lines.join('');
    expect(joined).notToContain('notBB');
    expect(joined).notToContain('BB-bad');
    expect(joined).notToContain('BB_OK'); // undefined value dropped
    expect(joined).toContain('window.BB_GOOD = 3;');
  });

  test('an owner brand value with </script cannot break out once escaped', () => {
    // Real attack shape: a font name that closes the script and opens a new one.
    const evil = '</script><script>alert(1)</script>';
    const lines = buildGlobalLines('', { BB_ORG_BRAND: { font: evil } });
    const scriptBody = escapeScriptBody(lines.join(''));
    // The exact value is still present (JSON-escaped) but no live `</script` remains.
    expect(scriptBody).notToContain('</script');
    expect(scriptBody).toContain('<\\/script');
  });
});

describe('publish · inlineLocalScripts', () => {
  const base = 'https://studio.example/display.html';

  test('inlines a local classic <script src> body (the asset store rejects .js)', async () => {
    const html = `<script src="shared/vendor/marked.min.js"></script>`;
    const out = await inlineLocalScripts(html, base, fakeFetch);
    expect(out).toContain('<script>/*https://studio.example/shared/vendor/marked.min.js*/');
    expect(out).notToContain('src="shared/vendor/marked.min.js"');
  });

  test('leaves type="module" scripts for the module bundler', async () => {
    const html = `<script type="module" src="./player/runtime.js"></script>`;
    expect(await inlineLocalScripts(html, base, fakeFetch)).toBe(html);
  });

  test('leaves http(s) (CDN) srcs live', async () => {
    const html = `<script src="https://cdn.example/x.js"></script>`;
    expect(await inlineLocalScripts(html, base, fakeFetch)).toBe(html);
  });

  test('neutralises a literal </script in the inlined body', async () => {
    const evilFetch = async () => `var s = "</script><script>alert(1)</script>";`;
    const out = await inlineLocalScripts(`<script src="vendor/x.js"></script>`, base, evilFetch);
    expect(out).notToContain('</script><script>alert(1)');
    expect(out).toContain('<\\/script');
  });
});

describe('publish · rewriteCssAssetUrls', () => {
  const cssUrl = 'https://studio.example/styles/fonts.css';

  test('rewrites local @font-face url() to the resolved asset URL', async () => {
    const css = `@font-face{src:url("/fonts/inter-400.woff2") format("woff2")}`;
    const out = await rewriteCssAssetUrls(css, cssUrl, fakeResolve);
    expect(out).toContain('url("https://assets.example/inter-400.woff2")');
    expect(out).notToContain('/fonts/inter-400.woff2');
  });

  test('leaves http(s) and data: url() untouched', async () => {
    const css = `a{background:url(https://cdn.example/bg.png)}b{src:url(data:font/woff2;base64,AAAA)}`;
    expect(await rewriteCssAssetUrls(css, cssUrl, fakeResolve)).toBe(css);
  });

  test('no resolver → css unchanged', async () => {
    const css = `@font-face{src:url(/fonts/x.woff2)}`;
    expect(await rewriteCssAssetUrls(css, cssUrl, null)).toBe(css);
  });
});
