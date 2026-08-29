// A brand-kit value is not trusted input.
//
// It arrives from an imported playlist file, or from the organisation, and it
// goes straight into a CSS custom property that the themes substitute into
// `background`, `color` and `font`. A custom property accepts almost any token
// sequence — so a "colour" of `url(https://example.org/x.png)` was stored,
// substituted into `background: var(--bb-st-bg)`, and FETCHED.
//
// Every display showing that playlist would call that URL, on every slide, for
// as long as it ran: a beacon carrying the screen's IP and user agent, entirely
// outside the editor's privacy gate — which knows about widgets and has never
// heard of brand kits. It worked in the editor too.
//
// Measured before it was fixed: the request appears in the network log with a
// 404 from the dev server. This suite asserts the request is not even attempted.
//
// Browser-only: it needs a real element, a real CSS cascade, and a real parser.

import { test, expect, describe } from './runner.js';
import { applyBrandKit } from '../shared/brand-kit-apply.js';

/** Apply `kit` to an element wired the way the themes wire it, and look. */
function applied(kit) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:-3000px;top:0;width:60px;height:60px;'
    + 'background:var(--bb-st-bg);color:var(--bb-st-fg);font-family:var(--bb-st-font);';
  document.body.appendChild(el);
  try {
    applyBrandKit(el, kit);
    const cs = getComputedStyle(el);
    return {
      bg: el.style.getPropertyValue('--bb-st-bg'),
      fg: el.style.getPropertyValue('--bb-st-fg'),
      accent: el.style.getPropertyValue('--bb-st-accent'),
      font: el.style.getPropertyValue('--bb-st-font'),
      // The thing that actually costs something: a resolved image.
      image: cs.backgroundImage,
    };
  } finally { el.remove(); }
}

describe('brand kit · a colour that is not a colour', () => {
  test('REGRESSION: url() in a colour is refused, and nothing is fetched', () => {
    const r = applied({ colors: { bg: 'url(https://example.org/beacon.png)' } });
    expect(r.bg).toBe('');
    expect(r.image).toBe('none');
  });

  test('REGRESSION: the other ways to name a request are refused too', () => {
    for (const bad of [
      '-webkit-image-set(url(https://example.org/a.png) 1x)',
      'image-set(url(https://example.org/a.png) 1x)',
      'linear-gradient(red, url(https://example.org/a.png))',
      'var(--something-else)',
    ]) {
      const r = applied({ colors: { bg: bad } });
      expect(r.bg).toBe('');
      expect(r.image).toBe('none');
    }
  });

  test('REGRESSION: a font is a font stack, not a request', () => {
    expect(applied({ font: 'url(https://example.org/f.woff2)' }).font).toBe('');
    expect(applied({ font: 'var(--x)' }).font).toBe('');
    expect(applied({ font: 'Inter; background: red' }).font).toBe('');
  });

  test('a refused value leaves the theme’s own colour standing', () => {
    // Not a fallback of our choosing: simply unset, so slide-themes.css wins.
    const r = applied({ colors: { bg: 'url(https://example.org/a.png)', fg: '#eeeeee' } });
    expect(r.bg).toBe('');
    expect(r.fg).toBe('#eeeeee');   // the good half of the kit still applies
  });
});

describe('brand kit · the colours people actually set', () => {
  test('hex, rgb and a named colour all pass', () => {
    const r = applied({ colors: { bg: '#123456', fg: 'rgb(10 20 30)', accent: 'rebeccapurple' } });
    expect(r.bg).toBe('#123456');
    expect(r.fg).toBe('rgb(10 20 30)');
    expect(r.accent).toBe('rebeccapurple');
  });

  test('a real font stack passes, quotes and all', () => {
    expect(applied({ font: '"Helvetica Neue", Arial, sans-serif' }).font)
      .toBe('"Helvetica Neue", Arial, sans-serif');
    expect(applied({ font: 'Inter' }).font).toBe('Inter');
  });

  test('an empty or absent kit clears what a previous one set', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    try {
      applyBrandKit(el, { colors: { bg: '#111111' } });
      expect(el.style.getPropertyValue('--bb-st-bg')).toBe('#111111');
      applyBrandKit(el, null);
      expect(el.style.getPropertyValue('--bb-st-bg')).toBe('');
    } finally { el.remove(); }
  });

  test('rubbish in a colour field is refused without taking the rest down', () => {
    // The everyday case, not the attack: a half-typed hex from an importer.
    const r = applied({ colors: { bg: '#12', fg: 'blau', accent: '#00ff00' } });
    expect(r.bg).toBe('');
    expect(r.fg).toBe('');
    expect(r.accent).toBe('#00ff00');
  });
});
