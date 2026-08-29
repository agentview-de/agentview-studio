// The sandbox invariant.
//
// Two widgets put a foreign web page on an unattended screen: `iframe` (a URL)
// and `embed` (a URL, or inline HTML an AI agent produced). Both are sandboxed,
// and shared/web-embed-fields.js spells out why in capitals: NEVER grant
// 'allow-same-origin'. Combined with 'allow-scripts' that is the classic escape
// — the framed page gets same-origin access to the player's DOM, storage and
// cookies, and can strip its own sandbox attribute.
//
// The rule was written down three times and enforced nowhere: sandboxTokens()
// is the single place the token string is assembled, and nothing failed if a
// token were added to it, or if a third widget built its own string. A comment
// is not a test. This is.
//
// The pure half runs headless; the mounting half needs a document and skips
// itself under node.
//
// The mounted widgets point at a same-origin file that EXISTS. A real remote
// URL would make this suite reach the network for real — a dependency on DNS,
// and outbound traffic from a test run — and a same-origin 404 would add a
// console error to a page whose declared noise does not include one. This page
// keeps its console clean; the sandbox attribute is set whatever the frame
// loads.

import { test, expect, describe } from './runner.js';
import { sandboxTokens, mixedContentWarning, webEmbedDefaults } from '../shared/web-embed-fields.js';

const hasDom = typeof document !== 'undefined';

describe('web embed · the sandbox invariant', () => {
  test('REGRESSION: no combination of the knobs ever grants same-origin', () => {
    // Every toggle combination, plus keys a hand-edited playlist might carry
    // in the hope that one of them is read.
    const bools = [undefined, true, false, 'yes', 0, 1, ''];
    const seen = new Set();
    for (const sandbox of bools) {
      for (const allowForms of bools) {
        for (const allowPopups of bools) {
          for (const extra of [{}, { allowSameOrigin: true }, { sandboxTokens: 'allow-same-origin' },
            { allow: 'allow-same-origin' }, { tokens: ['allow-same-origin'] }]) {
            const out = sandboxTokens({ sandbox, allowForms, allowPopups, ...extra });
            if (out !== null) seen.add(out);
          }
        }
      }
    }
    for (const tokens of seen) {
      expect(tokens).notToContain('allow-same-origin');
      // …and scripts is the floor every string is built on.
      expect(tokens).toContain('allow-scripts');
    }
    expect(seen.size > 0).toBeTruthy();
  });

  test('the default is scripts and nothing else', () => {
    expect(sandboxTokens(webEmbedDefaults())).toBe('allow-scripts');
    expect(sandboxTokens({})).toBe('allow-scripts');
    expect(sandboxTokens(null)).toBe('allow-scripts');
    expect(sandboxTokens(undefined)).toBe('allow-scripts');
  });

  test('the opt-in tokens are added, never substituted', () => {
    expect(sandboxTokens({ allowForms: true })).toBe('allow-scripts allow-forms');
    expect(sandboxTokens({ allowPopups: true })).toBe('allow-scripts allow-popups');
    expect(sandboxTokens({ allowForms: true, allowPopups: true }))
      .toBe('allow-scripts allow-forms allow-popups');
  });

  test('only an explicit false turns the sandbox off', () => {
    // That path drops the attribute entirely — a deliberate, documented choice
    // for trusted internal URLs. Anything else fails safe.
    expect(sandboxTokens({ sandbox: false })).toBe(null);
    for (const v of ['false', 0, '', null, undefined, 'off']) {
      expect(sandboxTokens({ sandbox: v })).toBe('allow-scripts');
    }
  });
});

describe('web embed · the http warning', () => {
  test('a plain-http URL is flagged, because an https display will block it', () => {
    const w = mixedContentWarning('http://intern.example/dash');
    expect(w?.level).toBe('warn');
    expect(w?.message).toContain('mixed content');
    expect(mixedContentWarning('  HTTP://intern.example  ')?.level).toBe('warn');
  });

  test('https, relative and empty are fine', () => {
    for (const v of ['https://example.org', '/lokal/seite.html', 'seite.html', '', '   ', null, undefined]) {
      expect(mixedContentWarning(v)).toBe(null);
    }
  });
});

