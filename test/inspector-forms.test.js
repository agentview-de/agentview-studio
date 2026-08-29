// Every widget's inspector form, built and torn down.
//
// buildForm() turns a plugin's schema into controls — 34 schemas across some
// twenty field-control types, and the only thing that ever exercised them was a
// person clicking through the library. The teardown half is the interesting
// one: a control that arms a timer or an observer keeps running after the
// inspector re-renders it away, which happens every time you select another
// widget. That is where the map field's crash lived:
//
//     setTimeout(() => map.invalidateSize(), 60);      // location.js
//
// Select a second widget inside those 60 ms and Leaflet's remove() has already
// deleted the map pane, so the late call read _leaflet_pos off nothing and
// threw — from a timer, i.e. nowhere a try/catch could catch it and nowhere a
// test was looking. Building and immediately discarding all 34 forms, then
// waiting, is what makes that class visible.
//
// Browser-only: real controls in a real document.

import { test, expect, describe } from './runner.js';
import '../shared/plugins/all.js';
import { list } from '../shared/plugins/registry.js';
import { buildForm } from '../admin/ui/inspector.js';

function watchWindow() {
  const seen = [];
  const onError = e => seen.push('uncaught: ' + String(e.message ?? e).slice(0, 140));
  const onRejection = e => seen.push('rejection: ' + String(e.reason?.message ?? e.reason).slice(0, 140));
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return { seen, stop: () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); } };
}

function buildFor(plugin) {
  return buildForm({
    schema: plugin.schema(),
    value: plugin.defaults(),
    defaults: plugin.defaults(),
    onChange: () => {},
    formKey: `test-${plugin.type}`,
  });
}

describe('inspector · every widget schema builds a form', () => {
  test('none of the 34 schemas throws, and each yields controls', () => {
    const broken = [];
    const empty = [];
    for (const p of list()) {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-3000px;top:0;width:320px;';
      document.body.appendChild(host);
      try {
        const form = buildFor(p);
        host.appendChild(form.root);
        const controls = host.querySelectorAll('input, select, textarea, button, [contenteditable]').length;
        if (!controls) empty.push(p.type);
        form.dispose();
      } catch (e) {
        broken.push(`${p.type}: ${e?.message ?? e}`);
      }
      host.remove();
    }
    expect(broken).toEqual([]);
    expect(empty).toEqual([]);
  });

  test('REGRESSION: forms that have STARTED are torn down quietly', async () => {
    // Mount every form, let the controls actually start — the map field only
    // creates its Leaflet instance once its element is connected AND the
    // library has loaded — and only then take them all away. Building and
    // discarding in the same tick proves nothing: nothing ever starts, so
    // nothing can be left running. (This test was written that way first, and
    // passed with the bug still in place.)
    const watch = watchWindow();
    const realFetch = window.fetch;
    const realWarn = console.warn;
    const realError = console.error;
    const logged = [];
    // Nothing may leave the machine — the location field geocodes, the URL
    // probe fetches. Tiles are <img> and fail on their own.
    window.fetch = async () => { throw new TypeError('Failed to fetch'); };
    console.warn = () => {};
    console.error = (...a) => logged.push(a.map(String).join(' ').slice(0, 140));

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-3000px;top:0;width:340px;height:600px;overflow:hidden;';
    document.body.appendChild(host);
    const forms = [];
    for (const p of list()) {
      try {
        const form = buildFor(p);
        host.appendChild(form.root);
        forms.push(form);
      } catch { /* the test above owns build failures */ }
    }

    // Wait for the map field to come up — and then tear down IMMEDIATELY. The
    // window that matters is the 60 ms between "the map exists" and its
    // re-measure timer firing; waiting a comfortable second first would let the
    // timer fire harmlessly and the test would pass with the bug in place
    // (it did, in the second draft of this file).
    const started = await new Promise(resolve => {
      const t0 = Date.now();
      (function poll() {
        const n = host.querySelectorAll('.leaflet-container').length;
        if (n) return resolve(n);
        if (Date.now() - t0 > 4000) return resolve(0);
        setTimeout(poll, 10);
      })();
    });

    // …and now the selection changes: everything goes at once.
    for (const f of forms) { try { f.dispose(); } catch { /* ignore */ } }
    host.remove();

    // Long enough for a 60 ms re-measure, a debounce, an observer callback.
    await new Promise(r => setTimeout(r, 600));
    watch.stop();
    window.fetch = realFetch;
    console.warn = realWarn;
    console.error = realError;

    // If no map ever came up the test is measuring nothing — say so loudly
    // rather than passing.
    expect(started > 0).toBeTruthy();
    expect(watch.seen).toEqual([]);
    expect(logged).toEqual([]);
  });
});
