// Publish → play, end to end: build the real bundle and BOOT it.
//
// Publishing is the one action in this app that cannot be undone from the
// editor — the bundle goes to displays that nobody is standing in front of. Its
// pieces were tested (module-graph's rewrite grammar, the globals preamble, the
// `</script` escaping), but nothing ever asserted that the artefact those pieces
// produce actually runs. This does: bundlePlayer() against the real
// display.html and the real module graph, then the result into a srcdoc iframe,
// then wait for a slide to appear.
//
// That covers the failure mode the unit tests structurally cannot see — a
// bundle that is perfectly well-formed and boots to a black screen. It has
// happened twice in this codebase's history: a `$'` in the tail replacement
// string expanding into `</html>`, and a module the walker never reached.
//
// Browser-only (fetch + iframe + the module graph over HTTP), and on its own
// page because it is slower than the rest of the suite put together.

import { test, expect, describe } from './runner.js';
import { bundlePlayer, escapeScriptBody, buildGlobalLines } from '../admin/publish.js';
import '../shared/plugins/all.js';
import { get as getPlugin } from '../shared/plugins/registry.js';

const READ_URL = '/sample/presentation.json';

// One build for every test in this file — it walks ~200 modules over HTTP.
let _bundle = null;
const bundle = () => (_bundle ??= bundlePlayer({ baseUrl: location.origin + '/', readUrl: READ_URL }));

function waitFor(check, { timeout = 12_000, every = 100 } = {}) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function poll() {
      let v;
      try { v = check(); } catch { v = null; }
      if (v) return resolve(v);
      if (Date.now() - t0 > timeout) return reject(new Error('timed out waiting for the player'));
      setTimeout(poll, every);
    })();
  });
}

describe('publish · the bundle is self-contained', () => {
  test('every module script is gone — the content host serves no sibling files', async () => {
    const html = await bundle();
    expect(html).notToContain('type="module"');
    // No <script src="./…"> either: the bundle is one page, and the host has
    // no siblings to serve it. (The word "import" itself survives all over the
    // place — inside the comments and strings of the inlined modules — so it
    // is the TAGS that must be checked, not the text.)
    const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
    expect(srcs).toEqual([]);
  });

  test('nothing is loaded from another origin', async () => {
    const html = await bundle();
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
    const remote = refs.filter(u => /^(https?:)?\/\//.test(u));
    // Attribution LINKS are fine (open-meteo, OSM); a remote script or
    // stylesheet is not — the display may be offline and the host's CSP
    // forbids it either way.
    const loaded = remote.filter(u => /\.(js|css|woff2?|png|jpe?g|svg)(\?|$)/i.test(u));
    expect(loaded).toEqual([]);
  });

  test('the read URL reaches the player as a global', async () => {
    const html = await bundle();
    expect(html).toContain('BB_READ_URL');
    expect(html).toContain(READ_URL);
  });

  test('no inline script can be closed early by its own content', async () => {
    const html = await bundle();
    // Everything between <script> and </script> must be free of a literal
    // "</script" — one would end the script tag mid-expression.
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      expect(m[1].includes('</script')).toBeFalsy();
    }
  });

  test('the escaper is what keeps that true', () => {
    const body = 'const s = "</script><img onerror=alert(1)>";';
    const out = escapeScriptBody(body);
    expect(out.includes('</script')).toBeFalsy();
  });

  test('a currency symbol in the globals survives the tail replacement', () => {
    // `$'` and `$&` are replacement PATTERNS in String.replace — a bundle that
    // used a replacement string instead of a function lost everything after it.
    const lines = buildGlobalLines('/x.json', { BB_TEST: "CA$ and $' and $&" });
    const joined = lines.join('');
    expect(joined).toContain('CA$');
    const html = '<body></body>'.replace('</body>', () => `<script>${joined}</script></body>`);
    expect(html).toContain("$'");
    expect(html).toContain('</body>');
  });
});

