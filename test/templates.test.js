// The slide-set template catalog.
//
// Templates are shipped CONTENT, and content rots in ways code does not: a
// widget type gets renamed, a theme is dropped, a plugin's select gains a value
// and loses another, someone writes an English string and forgets the German.
// None of that shows up until a user opens the store and finds a broken card.
// These tests are the tripwire — they build every template in both languages
// and assert the result is a playlist the editor and the player would accept.
//
// Deliberately DOM-free: buildPlaylist takes an injectable plugin lookup, so
// the whole catalog is checkable in the headless run rather than only in the
// browser suite. What needs real plugins (do these types exist? are these
// content keys the ones the plugin reads?) is covered in the browser suite by
// plugin-resilience, which mounts every registered type.

import { test, expect, describe } from './runner.js';
import '../shared/templates/all.js';
import {
  listTemplates, getTemplate, buildPlaylist, buildSlides, matchesQuery,
  templateWidgetTypes, templateSlideCount, usedCategories, localizeCategory,
  searchHaystack, TEMPLATE_CATEGORIES,
} from '../shared/templates/registry.js';
import { L, localize, isL, mapL, at, W, S } from '../shared/templates/lib.js';
import { SCHEMA_VERSION, validateSlide, validateWidget } from '../shared/slide-schema.js';
import { ALL_THEMES } from '../shared/data/themes.js';
import { TRANSITION_IDS, BUILD_IDS, AMBIENT_IDS } from '../shared/animations.js';

// No plugin registry in the headless run — templates must not need one.
const noPlugins = () => undefined;
const build = (id, lang) => buildPlaylist(id, { lang, getPlugin: noPlugins });
const all = () => listTemplates();

// Every widget of every template, once, with enough context to name it in a
// failure message. Walked from the BUILT playlist, not the spec, so anything
// buildSlides() does to a widget is inside the assertion.
function everyWidget(lang = 'en') {
  const out = [];
  for (const tpl of all()) {
    for (const slide of build(tpl.id, lang).slides) {
      for (const w of slide.widgets) out.push({ tpl, slide, w, where: `${tpl.id} › ${slide.name ?? slide.id} › ${w.type}` });
    }
  }
  return out;
}

