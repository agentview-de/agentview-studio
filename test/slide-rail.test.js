// The slide rail redraws only what changed.
//
// It used to call replaceChildren() and rebuild every card on every
// notification — and the store notifies for ANY nested change, so one keystroke
// in a text field rebuilt the whole list, as did clicking another slide.
// Measured on a 200-slide playlist: ~50 ms per keystroke, ~54 ms per selection.
// That is typing at twenty frames a second, and it grew with the playlist.
//
// The store hands every subscriber the path that changed, which is enough to be
// exact: `playlist.slides.7.name` touches card 7 and nothing else, and a
// selection change is three attributes on two cards.
//
// The performance cases below assert ELEMENT IDENTITY rather than timings: a
// card that was not supposed to be redrawn must still be the same object. That
// fails the moment someone puts replaceChildren() back, and it never flakes.
//
// Browser-only: it mounts the real rail into a real document.

import { test, expect, describe } from './runner.js';
import { state } from '../admin/store.js';
import { mountSlideRail } from '../admin/panels/slide-rail.js';

function makeSlides(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `rail-s${i}`,
    name: `Slide ${i}`,
    duration: 8,
    widgets: [
      { id: `rail-w${i}a`, type: 'text', z: 1, rect: { x: 5, y: 5, w: 40, h: 40 }, content: {} },
      { id: `rail-w${i}b`, type: 'clock', z: 2, rect: { x: 50, y: 5, w: 40, h: 40 }, content: {} },
    ],
  }));
}

/** Mount a rail over a throwaway playlist and put the store back afterwards. */
// async, and it AWAITS. A synchronous try/finally around an async callback
// tears the rail down before the body has run, so the assertions look at a
// removed host and restored state — they pass, and they mean nothing. Sync
// callbacks are unaffected.
async function withRail(n, fn) {
  const savedPlaylist = state.playlist;
  const savedSlide = state.ui.activeSlideId;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-3000px;top:0;width:220px;height:400px;';
  document.body.appendChild(host);
  try {
    state.playlist = { schemaVersion: 3, id: 'rail-test', name: 'Rail', slides: makeSlides(n), defaults: { theme: 'minimal-dark' } };
    state.ui.activeSlideId = state.playlist.slides[0].id;
    mountSlideRail(host);
    await fn({
      host,
      cards: () => [...host.querySelectorAll('.avs-slide-card')],
      names: () => [...host.querySelectorAll('.avs-slide-name')].map(e => e.textContent),
    });
  } finally {
    host.remove();
    state.playlist = savedPlaylist;
    state.ui.activeSlideId = savedSlide;
  }
}