describe('publish · the bundle actually plays', () => {
  test('REGRESSION: the published page boots and renders a slide', async () => {
    const html = await bundle();
    const frame = document.createElement('iframe');
    // Off-screen but laid out — a zero-size iframe would make every widget
    // measure 0 and is not what a display looks like.
    frame.style.cssText = 'position:fixed;left:-2000px;top:0;width:960px;height:540px;border:0;';
    frame.srcdoc = html;
    document.body.appendChild(frame);
    try {
      // Wait for what a VIEWER would see, not for the first DOM node: the
      // stage gets its frame before the slide renders into it, and entrance
      // builds start their widgets at opacity 0. Text on the screen is the
      // only end state worth asserting.
      const text = await waitFor(() => {
        const d = frame.contentDocument;
        const stage = d && d.getElementById('bb-stage');
        if (!stage || !stage.children.length) return null;
        const t = (d.body.innerText || '').trim();
        return t.length ? t : null;
      });
      expect(text.length > 0).toBeTruthy();
      // The player's own diagnostic banner must NOT be up: it means the
      // playlist was rejected, or nothing was scheduled.
      expect(frame.contentDocument.getElementById('bb-banner')).toBe(null);
    } finally {
      frame.remove();
    }
  });
});

// The whole journey in one test: a playlist shaped the way the EDITOR shapes
// one, through the real bundler, into a real player, and on to text a viewer
// would read — including the slide actually changing.
//
// Every other test in this repo owns one seam. This one owns the line between
// all of them, which is where a change that is locally correct everywhere can
// still add up to a black screen. The playlist is handed over as a data: URL,
// so no fixture file has to exist for the player to fetch.
describe('publish · a playlist made in the editor plays on a display', () => {
  const TYPES = ['text', 'menu'];

  function editorShapedPlaylist() {
    return {
      schemaVersion: 3, id: 'journey', name: 'Reise',
      canvas: { w: 1920, h: 1080, fit: 'fill' },
      defaults: { duration: 2, transition: 'fade', theme: 'minimal-dark' },
      slides: TYPES.map((t, i) => ({
        id: `j-s${i}`, name: t, duration: 2,
        widgets: [{
          id: `j-w${i}`, type: t, z: 1, rect: { x: 6, y: 10, w: 88, h: 76 },
          content: {
            ...getPlugin(t).defaults(),
            ...(t === 'text' ? { body: 'JOURNEY-MARKER' } : {}),
            // An explicit audience language, because that is the thing under
            // test. Left empty, the widget follows the DEVICE — so "6,50" only
            // appeared on a German machine, and the assertion below proved the
            // developer's OS rather than the locale chain. See the runner.
            ...(t === 'menu' ? { locale: 'de' } : {}),
          },
        }],
      })),
    };
  }

  test('REGRESSION: it boots, shows the first slide and moves to the next', async () => {
    const playlist = editorShapedPlaylist();
    const readUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(playlist));
    const html = await bundlePlayer({ baseUrl: location.origin + '/', readUrl });

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-2000px;top:0;width:960px;height:540px;border:0;';
    frame.srcdoc = html;
    document.body.appendChild(frame);
    const seen = [];
    try {
      await waitFor(() => {
        const d = frame.contentDocument;
        if (!d || !d.getElementById('bb-stage')?.children.length) return null;
        const txt = (d.body.innerText || '').replace(/\s+/g, ' ').trim();
        if (txt && txt !== seen[seen.length - 1]) seen.push(txt);
        // Two distinct screens = it rendered AND it advanced.
        return seen.length >= 2 ? seen : null;
      }, { timeout: 20_000, every: 250 });
    } finally {
      frame.remove();
    }

    expect(seen.length >= 2).toBeTruthy();
    // The text widget's own words, straight from the editor's content.
    expect(seen.join(' | ')).toContain('JOURNEY-MARKER');
    // …and the menu widget's price, written the way the AUDIENCE reads it: the
    // widget's `locale: 'de'` survived the editor, the bundler and the player,
    // and beat the device's own en-US. A comma here is the whole chain.
    expect(seen.join(' | ')).toContain('6,50');
    expect(seen.join(' | ')).notToContain('6.50');
  });
});

