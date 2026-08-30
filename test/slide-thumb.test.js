// The thumbnail renderer's SIZING contract.
//
// Everything else about a thumbnail is visual and gets checked by eye or by the
// legibility suite. The box arithmetic is neither: it is the thing that decides
// whether a grid of cards lines up, and it fails silently in exactly one
// direction — a canvas whose aspect differs from the box it was given.
//
// That is not hypothetical. Scaled on width alone, the 1080x1920 door-sign
// template rendered 652 px tall inside a grid of 204 px cards: it stretched its
// whole row, pushed its own title and buttons out of the card, and in the
// detail view scaled to ~2000 px so the slide ran off the bottom of the screen
// and took the slide rail with it. Nothing threw, nothing logged.
//
// Browser-only (test/index.html, not the Node runner): the renderer writes real
// inline geometry and reads a laid-out box. It does NOT need the app's
// stylesheets — the numbers asserted here are all inline — which is why it
// belongs in the shared page rather than the legibility one.

import { describe, test, expect } from './runner.js';
import { renderSlideThumb } from '../admin/ui/slide-thumb.js';

const PORTRAIT = { canvas: { w: 1080, h: 1920 } };
const LANDSCAPE = { canvas: { w: 1920, h: 1080 } };
const SLIDE = { theme: 'minimal-dark', widgets: [] };

// Scale out of the stage's `transform: scale(n)`, to 4 decimals.
function scaleOf(host) {
  const m = /scale\(([\d.]+)\)/.exec(host.querySelector('.avs-thumb-stage')?.style.transform ?? '');
  return m ? Math.round(parseFloat(m[1]) * 10000) / 10000 : null;
}
function offsetOf(host) {
  const st = host.querySelector('.avs-thumb-stage')?.style;
  return { left: parseFloat(st?.left || '0'), top: parseFloat(st?.top || '0') };
}

function withHost(fn) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  try { fn(host); } finally { host.remove(); }
}

describe('renderSlideThumb · default fit takes the slide\'s own shape', () => {
  test('host height follows the canvas aspect', () => {
    withHost(host => {
      const dispose = renderSlideThumb(host, SLIDE, LANDSCAPE, { width: 320 });
      expect(host.style.height).toBe('180px');           // 320 / (16/9)
      expect(scaleOf(host)).toBe(0.1667);                 // 320 / 1920
      dispose();
    });
  });

  test('a portrait canvas is allowed to be tall — that is the point of the default', () => {
    withHost(host => {
      const dispose = renderSlideThumb(host, SLIDE, PORTRAIT, { width: 320 });
      expect(host.style.height).toBe('569px');            // 320 * 1920/1080
      dispose();
    });
  });
});

describe('renderSlideThumb · contain fit keeps the box it was given', () => {
  test('a portrait canvas letterboxes instead of stretching the box', () => {
    withHost(host => {
      const dispose = renderSlideThumb(host, SLIDE, PORTRAIT,
        { width: 360, fit: 'contain', maxHeight: 202 });
      // The box is untouched...
      expect(host.style.height).toBe('202px');
      // ...and the slide is the size that fits inside it. Asserted as the
      // NUMBER, not as a `fits <= box` predicate: a predicate on a scale the
      // renderer chose can be satisfied by arithmetic that happens to agree
      // with itself, and it prints "expected false to be true" when it breaks.
      expect(scaleOf(host)).toBe(0.1052);                 // 202 / 1920
      dispose();
    });
  });

  test('the leftover space is split evenly, so it reads as centred', () => {
    withHost(host => {
      const dispose = renderSlideThumb(host, SLIDE, PORTRAIT,
        { width: 360, fit: 'contain', maxHeight: 202 });
      // Both offsets against the BOX, never against the renderer's own scale —
      // deriving the expectation from the value under test is how a centring
      // check passes while the slide hangs 219 px above the top of its card.
      expect(offsetOf(host)).toEqual({ left: 123, top: 0 });   // (360 - 113.6)/2
      dispose();
    });
  });

  test('a canvas that matches the box is not shrunk to fit it', () => {
    withHost(host => {
      const dispose = renderSlideThumb(host, SLIDE, LANDSCAPE,
        { width: 320, fit: 'contain', maxHeight: 180 });
      expect(scaleOf(host)).toBe(0.1667);                 // width-limited, as before
      expect(offsetOf(host).left).toBe(0);
      dispose();
    });
  });

  test('re-rendering into the same host does not shrink it a little each time', () => {
    // The regression this guards: reading host.clientHeight AFTER writing a
    // height to it would feed each render the previous one's output.
    withHost(host => {
      host.style.width = '360px';
      host.style.height = '202px';
      let scale = null;
      for (let i = 0; i < 3; i++) {
        const dispose = renderSlideThumb(host, SLIDE, PORTRAIT, { fit: 'contain' });
        const s = scaleOf(host);
        if (scale === null) scale = s; else expect(s).toBe(scale);
        dispose();
      }
      expect(scale > 0).toBe(true);
    });
  });
});