describe('slide rail · shows the playlist', () => {
  test('one card per slide, numbered and named', async () => {
    await withRail(4, ({ cards, names }) => {
      expect(cards()).toHaveLength(4);
      expect(names()).toEqual(['Slide 0', 'Slide 1', 'Slide 2', 'Slide 3']);
      expect([...cards()[2].querySelectorAll('.avs-slide-index')][0].textContent).toBe('3');
    });
  });

  test('renaming a slide updates its card', async () => {
    await withRail(4, ({ names }) => {
      state.playlist.slides[1].name = 'Angebot der Woche';
      expect(names()[1]).toBe('Angebot der Woche');
    });
  });

  test('the thumbnail follows the widgets', async () => {
    await withRail(3, ({ cards }) => {
      expect(cards()[1].querySelectorAll('.avs-thumb-block')).toHaveLength(2);
      state.playlist.slides[1].widgets = state.playlist.slides[1].widgets.slice(0, 1);
      expect(cards()[1].querySelectorAll('.avs-thumb-block')).toHaveLength(1);
    });
  });

  test('reordering the array reorders and renumbers the cards', async () => {
    await withRail(3, ({ names, cards }) => {
      state.playlist.slides = [...state.playlist.slides].reverse();
      expect(names()).toEqual(['Slide 2', 'Slide 1', 'Slide 0']);
      expect([...cards()].map(c => c.querySelector('.avs-slide-index').textContent)).toEqual(['1', '2', '3']);
    });
  });

  test('adding and removing slides is reflected', async () => {
    await withRail(3, ({ cards }) => {
      state.playlist.slides.push({ id: 'rail-extra', name: 'Neu', duration: 8, widgets: [] });
      expect(cards()).toHaveLength(4);
      state.playlist.slides = state.playlist.slides.filter(s => s.id !== 'rail-s0');
      expect(cards()).toHaveLength(3);
    });
  });

  test('selection marks exactly one card, for the eye and for a screen reader', async () => {
    await withRail(4, ({ cards }) => {
      state.ui.activeSlideId = 'rail-s2';
      const cs = cards();
      expect(cs.filter(c => c.classList.contains('avs-on'))).toHaveLength(1);
      expect(cs[2].classList.contains('avs-on')).toBeTruthy();
      expect(cs.map(c => c.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true', 'false']);
      // Roving tabindex: the rail is ONE tab stop.
      expect(cs.map(c => c.tabIndex)).toEqual([-1, -1, 0, -1]);
    });
  });
});

describe('slide rail · the arrows walk it', () => {
  const key = (el, k, opts = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));

  test('REGRESSION: arrow keys keep moving, they do not stick on the first card', async () => {
    // The targeted-update rewrite nearly broke this: the full rebuild used to
    // move focus as a side effect, so once refresh() stopped running, the
    // second arrow keypress was still computed from the card the user had
    // visually left. One step, then stuck.
    await withRail(5, ({ cards }) => {
      cards()[0].focus();
      const walked = [];
      for (let i = 0; i < 4; i++) {
        key(document.activeElement, 'ArrowDown');
        walked.push(document.activeElement.dataset.id);
      }
      expect(walked).toEqual(['rail-s1', 'rail-s2', 'rail-s3', 'rail-s4']);
      key(document.activeElement, 'ArrowUp');
      expect(document.activeElement.dataset.id).toBe('rail-s3');
    });
  });

  test('Home and End jump to the ends', async () => {
    await withRail(5, ({ cards }) => {
      cards()[2].focus();
      key(document.activeElement, 'End');
      expect(document.activeElement.dataset.id).toBe('rail-s4');
      key(document.activeElement, 'Home');
      expect(document.activeElement.dataset.id).toBe('rail-s0');
    });
  });

  test('the roving tabindex follows the focus, so the rail stays ONE tab stop', async () => {
    await withRail(4, ({ cards }) => {
      cards()[0].focus();
      key(document.activeElement, 'ArrowDown');
      key(document.activeElement, 'ArrowDown');
      expect(cards().map(c => c.tabIndex)).toEqual([-1, -1, 0, -1]);
    });
  });

  test('alt+arrow moves the SLIDE, and the focus rides along with it', async () => {
    await withRail(4, ({ cards, names }) => {
      cards()[1].focus();
      key(document.activeElement, 'ArrowDown', { altKey: true });
      expect(names()).toEqual(['Slide 0', 'Slide 2', 'Slide 1', 'Slide 3']);
      expect(document.activeElement.dataset.id).toBe('rail-s1');
    });
  });

  test('a selection change from ELSEWHERE does not steal the focus', async () => {
    await withRail(4, ({ host }) => {
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      outside.focus();
      state.ui.activeSlideId = 'rail-s2';
      expect(document.activeElement === outside).toBeTruthy();
      expect(host.querySelectorAll('.avs-slide-card')[2].classList.contains('avs-on')).toBeTruthy();
      outside.remove();
    });
  });
});

describe('slide rail · finding a slide in a long playlist', () => {
  const type = (host, value) => {
    const input = host.querySelector('#avs-rail-filter');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input;
  };
  const shown = host => [...host.querySelectorAll('.avs-slide-card')].filter(c => !c.hidden)
    .map(c => c.querySelector('.avs-slide-name').textContent);

  test('the box appears only once the list is long enough to get lost in', async () => {
    await withRail(5, ({ host }) => {
      expect(host.querySelector('#avs-rail-filterbar').hidden).toBeTruthy();
    });
    await withRail(14, ({ host }) => {
      expect(host.querySelector('#avs-rail-filterbar').hidden).toBeFalsy();
    });
  });

  test('filters by name and keeps the real slide numbers', async () => {
    await withRail(14, ({ host }) => {
      state.playlist.slides[3].name = 'Angebot der Woche';
      state.playlist.slides[9].name = 'Angebot Montag';
      type(host, 'angebot');
      expect(shown(host)).toEqual(['Angebot der Woche', 'Angebot Montag']);
      // The numbers are positions in the PLAYLIST, not in the filtered view —
      // otherwise the rail would lie about where a slide is.
      const nums = [...host.querySelectorAll('.avs-slide-card')].filter(c => !c.hidden)
        .map(c => c.querySelector('.avs-slide-index').textContent);
      expect(nums).toEqual(['4', '10']);
    });
  });

  test('a slide is findable by the widgets on it, not just its name', async () => {
    await withRail(14, ({ host }) => {
      state.playlist.slides[2].widgets = [{ id: 'w-qr', type: 'qr-code', z: 1, rect: { x: 0, y: 0, w: 10, h: 10 }, content: {} }];
      type(host, 'qr');
      expect(shown(host)).toEqual(['Slide 2']);
    });
  });

  test('the count reports the hit rate, and says so when there is none', async () => {
    await withRail(14, ({ host }) => {
      type(host, 'Slide 1');
      // Locale-independent: the runner may be in either language.
      const text = host.querySelector('#avs-rail-count').textContent;
      expect(text).toContain('14');
      expect(text).toContain(String(shown(host).length));
      type(host, 'zzzz');
      expect(shown(host)).toEqual([]);
      expect(host.querySelector('#avs-rail-count').textContent.length > 0).toBeTruthy();
    });
  });

  test('reordering is off while filtering — a drop between visible cards has no meaning', async () => {
    await withRail(14, ({ host, cards }) => {
      type(host, 'Slide 1');
      expect(cards().every(c => c.draggable === false)).toBeTruthy();
      // …and alt+arrow, which would move a slide past ones you cannot see.
      const order = state.playlist.slides.map(s => s.id);
      const visible = cards().find(c => !c.hidden);
      visible.focus();
      visible.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, altKey: true }));
      expect(state.playlist.slides.map(s => s.id)).toEqual(order);
      type(host, '');
      expect(cards().every(c => c.draggable === true)).toBeTruthy();
    });
  });

  test('the arrows walk only what is visible', async () => {
    await withRail(14, ({ host, cards }) => {
      state.playlist.slides[2].name = 'Treffer A';
      state.playlist.slides[8].name = 'Treffer B';
      type(host, 'treffer');
      const first = cards().find(c => !c.hidden);
      first.focus();
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement.dataset.id).toBe('rail-s8');
    });
  });

  test('Escape clears the field instead of leaving a filter behind', async () => {
    await withRail(14, ({ host, cards }) => {
      const input = type(host, 'Slide 1');
      expect(cards().filter(c => !c.hidden).length < 14).toBeTruthy();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(input.value).toBe('');
      expect(cards().filter(c => !c.hidden)).toHaveLength(14);
    });
  });
});

