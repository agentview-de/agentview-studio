// Every widget type, against the four inputs a display actually meets.
//
// A widget on a wall gets whatever the operator typed and whatever the network
// gives it, and there is nobody there to reload the page. The registry has 34
// plugins; each one hand-rolls its own defaulting and its own escaping, so
// "does plugin #29 survive a widget saved by an older Studio?" was answerable
// only by trying it. This tries it, for all of them, on every mount:
//
//   defaults()      what dropping the widget on the canvas produces
//   {}              a widget that lost its fields (an old save, a bad import)
//   all-null        every field present but empty — what a cleared form gives
//   undefined       no content at all
//
// …all with a DEAD NETWORK, which is the other half of a display's normal life.
// Nothing may throw, nothing may log an error, and dispose() must stay safe: an
// exception here shows nobody a stack trace, it shows a blank rectangle in a
// shop window until someone walks past and notices.
//
// NOTE on the field name: a plugin's render() receives the pseudo-slide from
// widgetAsSlide(), which reads `widget.content` — NOT `widget.config`, the name
// the editor's inspector uses for the same data. Writing `config` here makes
// every plugin render with an empty object and every assertion below pass for
// the wrong reason. That is not hypothetical: the first version of this file
// did exactly that, and the XSS sweep at the bottom silently tested nothing.
// Hence the control case, which fails if the detector ever goes blind again.
//
// Browser-only: it mounts real plugins into a real document.

import { test, expect, describe } from './runner.js';
import '../shared/plugins/all.js';
import { list } from '../shared/plugins/registry.js';
import { mountWidget } from '../shared/widget-host.js';

const SLIDE = { id: 's-test', duration: 10 };
const OFFSCREEN = 'position:fixed;left:-3000px;top:0;width:400px;height:225px;overflow:hidden;';

function offscreenHost() {
  const host = document.createElement('div');
  host.style.cssText = OFFSCREEN;
  document.body.appendChild(host);
  return host;
}

/**
 * Mount EVERY plugin off-screen with the network down, let them settle once,
 * and report per type what broke.
 *
 * One settle for all 34 rather than one each: a widget's async paths run on
 * their own, and 34 sequential timers turn a fast check into a slow one (in a
 * backgrounded tab, where timers are clamped to a second, into a minute).
 *
 * @param {(plugin: object) => any} contentFor  the widget content to test with
 */
