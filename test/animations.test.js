// Animation catalogs + helpers, and widget anim/loop persistence through the
// save/load round-trip. Pure logic only (no DOM) so it stays robust.

import { test, expect, describe } from './runner.js';
import {
  SLIDE_TRANSITIONS, TRANSITION_IDS,
  WIDGET_BUILDS, BUILD_IDS,
  AMBIENT_EFFECTS, AMBIENT_IDS,
  normalizeBuild, isBuild, isLoop, BUILD_DEFAULT_MS,
} from '../shared/animations.js';
import { createWidget, migratePlaylist, createPlaylist, createSlide, SCHEMA_VERSION } from '../shared/slide-schema.js';

const uniq = arr => new Set(arr).size === arr.length;

describe('animation catalogs', () => {
  test('every catalog has unique, non-empty ids', () => {
    for (const ids of [TRANSITION_IDS, BUILD_IDS, AMBIENT_IDS]) {
      expect(ids.length > 0).toBeTruthy();
      expect(uniq(ids)).toBeTruthy();
      expect(ids.every(id => typeof id === 'string' && id.length > 0)).toBeTruthy();
    }
  });

  test('id arrays mirror their {id,label} catalog', () => {
    expect(TRANSITION_IDS).toEqual(SLIDE_TRANSITIONS.map(t => t.id));
    expect(BUILD_IDS).toEqual(WIDGET_BUILDS.map(b => b.id));
    expect(AMBIENT_IDS).toEqual(AMBIENT_EFFECTS.map(a => a.id));
  });

  test('builds + ambient catalogs include the "none" opt-out; transitions do not', () => {
    expect(BUILD_IDS).toContain('none');
    expect(AMBIENT_IDS).toContain('none');
    expect(TRANSITION_IDS.includes('none')).toBeFalsy();
  });

  test('originals fade/slide/dissolve are still offered as transitions', () => {
    for (const id of ['fade', 'slide', 'dissolve']) expect(TRANSITION_IDS).toContain(id);
  });
});

describe('normalizeBuild / isBuild / isLoop', () => {
  test('returns null for none / missing / invalid', () => {
    expect(normalizeBuild(null)).toBe(null);
    expect(normalizeBuild(undefined)).toBe(null);
    expect(normalizeBuild({ type: 'none' })).toBe(null);
    expect(normalizeBuild({ type: 'does-not-exist' })).toBe(null);
    expect(normalizeBuild({})).toBe(null);
  });

  test('fills defaults and clamps timing', () => {
    expect(normalizeBuild({ type: 'fade' })).toEqual({ type: 'fade', duration: BUILD_DEFAULT_MS, delay: 0 });
    // over-max clamps
    expect(normalizeBuild({ type: 'zoom', duration: 99999, delay: 99999 }))
      .toEqual({ type: 'zoom', duration: 5000, delay: 10000 });
    // under-min clamps duration up
    expect(normalizeBuild({ type: 'zoom', duration: 1 }).duration).toBe(100);
  });

  test('isBuild / isLoop agree with the catalogs', () => {
    expect(isBuild({ type: 'fade-up' })).toBeTruthy();
    expect(isBuild({ type: 'none' })).toBeFalsy();
    expect(isLoop('float')).toBeTruthy();
    expect(isLoop('none')).toBeFalsy();
    expect(isLoop('nope')).toBeFalsy();
    expect(isLoop(undefined)).toBeFalsy();
  });
});

describe('widget anim/loop persistence', () => {
  test('createWidget keeps anim + loop only when meaningfully set', () => {
    const w = createWidget('text', { anim: { type: 'fade-up', delay: 200, duration: 500 }, loop: 'float' });
    expect(w.anim).toEqual({ type: 'fade-up', delay: 200, duration: 500 });
    expect(w.loop).toBe('float');
  });

  test('createWidget omits anim:none and loop:none (no empty keys in JSON)', () => {
    const w = createWidget('text', { anim: { type: 'none' }, loop: 'none' });
    expect('anim' in w).toBeFalsy();
    expect('loop' in w).toBeFalsy();
  });

  test('createWidget omits anim/loop entirely when absent', () => {
    const w = createWidget('text');
    expect('anim' in w).toBeFalsy();
    expect('loop' in w).toBeFalsy();
  });

  test('a playlist with animated widgets round-trips byte-identical', () => {
    const pl = createPlaylist('Anim');
    pl.slides.push(createSlide({
      transition: 'zoom-blur',
      widgets: [createWidget('text', { anim: { type: 'rise', delay: 150, duration: 700 }, loop: 'kenburns' })],
    }));
    const json = JSON.stringify(pl);
    const back = migratePlaylist(JSON.parse(json));
    expect(back.schemaVersion).toBe(SCHEMA_VERSION);
    expect(JSON.stringify(back)).toBe(json);
  });
});