describe('templates · catalog shape', () => {
  test('the catalog is stocked — well past the 20 the store promises', () => {
    expect(all().length >= 20).toBe(true);
  });
  test('exactly one blank starter, and it is the first card', () => {
    const blanks = all().filter(t => t.category === 'blank');
    expect(blanks).toHaveLength(1);
    expect(all()[0].id).toBe('blank');
  });
  test('ids are unique', () => {
    const ids = all().map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  test('every category the sidebar can show has at least one template', () => {
    for (const c of usedCategories()) {
      expect(all().some(t => t.category === c.id)).toBe(true);
    }
  });
  test('every category carries both language labels', () => {
    for (const c of TEMPLATE_CATEGORIES) {
      expect(typeof localizeCategory(c, 'en')).toBe('string');
      expect(localizeCategory(c, 'de').length > 0).toBe(true);
    }
  });
  test('every template has a bilingual name and description', () => {
    for (const tpl of all()) {
      for (const field of ['name', 'description']) {
        expect(isL(tpl[field])).toBe(true);
        expect(String(localize(tpl[field], 'en')).length > 0).toBe(true);
        expect(String(localize(tpl[field], 'de')).length > 0).toBe(true);
      }
    }
  });
  test('an unknown id throws rather than returning an empty deck', () => {
    expect(() => buildPlaylist('no-such-template')).toThrow();
    expect(getTemplate('no-such-template')).toBe(undefined);
  });
});

describe('templates · build produces a valid playlist', () => {
  test('every template builds in both languages', () => {
    for (const tpl of all()) for (const lang of ['en', 'de']) {
      const pl = build(tpl.id, lang);
      expect(pl.schemaVersion).toBe(SCHEMA_VERSION);
      expect(Array.isArray(pl.slides)).toBe(true);
      expect(pl.slides.length > 0).toBe(true);
    }
  });
  test('every real template ships at least three slides', () => {
    for (const tpl of all()) {
      if (tpl.category === 'blank') continue;
      // A one-slide "set" is a widget, not a slide set — the store card would
      // be promising something it does not deliver. The portrait door sign is
      // the one honest exception: a door display IS one slide.
      const min = tpl.id === 'hotel-meeting-room' ? 1 : 3;
      expect(templateSlideCount(tpl) >= min).toBe(true);
    }
  });
  test('every slide and widget passes the schema validators', () => {
    for (const { slide, w, where } of everyWidget()) {
      if (!validateSlide(slide)) throw new Error(`invalid slide: ${where}`);
      if (!validateWidget(w)) throw new Error(`invalid widget: ${where}`);
    }
  });
  test('two builds of the same template never share ids', () => {
    const a = build('gastro-daily-menu', 'en');
    const b = build('gastro-daily-menu', 'en');
    expect(a.id === b.id).toBe(false);
    const idsA = new Set(a.slides.flatMap(s => [s.id, ...s.widgets.map(w => w.id)]));
    for (const s of b.slides) {
      expect(idsA.has(s.id)).toBe(false);
      for (const w of s.widgets) expect(idsA.has(w.id)).toBe(false);
    }
  });
  test('ids are unique WITHIN one built playlist', () => {
    for (const tpl of all()) {
      const pl = build(tpl.id, 'en');
      const ids = pl.slides.flatMap(s => [s.id, ...s.widgets.map(w => w.id)]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  test('the playlist records which template it came from', () => {
    const pl = build('health-waiting-room', 'de');
    expect(pl.metadata.templateId).toBe('health-waiting-room');
    expect(pl.metadata.templateLang).toBe('de');
  });
  test('buildSlides returns slides without touching canvas or defaults', () => {
    const slides = buildSlides('corp-reception', { lang: 'en', getPlugin: noPlugins });
    expect(Array.isArray(slides)).toBe(true);
    expect(slides.length > 0).toBe(true);
    // The append path pushes these into an EXISTING playlist, so a stray
    // canvas/defaults key riding along would silently reshape that deck.
    for (const s of slides) {
      expect('canvas' in s).toBe(false);
      expect('defaults' in s).toBe(false);
    }
  });
  test('contentVersion is stamped from the plugin, so fresh content is not re-migrated', () => {
    const slides = buildSlides('gastro-daily-menu', {
      lang: 'en',
      getPlugin: type => (type === 'menu' ? { schemaVersion: 4 } : { schemaVersion: 1 }),
    });
    const menu = slides.flatMap(s => s.widgets).find(w => w.type === 'menu');
    expect(menu.contentVersion).toBe(4);
  });
});

describe('templates · content is sane on a real screen', () => {
  test('no widget hangs off the slide', () => {
    for (const { w, where } of everyWidget()) {
      const r = w.rect;
      const ok = r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0
        && r.x + r.w <= 100.001 && r.y + r.h <= 100.001;
      if (!ok) throw new Error(`rect off-slide: ${where} ${JSON.stringify(r)}`);
    }
  });
  test('no clock in the catalog captions itself with a time zone', () => {
    // The clock widget renders `label || timezone`, which is what its help
    // text promises and which made a blank label undeclinable: nine slides
    // shipped with a small uppercase EUROPE/BERLIN over the clock, 29 px of it
    // on the school board. cornerClock() now sets showLabel:false, and this is
    // the check that a future template does not go back to hand-rolling a
    // clock widget and reintroduce it.
    const bad = [];
    for (const { w, where } of everyWidget()) {
      if (w.type !== 'clock') continue;
      const c = w.content ?? {};
      if (c.showLabel === false) continue;
      // Label on: it has to be a label somebody wrote, not a fallback.
      if (!String(c.label ?? '').trim()) bad.push(where);
    }
    if (bad.length) {
      throw new Error(`${bad.length} clock(s) fall back to the time zone as their label — `
        + `set showLabel:false or give them one:\n  ` + bad.join('\n  '));
    }
  });

  test('every slide has a duration long enough to read', () => {
    for (const tpl of all()) for (const s of build(tpl.id, 'en').slides) {
      if (!(s.duration >= 5)) throw new Error(`${tpl.id} › ${s.name}: ${s.duration}s is too short to read`);
    }
  });
  test('themes, transitions, builds and loops all name something that exists', () => {
    for (const tpl of all()) {
      const pl = build(tpl.id, 'en');
      expect(ALL_THEMES).toContain(pl.defaults.theme);
      expect(TRANSITION_IDS).toContain(pl.defaults.transition);
      for (const s of pl.slides) {
        expect(ALL_THEMES).toContain(s.theme);
        expect(TRANSITION_IDS).toContain(s.transition);
        for (const w of s.widgets) {
          if (w.anim) expect(BUILD_IDS).toContain(w.anim.type);
          if (w.loop) expect(AMBIENT_IDS).toContain(w.loop);
          // A widget's own `theme` is a content key, but it is the one that
          // actually paints — a typo here shows as an unstyled slide.
          if (typeof w.content?.theme === 'string') expect(ALL_THEMES).toContain(w.content.theme);
        }
      }
    }
  });
  test('nothing ships a hard-coded absolute date', () => {
    // A countdown to a fixed day in 2026 is broken scenery in 2027. Everything
    // time-shaped in the catalog is relative to build time (lib.js: inDays /
    // daysAgo / at), so no built playlist may contain a literal date string
    // more than a year old.
    const cutoff = Date.now() - 365 * 86400000;
    for (const tpl of all()) {
      const json = JSON.stringify(build(tpl.id, 'en'));
      for (const m of json.matchAll(/"(\d{4}-\d{2}-\d{2})T/g)) {
        const ms = Date.parse(m[1]);
        if (Number.isFinite(ms) && ms < cutoff) throw new Error(`${tpl.id} ships a stale date: ${m[1]}`);
      }
      for (const m of json.matchAll(/"at":(\d{12,})/g)) {
        if (Number(m[1]) < cutoff) throw new Error(`${tpl.id} ships a stale epoch: ${m[1]}`);
      }
    }
  });
  test('no bilingual placeholder survives into the built playlist', () => {
    for (const lang of ['en', 'de']) {
      for (const tpl of all()) {
        const json = JSON.stringify(build(tpl.id, lang));
        expect(json).notToContain('$i18n');
        // The other half of the same mistake: interpolating an L() into a
        // template literal stringifies it. A headline in the catalog read
        // "[object Object]" on the canvas before mapL() existed.
        expect(json).notToContain('[object Object]');
      }
    }
  });
  test('every headline really is a heading element', () => {
    // <h1> is UNWRAPPED by the announcement sanitizer (H1 belongs to the slide
    // title), so a headline authored as one silently became body text: same
    // size, same weight, no heading at all.
    for (const tpl of all()) {
      expect(JSON.stringify(build(tpl.id, 'de'))).notToContain('<h1>');
    }
  });
  test('English and German builds differ — the translation is real, not a copy', () => {
    // One template with plenty of prose is enough to catch "German = English"
    // wholesale; per-string coverage is the author's job, not a test's.
    const en = JSON.stringify(build('health-waiting-room', 'en'));
    const de = JSON.stringify(build('health-waiting-room', 'de'));
    expect(en === de).toBe(false);
    expect(de).toContain('Wartezeit');
  });
  test('the blank starter really is blank', () => {
    const pl = build('blank', 'en');
    expect(pl.slides).toHaveLength(1);
    expect(pl.slides[0].widgets).toHaveLength(0);
  });
});

describe('templates · search', () => {
  test('an empty query matches everything', () => {
    for (const tpl of all()) expect(matchesQuery(tpl, '   ')).toBe(true);
  });
  test('a name matches in both languages', () => {
    const tpl = getTemplate('health-waiting-room');
    expect(matchesQuery(tpl, 'waiting')).toBe(true);
    expect(matchesQuery(tpl, 'Wartezimmer')).toBe(true);
  });
  test('a widget type is searchable without anyone tagging it', () => {
    const tpl = getTemplate('public-citizen-office');
    expect(searchHaystack(tpl)).toContain('queue-call');
    expect(matchesQuery(tpl, 'queue')).toBe(true);
  });
  test('all terms must match, not just one', () => {
    const tpl = getTemplate('gastro-daily-menu');
    expect(matchesQuery(tpl, 'menu bistro')).toBe(true);
    expect(matchesQuery(tpl, 'menu spacecraft')).toBe(false);
  });
  test('templateWidgetTypes lists each type once', () => {
    for (const tpl of all()) {
      const types = templateWidgetTypes(tpl);
      expect(new Set(types).size).toBe(types.length);
    }
  });
});

describe('templates · lib', () => {
  test('L() resolves per language and falls back to English', () => {
    expect(localize(L('Hello', 'Hallo'), 'de')).toBe('Hallo');
    expect(localize(L('Hello', 'Hallo'), 'en')).toBe('Hello');
    expect(localize(L('Hello'), 'de')).toBe('Hello');
  });
  test('localize walks arrays and nested objects', () => {
    const node = { a: [L('one', 'eins'), { b: L('two', 'zwei') }], c: 3 };
    expect(localize(node, 'de')).toEqual({ a: ['eins', { b: 'zwei' }], c: 3 });
  });
  test('localize returns a copy — a build can never mutate the catalog', () => {
    const src = { rows: [{ name: L('x', 'y') }] };
    const out = localize(src, 'en');
    out.rows[0].name = 'changed';
    expect(isL(src.rows[0].name)).toBe(true);
  });
  test('W() only persists the optional keys it was actually given', () => {
    const bare = W('text', [0, 0, 100, 100], { body: 'hi' });
    expect('anim' in bare).toBe(false);
    expect('loop' in bare).toBe(false);
    expect('z' in bare).toBe(false);
    const rich = W('image', [1, 2, 3, 4], {}, { anim: 'fade-up', delay: 200, loop: 'kenburns', z: 3 });
    expect(rich.anim).toEqual({ type: 'fade-up', delay: 200, duration: 600 });
    expect(rich.loop).toBe('kenburns');
    expect(rich.z).toBe(3);
    expect(rich.rect).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });
  test('S() always yields a widgets array', () => {
    expect(S({ name: 'x' }).widgets).toEqual([]);
  });
  test('mapL wraps a string without collapsing the other language', () => {
    const wrapped = mapL(L('Sale', 'Aktion'), str => '<h2>' + str + '</h2>');
    expect(localize(wrapped, 'en')).toBe('<h2>Sale</h2>');
    expect(localize(wrapped, 'de')).toBe('<h2>Aktion</h2>');
    expect(mapL('plain', str => str.toUpperCase())).toBe('PLAIN');
  });
  test('at() produces a datetime-local string relative to today', () => {
    expect(at(0, '09:30')).toMatch(/^\d{4}-\d{2}-\d{2}T09:30$/);
    const today = at(0, '00:00').slice(0, 10);
    const tomorrow = at(1, '00:00').slice(0, 10);
    expect(today === tomorrow).toBe(false);
  });
});