describe('web embed · what the widgets actually put in the DOM', () => {
  test('REGRESSION: the rendered iframe carries the tokens sandboxTokens built', async () => {
    if (!hasDom) return;
    const { get } = await import('../shared/plugins/registry.js');
    await import('../shared/plugins/all.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-3000px;top:0;width:400px;height:300px;';
    document.body.appendChild(host);
    const disposers = [];
    try {
      for (const type of ['iframe', 'embed']) {
        const plugin = get(type);
        expect(plugin === undefined).toBeFalsy();
        for (const [content, expected] of [
          [{ ...plugin.defaults(), url: '/icon.svg' }, 'allow-scripts'],
          [{ ...plugin.defaults(), url: '/icon.svg', allowForms: true }, 'allow-scripts allow-forms'],
          // A truthy non-boolean is not "off" — only `false` is.
          [{ ...plugin.defaults(), url: '/icon.svg', sandbox: 'allow-same-origin' }, 'allow-scripts'],
        ]) {
          const box = document.createElement('div');
          box.style.cssText = 'position:relative;width:400px;height:300px;';
          host.appendChild(box);
          disposers.push(plugin.render({ id: 's', duration: 10, content }, box) ?? (() => {}));
          const frames = [...box.querySelectorAll('iframe')];
          expect(frames.length >= 1).toBeTruthy();
          for (const f of frames) {
            expect(f.getAttribute('sandbox')).toBe(expected);
            expect(f.getAttribute('sandbox') ?? '').notToContain('allow-same-origin');
          }
        }
      }
    } finally {
      for (const d of disposers) { try { d(); } catch { /* plugin teardown */ } }
      host.remove();
    }
  });

  test('REGRESSION: the documented reload floor is a floor, in both widgets', async () => {
    // "Intervals under 5 seconds are ignored to protect the player" — written
    // in the shared field's help AND in its validate(), and enforced by each
    // widget separately. A display that reloads a status page every second is
    // a small denial-of-service against whoever hosts it, running unattended.
    if (!hasDom) return;
    const { get } = await import('../shared/plugins/registry.js');
    await import('../shared/plugins/all.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-3000px;top:0;width:400px;height:300px;';
    document.body.appendChild(host);
    const realInterval = window.setInterval;
    const armed = [];
    window.setInterval = (fn, ms, ...rest) => { armed.push(ms); return realInterval(fn, ms, ...rest); };
    const disposers = [];
    try {
      for (const type of ['iframe', 'embed']) {
        const plugin = get(type);
        for (const sec of [1, 3, 4.9, 10]) {
          const box = document.createElement('div');
          box.style.cssText = 'position:relative;width:400px;height:300px;';
          host.appendChild(box);
          const content = { ...plugin.defaults(), url: '/icon.svg', reloadSec: sec };
          disposers.push(plugin.render({ id: 's', duration: 10, content }, box) ?? (() => {}));
        }
      }
      // Four mounts per widget, one of which is above the floor.
      expect(armed).toEqual([10000, 10000]);
    } finally {
      window.setInterval = realInterval;
      for (const d of disposers) { try { d(); } catch { /* plugin teardown */ } }
      host.remove();
    }
  });

  test('turning the sandbox off drops the attribute rather than weakening it', async () => {
    if (!hasDom) return;
    const { get } = await import('../shared/plugins/registry.js');
    await import('../shared/plugins/all.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-3000px;top:0;width:400px;height:300px;';
    document.body.appendChild(host);
    let dispose = () => {};
    try {
      const plugin = get('iframe');
      const content = { ...plugin.defaults(), url: '/icon.svg', sandbox: false };
      dispose = plugin.render({ id: 's', duration: 10, content }, host) ?? (() => {});
      const f = host.querySelector('iframe');
      expect(f === null).toBeFalsy();
      // No attribute at all — never `sandbox="allow-scripts allow-same-origin"`.
      expect(f.hasAttribute('sandbox')).toBeFalsy();
    } finally {
      try { dispose(); } catch { /* plugin teardown */ }
      host.remove();
    }
  });
});