describe('slide rail · redraws only what changed', () => {
  test('REGRESSION: editing one slide leaves the other cards untouched', async () => {
    await withRail(6, ({ cards }) => {
      const before = cards();
      state.playlist.slides[3].name = 'Nur diese';
      const after = cards();
      expect(after[3] === before[3]).toBeFalsy();      // the edited card was redrawn
      for (const i of [0, 1, 2, 4, 5]) {
        expect(after[i] === before[i]).toBeTruthy();   // …and only that one
      }
    });
  });

  test('REGRESSION: a widget edit deep inside a slide redraws one card', async () => {
    await withRail(6, ({ cards }) => {
      const before = cards();
      state.playlist.slides[4].widgets[0].rect.x = 42;
      const after = cards();
      expect(after[4] === before[4]).toBeFalsy();
      expect(after[0] === before[0]).toBeTruthy();
      expect(after[5] === before[5]).toBeTruthy();
    });
  });

  test('REGRESSION: selecting another slide redraws no card at all', async () => {
    await withRail(6, ({ cards }) => {
      const before = cards();
      state.ui.activeSlideId = 'rail-s4';
      const after = cards();
      for (let i = 0; i < before.length; i++) expect(after[i] === before[i]).toBeTruthy();
      expect(after[4].classList.contains('avs-on')).toBeTruthy();
    });
  });

  test('a change to a playlist-wide default still redraws everything', async () => {
    // Every thumbnail reads the default theme, so this one has to be broad.
    await withRail(4, ({ cards }) => {
      const before = cards();
      state.playlist.defaults.theme = 'gradient-purple';
      const after = cards();
      expect(after[0] === before[0]).toBeFalsy();
      expect(after[3] === before[3]).toBeFalsy();
      expect(after[0].querySelector('.avs-rail-thumb').className).toContain('bb-theme-gradient-purple');
    });
  });
});