async function mountAll(contentFor, settleMs = 300) {
  const host = offscreenHost();
  host.style.cssText = 'position:fixed;left:-3000px;top:0;width:800px;height:450px;overflow:hidden;';

  const realFetch = window.fetch;
  const realWarn = console.warn;
  const realError = console.error;
  let noiseSink = [];
  window.fetch = async () => { throw new TypeError('Failed to fetch'); };
  console.warn = (...a) => noiseSink.push('warn: ' + a.map(String).join(' ').slice(0, 120));
  console.error = (...a) => noiseSink.push('error: ' + a.map(String).join(' ').slice(0, 120));

  // An exception thrown from an animation frame or a promise never reaches the
  // try/catch around render() — it goes to the window. That is where the
  // addColorStop crash lived: twenty uncaught DOMExceptions per run, a dead
  // draw loop behind each one, and a green suite. Listen for them.
  const uncaught = [];
  const onError = e => uncaught.push('uncaught: ' + String(e.message ?? e).slice(0, 140));
  const onRejection = e => uncaught.push('unhandled rejection: ' + String(e.reason?.message ?? e.reason).slice(0, 140));
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  // Attribute every armed interval to the plugin that armed it. The mounts
  // are sequential, so "whatever is being mounted right now" is unambiguous.
  const realInterval = window.setInterval;
  let arming = null;
  const armedBy = {};
  window.setInterval = (fn, ms, ...rest) => {
    if (arming) (armedBy[arming] ??= []).push(ms);
    return realInterval(fn, ms, ...rest);
  };

  const rows = [];
  const disposers = [];
  for (const p of list()) {
    arming = p.type;
    const box = document.createElement('div');
    box.style.cssText = 'position:relative;width:400px;height:225px;overflow:hidden;';
    box.dataset.type = p.type;
    host.appendChild(box);
    noiseSink = [];
    const problems = [];
    try {
      disposers.push(mountWidget({ id: `w-${p.type}`, type: p.type, rect: { x: 0, y: 0, w: 100, h: 100 }, content: contentFor(p) }, SLIDE, box, { mode: 'live' }));
    } catch (e) {
      problems.push(`render threw: ${e?.message ?? e}`);
    }
    // mountWidget CATCHES a synchronous throw and logs it — so the log is the
    // signal here, not only the exception.
    rows.push({ type: p.type, box, problems: [...problems, ...noiseSink] });
  }
  arming = null;

  noiseSink = [];
  await new Promise(r => setTimeout(r, settleMs));
  const lateNoise = [...noiseSink];
  window.setInterval = realInterval;
  for (const r of rows) r.armed = armedBy[r.type] ?? [];

  for (const r of rows) {
    r.html = r.box.innerHTML.length;
    r.unknown = !!r.box.querySelector('.bb-missing');
    // The sandbox invariant, as a property of the DOM rather than of one
    // function: 'allow-scripts' together with 'allow-same-origin' is the
    // classic escape — the framed page reaches back into the player's origin
    // and can strip its own sandbox. shared/web-embed-fields.js is the single
    // place the token string is built today; this is what catches the widget
    // that decides to build its own tomorrow.
    r.escapedFrames = [...r.box.querySelectorAll('iframe[sandbox]')]
      .map(f => f.getAttribute('sandbox') ?? '')
      .filter(v => /allow-same-origin/.test(v) && /allow-scripts/.test(v));
  }
  for (const [i, d] of disposers.entries()) {
    try { d(); } catch (e) { rows[i]?.problems.push(`dispose threw: ${e?.message ?? e}`); }
  }

  host.remove();
  window.removeEventListener('error', onError);
  window.removeEventListener('unhandledrejection', onRejection);
  window.fetch = realFetch;
  console.warn = realWarn;
  console.error = realError;
  return { rows, lateNoise, uncaught };
}

const TYPES = list().map(p => p.type);

