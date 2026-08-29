// Does the browser actually RECLAIM a torn-down slide, or does something still
// hold it?
//
// test/current-slide.test.js proves the holder dereferences the slide. That is
// reasoning about the shape of the code; this asks the garbage collector.
// For a screen that runs for weeks it is the question that matters, which is
// why test/run-browser.mjs launches Chromium with --js-flags=--expose-gc.
//
// Browser-only: needs a real DOM and a real collector.

import { test, expect, describe } from './runner.js';
import { createSlideHolder } from '../player/current-slide.js';
import { mountWidget } from '../shared/widget-host.js';

describe('current slide · the memory is really given back', () => {
  const collected = async (ref) => {
    for (let i = 0; i < 3; i++) { globalThis.gc(); await new Promise(r => setTimeout(r, 0)); }
    return ref.deref() === undefined;
  };

  test('REGRESSION: after teardown the slide is collectable', async function () {
    // Fails loudly rather than skipping: a retention test that quietly passes
    // when it cannot measure anything is worse than no test.
    expect(typeof globalThis.gc).toBe('function');

    const h = createSlideHolder();
    let ref;
    {
      // Stand-in for a real slide: a detached host plus a widget teardown
      // closing over a megabyte of canvas-shaped data.
      const slideHost = { host: document.createElement('div'), pixels: new Uint8Array(1 << 20) };
      ref = new WeakRef(slideHost);
      h.adopt(slideHost.host, [() => { slideHost.pixels.fill(0); }]);
    }
    expect(await collected(ref)).toBeFalsy();   // still on screen — must stay
    h.teardown();
    expect(await collected(ref)).toBeTruthy();  // …and now it is really gone
  });
});

describe('widget host · the plugin is really given back', () => {
  const collected = async (ref) => {
    for (let i = 0; i < 3; i++) { globalThis.gc(); await new Promise(r => setTimeout(r, 0)); }
    return ref.deref() === undefined;
  };

  test('REGRESSION: dispose releases the plugin closure, not just its signal', async () => {
    expect(typeof globalThis.gc).toBe('function');

    let dispose, ref;
    {
      // What a real plugin's teardown closes over: its DOM, and its data.
      const held = { root: document.createElement('div'), buffer: new Uint8Array(1 << 20) };
      ref = new WeakRef(held);
      const plugin = { type: 'fake', render: () => () => { held.root.remove(); } };
      dispose = mountWidget({ id: 'w', type: 'fake', content: {} },
        {}, document.createElement('div'), { mode: 'live' }, () => plugin);
    }
    expect(await collected(ref)).toBeFalsy();   // mounted — the teardown needs it
    dispose();
    // The dispose closure survives (the caller still holds it); what must NOT
    // survive is everything the plugin was keeping alive behind it.
    expect(await collected(ref)).toBeTruthy();
    expect(typeof dispose).toBe('function');
  });
});