// The one thing a simulation cannot prove: that the PLAYER flips when the
// shared clock says so.
//
// test/sync-clock.test.js shows the anchor math and the scheduling policy are
// right. Neither would notice if player/runtime.js went back to arming its
// timer at `now + slide.duration` — which is what it did, and which is why two
// screens on one wall drifted apart. So this boots a real bundle TWICE, half a
// slide apart, and watches when each one actually changes what it shows.
//
// The assertion is a property of one display, not a comparison of two: every
// flip has to land on the anchor's grid (a multiple of the slide length after
// the anchor epoch), no matter when that display was switched on. A display
// that counts a full duration from its own boot flips half a slide off the
// grid — that is the whole bug, and it is what the second frame here would do.
describe('publish · two displays flip on the same clock', () => {
  const SLIDE_MS = 4000;
  const MARKERS = ['FLIP-EINS', 'FLIP-ZWEI'];

  function syncedPlaylist(epochMs) {
    return {
      schemaVersion: 3, id: 'sync-wall', name: 'Videowand',
      canvas: { w: 1920, h: 1080, fit: 'fill' },
      defaults: { duration: SLIDE_MS / 1000, transition: 'fade', theme: 'minimal-dark' },
      syncAnchor: { epochMs, slideMs: MARKERS.map(() => SLIDE_MS) },
      slides: MARKERS.map((m, i) => ({
        id: `w-s${i}`, name: m, duration: SLIDE_MS / 1000,
        widgets: [{
          id: `w-w${i}`, type: 'text', z: 1, rect: { x: 6, y: 10, w: 88, h: 76 },
          content: { ...getPlugin('text').defaults(), body: m },
        }],
      })),
    };
  }

  const boot = (html) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-2000px;top:0;width:960px;height:540px;border:0;';
    frame.srcdoc = html;
    document.body.appendChild(frame);
    return frame;
  };
  // Read the INCOMING slide, not the whole body: the fade keeps both hosts in
  // the document for most of a second, and the flip happens when the new one is
  // appended — which is the instant the timer was armed for.
  const marker = (frame) => {
    const hosts = frame.contentDocument?.querySelectorAll('.bb-slide-host');
    const txt = hosts?.length ? hosts[hosts.length - 1].innerText ?? '' : '';
    return MARKERS.find(m => txt.includes(m)) ?? null;
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  test('REGRESSION: a display switched on mid-slide still flips on the grid', async () => {
    // Anchor the loop to a round instant so "on the grid" is checkable.
    const epochMs = Math.floor(Date.now() / (SLIDE_MS * MARKERS.length)) * SLIDE_MS * MARKERS.length;
    const readUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(syncedPlaylist(epochMs)));
    const html = await bundlePlayer({ baseUrl: location.origin + '/', readUrl });

    const early = boot(html);
    await sleep(SLIDE_MS / 2);        // switch the second screen on mid-slide
    const late = boot(html);
    const seen = new Map([[early, { last: null, flips: [] }], [late, { last: null, flips: [] }]]);
    try {
      const until = Date.now() + SLIDE_MS * 3 + 1500;
      while (Date.now() < until) {
        for (const [frame, rec] of seen) {
          const m = marker(frame);
          if (m && rec.last && m !== rec.last) rec.flips.push(Date.now());
          if (m) rec.last = m;
        }
        await sleep(100);
      }
    } finally {
      early.remove();
      late.remove();
    }

    // One assertion, and it names what went wrong: a flip is observed a little
    // AFTER the instant it was armed for (append + the 100 ms poll), so a small
    // lag is expected — but it must never sit half a slide off the grid, which
    // is exactly where booting late used to put the second screen.
    const offGrid = [];
    for (const [frame, rec] of seen) {
      const which = frame === early ? 'booted early' : 'booted mid-slide';
      if (rec.flips.length < 2) offGrid.push(`${which}: only ${rec.flips.length} flips seen`);
      for (const t of rec.flips) {
        const offset = (t - epochMs) % SLIDE_MS;
        if (offset >= 1200) offGrid.push(`${which}: flipped ${offset}ms into the ${SLIDE_MS}ms grid slot`);
      }
    }
    expect(offGrid).toEqual([]);
  });
});