describe('plugins · every type survives what a display throws at it', () => {
  test('the registry still holds every widget type', () => {
    expect(TYPES.length >= 34).toBeTruthy();
    for (const t of ['text', 'weather', 'rss', 'map', 'qr-code', 'menu']) {
      expect(TYPES).toContain(t);
    }
  });

  test('REGRESSION: no widget polls faster than the five-second floor', async () => {
    // Thirteen widgets used to write `Math.max(5000, refreshSec * 1000)` by
    // hand. All thirteen were right — which is exactly when the fourteenth is
    // not, and a display hammering somebody's API every second is a small
    // denial-of-service that runs unattended.
    //
    // Told apart by DIFFERENCE, not by threshold: several widgets legitimately
    // tick below five seconds (a clock's second hand, a ticker). Those arm the
    // same interval whatever refreshSec says. An interval that appears only
    // when refreshSec is 1 came FROM refreshSec — and must have been floored.
    //
    // Reach, stated honestly: this sees the widgets that arm their timer AT
    // MOUNT. The ones behind the live-source seam arm theirs after a fetch
    // resolves, and the network is dead here — they are covered by the shared
    // refreshIntervalMs() instead. Removing the floor from that function trips
    // this on image, weather, rss and news-photos, which is the tripwire.
    const live = { url: '/test/kein-fixture.bin', dataUrl: '/test/kein-fixture.json', source: 'url' };
    const fast = await mountAll(p => ({ ...p.defaults(), ...live, refreshSec: 1, reloadSec: 1 }), 150);
    const slow = await mountAll(p => ({ ...p.defaults(), ...live, refreshSec: 3600, reloadSec: 3600 }), 150);
    const steady = Object.fromEntries(slow.rows.map(r => [r.type, new Set(r.armed)]));

    const tooFast = [];
    for (const r of fast.rows) {
      for (const ms of r.armed) {
        if (ms >= 5000) continue;
        if (steady[r.type]?.has(ms)) continue;   // ticks on its own clock
        tooFast.push(`${r.type}: setInterval(${ms}ms) with refreshSec=1`);
      }
    }
    expect(tooFast).toEqual([]);
  });

  test('REGRESSION: no widget frames a page with a sandbox it could escape', async () => {
    // Every input case, not just the default one: a widget that builds its own
    // token string would do it wherever its URL comes from.
    const escaped = [];
    for (const content of [
      p => ({ ...p.defaults(), url: '/test/kein-fixture.bin', src: '/test/kein-fixture.bin' }),
      p => p.defaults(),
      () => ({}),
    ]) {
      const { rows } = await mountAll(content, 150);
      for (const r of rows) {
        for (const v of r.escapedFrames) escaped.push(`${r.type}: sandbox="${v}"`);
      }
    }
    expect(escaped).toEqual([]);
  });

  test('defaults() renders, produces DOM and disposes — with no network', async () => {
    const { rows, lateNoise, uncaught } = await mountAll(p => p.defaults());
    const broken = [];
    for (const r of rows) {
      if (r.problems.length) broken.push(`${r.type}: ${r.problems.join(' | ')}`);
      else if (r.unknown) broken.push(`${r.type}: rendered the "unknown widget" box`);
      else if (r.html < 10) broken.push(`${r.type}: rendered nothing (${r.html} chars)`);
    }
    expect(broken).toEqual([]);
    expect(lateNoise).toEqual([]);   // nothing complains once the fetches fail either
    expect(uncaught).toEqual([]);
  });

  test('a widget that lost its fields does not take the display down', async () => {
    const { rows, uncaught } = await mountAll(() => ({}), 150);
    expect(rows.filter(r => r.problems.length).map(r => `${r.type}: ${r.problems.join(' | ')}`)).toEqual([]);
    expect(uncaught).toEqual([]);
  });

  test('every field present but null — a cleared form — is survivable', async () => {
    const { rows, uncaught } = await mountAll(p => Object.fromEntries(Object.keys(p.defaults()).map(k => [k, null])), 150);
    expect(rows.filter(r => r.problems.length).map(r => `${r.type}: ${r.problems.join(' | ')}`)).toEqual([]);
    expect(uncaught).toEqual([]);
  });

  test('no content at all is survivable', async () => {
    const { rows, uncaught } = await mountAll(() => undefined, 150);
    expect(rows.filter(r => r.problems.length).map(r => `${r.type}: ${r.problems.join(' | ')}`)).toEqual([]);
    expect(uncaught).toEqual([]);
  });

  test('REGRESSION: a locale tag Intl refuses costs the language, not the widget', async () => {
    // The audience-language field is a select, but a playlist is JSON: an
    // import or an export that writes POSIX names puts "de_DE" in there, and
    // `new Intl.DateTimeFormat('de_DE')` does not fall back — it throws
    // RangeError out of render(). Fourteen widgets format something.
    const { rows, uncaught } = await mountAll(p => ({ ...p.defaults(), locale: 'de_DE' }), 150);
    const broken = [];
    for (const r of rows) {
      if (r.problems.length) broken.push(`${r.type}: ${r.problems.join(' | ')}`);
      else if (r.html < 10) broken.push(`${r.type}: rendered nothing (${r.html} chars)`);
    }
    expect(broken).toEqual([]);
    expect(uncaught).toEqual([]);
  });
});

