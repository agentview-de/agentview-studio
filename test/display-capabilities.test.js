// Tests for the display-capabilities reader. The bug these pin: the drawer used
// `ft.supportsFetch !== false`, so a display that never reported anything (the
// request failed → caps is null → features is {}) rendered fetch / WS / CSS-Vars
// as if it had said yes, while a display that explicitly reported "no fetch"
// rendered nothing. On a signage product that is the difference between shipping
// a network widget to a screen that can run it and to one that cannot.

import { test, expect, describe } from './runner.js';
import { readCapabilities, readLimitations, FEATURE_FLAGS } from '../shared/display-capabilities.js';

describe('display-capabilities · no report at all', () => {
  test('null (the failed-request case) claims nothing', () => {
    const r = readCapabilities(null);
    expect(r.reported).toBe(false);
    expect(r.features).toHaveLength(0);
    expect(r.facts).toHaveLength(0);
  });
  test('undefined and non-objects are treated the same', () => {
    expect(readCapabilities(undefined).reported).toBe(false);
    expect(readCapabilities('offline').reported).toBe(false);
  });
  test('an empty response is reported-but-empty, not unreported', () => {
    const r = readCapabilities({});
    expect(r.reported).toBe(true);
    expect(r.features).toHaveLength(0);
  });
});

describe('display-capabilities · the three states', () => {
  test('a flag reported true is supported', () => {
    const r = readCapabilities({ runtime: { features: { supportsFetch: true } } });
    expect(r.features).toHaveLength(1);
    expect(r.features[0].key).toBe('supportsFetch');
    expect(r.features[0].supported).toBe(true);
  });
  test('a flag reported false is carried through as an explicit NO', () => {
    const r = readCapabilities({ runtime: { features: { supportsFetch: false } } });
    expect(r.features).toHaveLength(1);
    expect(r.features[0].supported).toBe(false);
  });
  test('REGRESSION: a missing flag makes no claim in either direction', () => {
    const r = readCapabilities({ runtime: { features: {} } });
    expect(r.features).toHaveLength(0);
  });
  test('REGRESSION: an absent features block makes no claim', () => {
    const r = readCapabilities({ runtime: {} });
    expect(r.features).toHaveLength(0);
  });
  test('non-boolean values are not coerced into a claim', () => {
    const r = readCapabilities({ runtime: { features: { supportsFetch: 'yes', supportsWebGl: 1, supportsWebSockets: null } } });
    expect(r.features).toHaveLength(0);
  });
  test('a mixed report keeps only what was actually stated', () => {
    const r = readCapabilities({ runtime: { features: {
      supportsFetch: true, supportsWebSockets: false, supportsCssVariables: undefined,
    } } });
    expect(r.features).toHaveLength(2);
    expect(r.features.map(f => f.key)).toEqual(['supportsFetch', 'supportsWebSockets']);
    expect(r.features.map(f => f.supported)).toEqual([true, false]);
  });
  test('features come back in the declared order, not object order', () => {
    const flags = {};
    for (const f of [...FEATURE_FLAGS].reverse()) flags[f.key] = true;
    const r = readCapabilities({ runtime: { features: flags } });
    expect(r.features.map(f => f.key)).toEqual(FEATURE_FLAGS.map(f => f.key));
  });
});

describe('display-capabilities · facts', () => {
  test('resolution is only reported when both sides are known', () => {
    expect(readCapabilities({ runtime: { screen: { width: 1920, height: 1080 } } }).facts[0].text).toBe('1920×1080');
    expect(readCapabilities({ runtime: { screen: { width: 1920 } } }).facts).toHaveLength(0);
  });
  test('a device pixel ratio of 1 is not worth printing', () => {
    const r = readCapabilities({ runtime: { screen: { width: 1920, height: 1080, devicePixelRatio: 1 } } });
    expect(r.facts[0].text).toBe('1920×1080');
  });
  test('a non-1 device pixel ratio is appended', () => {
    const r = readCapabilities({ runtime: { screen: { width: 1280, height: 720, devicePixelRatio: 2 } } });
    expect(r.facts[0].text).toBe('1280×720 @ 2x');
  });
  test('screen may also arrive at the top level (older payloads)', () => {
    const r = readCapabilities({ screen: { width: 800, height: 480 } });
    expect(r.facts[0].text).toBe('800×480');
  });
  test('browser version falls back from major to version', () => {
    expect(readCapabilities({ runtime: { browser: { name: 'Chrome', major: '120' } } }).facts[0].text).toBe('Chrome 120');
    expect(readCapabilities({ runtime: { browser: { name: 'Chrome', version: '120.0.1' } } }).facts[0].text).toBe('Chrome 120.0.1');
    expect(readCapabilities({ runtime: { browser: { name: 'Chrome' } } }).facts[0].text).toBe('Chrome');
  });
  test('touch is only claimed on an explicit true', () => {
    expect(readCapabilities({ runtime: { input: { hasTouch: true } } }).facts).toHaveLength(1);
    expect(readCapabilities({ runtime: { hasTouch: true } }).facts).toHaveLength(1);
    expect(readCapabilities({ runtime: { input: { hasTouch: 1 } } }).facts).toHaveLength(0);
    expect(readCapabilities({ runtime: { input: {} } }).facts).toHaveLength(0);
  });
});

describe('display-capabilities · limitations', () => {
  test('missing or malformed limitations yield an empty list', () => {
    expect(readLimitations(null)).toHaveLength(0);
    expect(readLimitations({})).toHaveLength(0);
    expect(readLimitations({ runtime: { knownLimitations: 'no video' } })).toHaveLength(0);
  });
  test('blank entries are dropped so the note never renders empty', () => {
    expect(readLimitations({ runtime: { knownLimitations: ['no autoplay', '', '  '] } }))
      .toEqual(['no autoplay']);
  });
});