// Moving a slide with the keyboard said nothing at all.
//
// alt+arrow reorders, and the card keeps its name AND its focus — so from a
// screen reader's side of the glass, absolutely nothing happened. The
// thumbnails swapping places is the whole feedback, and it is the one signal a
// reader does not get. Refusing is the same problem: with a filter active the
// key does nothing, and nothing said why.
describe('slide rail · moving a slide says where it went', () => {
  // The live regions live in the shared toast host; read them there.
  const spoken = () => [...document.querySelectorAll('.bb-toast-host [aria-live]')]
    .map(r => r.textContent.trim()).filter(Boolean).join(' | ');
  const settle = () => new Promise(r => setTimeout(r, 60));
  const altKey = (card, key) => card.dispatchEvent(
    new KeyboardEvent('keydown', { key, altKey: true, bubbles: true }));

  test('REGRESSION: the move is announced, with the new position', async () => {
    await withRail(4, async ({ cards, names }) => {
      const before = names();
      altKey(cards()[0], 'ArrowDown');
      await settle();
      // It really moved…
      expect(names()[1]).toBe(before[0]);
      // …and it said so, naming where it landed.
      const said = spoken();
      expect(said.length > 0).toBeTruthy();
      expect(said).toContain('2');
    });
  });

  test('REGRESSION: refusing at the end of the list is not silence', async () => {
    await withRail(3, async ({ cards, names }) => {
      const before = names();
      altKey(cards()[0], 'ArrowUp');       // already first
      await settle();
      expect(names()).toEqual(before);      // nothing moved
      expect(spoken().length > 0).toBeTruthy();
    });
  });

  test('REGRESSION: refusing because a filter is on is not silence either', async () => {
    await withRail(12, async ({ host, cards, names }) => {
      const box = host.querySelector('.avs-rail-filter input, input.avs-rail-filter, input');
      box.value = 'Slide 1';
      box.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
      const before = names();
      const visible = cards().find(c => !c.hidden);
      altKey(visible, 'ArrowDown');
      await settle();
      expect(names()).toEqual(before);      // reordering stays off under a filter
      expect(spoken().length > 0).toBeTruthy();
      // The filter is MODULE state, not fixture state: leaving it set made the
      // next test's arrows walk a filtered list and go nowhere.
      box.value = '';
      box.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
    });
  });

  test('plain arrows still just move the selection, quietly', async () => {
    await withRail(4, async ({ cards, names }) => {
      const before = names();
      cards()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await settle();
      expect(names()).toEqual(before);
      // The card itself takes focus, which is what a reader announces — an
      // extra live-region message on every arrow press would be chatter.
      expect(state.ui.activeSlideId).toBe(state.playlist.slides[1].id);
    });
  });
});
