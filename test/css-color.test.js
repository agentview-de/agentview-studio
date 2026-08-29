// Canvas colours. `ctx.fillStyle = 'blau'` is ignored; a gradient stop THROWS,
// and the throw happens inside an animation frame — outside the plugin's
// try/catch and outside mountWidget's. The audio-viz and chart widgets fed it
// operator input guarded only by `|| '#8b5cf6'`, which catches an empty field
// and nothing else. A display that met `FF00FF` from an import, or a half-typed
// `#12`, stopped drawing for the rest of the day.
//
// Runs in both worlds: in the browser the check IS the browser's parser, in
// Node it is the conservative fallback. The cases below are the ones both must
// agree on — that agreement is what makes the headless run meaningful.

import { test, expect, describe } from './runner.js';
import { canvasColor, fadeToTransparent } from '../shared/css-color.js';

const FB = '#8b5cf6';

describe('canvasColor · what a gradient will accept', () => {
  test('keeps the colours the widgets actually store', () => {
    for (const good of ['#8b5cf6', '#fff', '#8b5cf600', 'rgb(1, 2, 3)', 'rgba(1,2,3,.5)', 'red', 'transparent']) {
      expect(canvasColor(good, FB)).toBe(good);
    }
  });

  test('REGRESSION: replaces the values that used to throw mid-draw', () => {
    // Every one of these is reachable without an attacker: an Office import, a
    // half-typed field, a German colour name, a field of spaces.
    for (const bad of ['FF00FF', '#12345', '#12', 'blau', 'rgb(12,34)', '   ']) {
      expect(canvasColor(bad, FB)).toBe(FB);
    }
  });

  test('REGRESSION: var() is refused even though CSS.supports() allows it', () => {
    // A canvas has no element to resolve a custom property against, so this is
    // the one case where asking CSS.supports() gives the wrong answer.
    expect(canvasColor('var(--bb-accent)', FB)).toBe(FB);
    expect(canvasColor('var(--x, #fff)', FB)).toBe(FB);
  });

  test('anything that is not a string falls back', () => {
    for (const bad of [null, undefined, 0, 42, {}, [], true]) {
      expect(canvasColor(bad, FB)).toBe(FB);
    }
  });

  test('the empty string falls back — the old `|| default` guard, kept', () => {
    expect(canvasColor('', FB)).toBe(FB);
  });
});

describe('fadeToTransparent · the alpha tail', () => {
  test('a 6-digit hex keeps its hue and loses its alpha', () => {
    expect(fadeToTransparent('#8b5cf6')).toBe('#8b5cf600');
    expect(fadeToTransparent('  #06b6d4  ')).toBe('#06b6d400');
  });

  test('REGRESSION: everything else fades to transparent instead of throwing', () => {
    // `'red' + '00'` was a DOMException; so was `rgb(1,2,3)00`.
    for (const c of ['red', 'rgb(1,2,3)', '#fff', '#8b5cf600', 'transparent', '', null, undefined]) {
      expect(fadeToTransparent(c)).toBe('transparent');
    }
  });
});