// Widget text is operator input that ends up in a published bundle on a screen
// nobody looks at again. Most plugins build their markup as HTML strings, each
// escaping its own values — so this is a per-plugin discipline, and one missing
// escapeHtml() is stored XSS with a very long dwell time. The sweep puts a LIVE
// payload in every string field of every widget type and then asks the two
// questions that matter: did anything run, and did any handler survive into the
// DOM?
describe('plugins · operator text cannot become markup', () => {
  const PAYLOAD = '"><img src=x onerror="window.__pluginXss.push(1)"><b onmouseover="window.__pluginXss.push(2)">x</b>';
  const INJECTED = 'img[onerror], b[onmouseover], script, [onload], [onclick], [onmouseover]';
  const payloadContent = plugin => {
    const content = plugin.defaults();
    for (const [k, v] of Object.entries(content)) if (typeof v === 'string') content[k] = PAYLOAD;
    return content;
  };

  test('CONTROL: the detector catches a plugin that does interpolate raw', async () => {
    // Injected through mountWidget's pluginLookup seam, so the real registry is
    // untouched. If this ever stops finding the payload, the sweep below is
    // measuring nothing and its green is meaningless.
    window.__pluginXss = [];
    const vulnerable = {
      type: 'control-vulnerable', label: 'Control', group: 'misc', icon: 'x', schemaVersion: 1,
      defaults: () => ({ text: 'hello' }),
      schema: () => ({ fields: [] }),
      render: (slide, container) => { container.innerHTML = `<div>${slide.content.text}</div>`; return () => {}; },
    };
    const box = offscreenHost();
    const dispose = mountWidget(
      { id: 'w-control', type: 'control-vulnerable', rect: { x: 0, y: 0, w: 100, h: 100 }, content: payloadContent(vulnerable) },
      SLIDE, box, { mode: 'live' }, () => vulnerable,
    );
    const injected = box.querySelectorAll(INJECTED).length;
    await new Promise(r => setTimeout(r, 30));
    const fired = window.__pluginXss.length;
    dispose();
    box.remove();
    delete window.__pluginXss;
    expect(injected > 0).toBeTruthy();
    expect(fired > 0).toBeTruthy();
  });

  test('a payload in every string field executes nothing and injects nothing', async () => {
    window.__pluginXss = [];
    const realFetch = window.fetch;
    const realWarn = console.warn;
    window.fetch = async () => { throw new TypeError('Failed to fetch'); };
    console.warn = () => {};

    // Garbage in a COLOUR field is what found the addColorStop crash: a
    // gradient stop throws on anything the browser cannot parse, from inside an
    // animation frame, so the draw loop dies where no try/catch can see it.
    // This sweep is the only place a widget meets a nonsense colour, so the
    // window is where the evidence lands.
    const uncaught = [];
    const onError = e => uncaught.push('uncaught: ' + String(e.message ?? e).slice(0, 140));
    const onRejection = e => uncaught.push('unhandled rejection: ' + String(e.reason?.message ?? e.reason).slice(0, 140));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    // Mount them ALL, settle once, then look — a per-widget sleep would be 34
    // timers, and an injection that arrives from an async path still lands in
    // its own box.
    const host = offscreenHost();
    host.style.cssText = 'position:fixed;left:-3000px;top:0;width:800px;height:450px;';
    const disposers = [];
    for (const p of list()) {
      const box = document.createElement('div');
      box.style.cssText = 'position:relative;width:400px;height:225px;overflow:hidden;';
      box.dataset.type = p.type;
      host.appendChild(box);
      try {
        disposers.push(mountWidget({ id: `w-${p.type}`, type: p.type, rect: { x: 0, y: 0, w: 100, h: 100 }, content: payloadContent(p) }, SLIDE, box, { mode: 'live' }));
      } catch { /* the resilience suite above owns throwing */ }
    }
    await new Promise(r => setTimeout(r, 400));

    const leaked = [];
    for (const box of host.children) {
      const n = box.querySelectorAll(INJECTED).length;
      if (n) leaked.push(`${box.dataset.type}: ${n} injected element(s)`);
    }
    const fired = window.__pluginXss.length;
    for (const d of disposers) { try { d(); } catch { /* ignore */ } }
    host.remove();
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.fetch = realFetch;
    console.warn = realWarn;
    delete window.__pluginXss;

    expect(leaked).toEqual([]);
    expect(fired).toBe(0);
    // REGRESSION: audio-viz and chart threw here, twenty times per run.
    expect(uncaught).toEqual([]);
  });
});
