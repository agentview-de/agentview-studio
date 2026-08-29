// Duplicating a slide that carries variants.
//
// The duplicator gave the copy's widgets fresh ids — the default array only.
// A slide's language and A/B variants carry widgets too, and those kept the
// ids of the slide they were copied from.
//
// That is not a tidiness problem. A widget set to "provide data offline" gets
// its own data slot, and the slot is keyed on the widget id:
//
//     offlineSlugFor(w) → 'avs-d-' + w.id      (shared/offline-data.js)
//
// So the original slide's German variant and the duplicate's German variant
// addressed ONE slot. Point them at different URLs, press "Refresh data", and
// whichever wrote last decided what both displays show — with nothing on screen
// to say so. shared/offline-data.js already owns the phrase "every widget of a
// playlist, variants included"; the duplicator now uses it.
//
// Browser-only: it drives the real slide rail against the real store.

import { test, expect, describe } from './runner.js';
import { state, commit } from '../admin/store.js';
import { mountSlideRail } from '../admin/panels/slide-rail.js';
import { createPlaylist, createSlide, createWidget } from '../shared/slide-schema.js';
import { walkAllWidgets } from '../shared/slide-schema.js';
import { offlineSlugFor } from '../shared/offline-data.js';

const wid = (id, body) => ({ ...createWidget('text', { z: 1, rect: { x: 0, y: 0, w: 50, h: 50 }, content: { body } }), id });

function playlistWithVariants() {
  const pl = createPlaylist('duplikat');
  const s = createSlide({ duration: 10 });
  s.name = 'ORIGINAL';
  s.widgets = [wid('w_default', 'standard')];
  s.langs = { de: { widgets: [wid('w_de', 'deutsch')] } };
  s.abVariants = [{ label: 'B', widgets: [wid('w_ab', 'variante b')] }];
  pl.slides = [s];
  return pl;
}

const everyId = (pl) => {
  const out = [];
  walkAllWidgets(pl, w => out.push(w.id));
  return out;
};

// Duplicate through the rail's own context menu, so the test drives the code
// the user reaches rather than a copy of it.
async function duplicateFirstSlide(host) {
  const card = host.querySelector('.avs-slide-card');
  expect(card === null).toBeFalsy();
  card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 30 }));
  await new Promise(r => setTimeout(r, 30));
  const entry = [...document.querySelectorAll('.avs-context-menu .avs-menu-item')]
    .find(b => /duplizieren|duplicate/i.test(b.textContent || ''));
  expect(entry === undefined).toBeFalsy();
  entry.click();
  await new Promise(r => setTimeout(r, 120));
}

describe('slide duplicate · a copy shares nothing with its original', () => {
  test('REGRESSION: variant widgets get fresh ids, not the originals’', async () => {
    const saved = { pl: state.playlist, active: state.ui.activeSlideId, sel: state.ui.selectedWidgetId };
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-3000px;top:0;width:220px;height:600px;overflow:auto;';
    document.body.appendChild(host);
    try {
      state.playlist = playlistWithVariants();
      state.ui.activeSlideId = state.playlist.slides[0].id;
      state.ui.selectedWidgetId = null;
      commit('setup');
      mountSlideRail(host);
      await new Promise(r => setTimeout(r, 120));

      await duplicateFirstSlide(host);
      expect(state.playlist.slides).toHaveLength(2);

      const ids = everyId(state.playlist);
      expect(ids).toHaveLength(6);                    // 3 widgets × 2 slides
      expect(new Set(ids).size).toBe(6);              // …and no id twice
      // Named explicitly, because these three are the ones that used to survive.
      expect(ids.filter(i => i === 'w_de')).toHaveLength(1);
      expect(ids.filter(i => i === 'w_ab')).toHaveLength(1);
      expect(ids.filter(i => i === 'w_default')).toHaveLength(1);
    } finally {
      host.remove();
      state.playlist = saved.pl;
      state.ui.activeSlideId = saved.active;
      state.ui.selectedWidgetId = saved.sel;
    }
  });

  test('REGRESSION: the two slides no longer address one offline data slot', async () => {
    const saved = { pl: state.playlist, active: state.ui.activeSlideId };
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-3000px;top:0;width:220px;height:600px;overflow:auto;';
    document.body.appendChild(host);
    try {
      state.playlist = playlistWithVariants();
      state.ui.activeSlideId = state.playlist.slides[0].id;
      commit('setup');
      mountSlideRail(host);
      await new Promise(r => setTimeout(r, 120));
      await duplicateFirstSlide(host);

      const slugs = [];
      walkAllWidgets(state.playlist, w => slugs.push(offlineSlugFor(w)));
      expect(new Set(slugs).size).toBe(slugs.length);
      // The shape of the collision that used to happen, spelled out.
      expect(slugs.filter(s => s === 'avs-d-w_de')).toHaveLength(1);
    } finally {
      host.remove();
      state.playlist = saved.pl;
      state.ui.activeSlideId = saved.active;
    }
  });

  test('the copy still has the same CONTENT — only the identities are new', async () => {
    const saved = { pl: state.playlist, active: state.ui.activeSlideId };
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-3000px;top:0;width:220px;height:600px;overflow:auto;';
    document.body.appendChild(host);
    try {
      state.playlist = playlistWithVariants();
      state.ui.activeSlideId = state.playlist.slides[0].id;
      commit('setup');
      mountSlideRail(host);
      await new Promise(r => setTimeout(r, 120));
      await duplicateFirstSlide(host);

      const [a, b] = state.playlist.slides;
      expect(a.id === b.id).toBeFalsy();
      const body = (s, pick) => pick(s).map(w => w.content?.body).join('|');
      expect(body(b, x => x.widgets)).toBe(body(a, x => x.widgets));
      expect(body(b, x => x.langs.de.widgets)).toBe('deutsch');
      expect(body(b, x => x.abVariants[0].widgets)).toBe('variante b');
      expect(b.abVariants[0].label).toBe('B');
    } finally {
      host.remove();
      state.playlist = saved.pl;
      state.ui.activeSlideId = saved.active;
    }
  });
});
