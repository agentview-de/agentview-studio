// The one rail assertion that needs the REAL stylesheet.
//
// The slide filter marks non-matching cards with the `hidden` attribute, which
// the user agent styles as `display: none`. But `.avs-slide-card` sets
// `display: grid` — an AUTHOR rule, which wins. The filter therefore worked
// perfectly in every property-level test (the attribute was set, the count was
// right) and changed nothing on screen: fifteen cards, "2 of 15" above them.
// Only a screenshot showed it.
//
// So this case runs where the editor's own CSS is loaded and asks the question
// a user would: is the card actually gone from the page?

import { test, expect, describe } from './runner.js';
import { state } from '../admin/store.js';
import { mountSlideRail } from '../admin/panels/slide-rail.js';

describe('slide rail · a filtered-out card is really off the screen', () => {
  test('REGRESSION: [hidden] beats the card’s own display:grid', () => {
    const savedPlaylist = state.playlist;
    const savedSlide = state.ui.activeSlideId;
    const host = document.createElement('div');
    // Laid out for real — a zero-size host would make every card 0 high and the
    // assertion would pass for the wrong reason.
    host.style.cssText = 'position:fixed;left:0;top:0;width:220px;height:520px;overflow:auto;';
    document.body.appendChild(host);
    try {
      state.playlist = {
        schemaVersion: 3, id: 'rail-css', name: 'CSS', defaults: { theme: 'minimal-dark' },
        slides: Array.from({ length: 14 }, (_, i) => ({
          id: `css-s${i}`, name: i === 3 ? 'Angebot' : `Slide ${i}`, duration: 8,
          widgets: [{ id: `css-w${i}`, type: 'text', z: 1, rect: { x: 5, y: 5, w: 40, h: 40 }, content: {} }],
        })),
      };
      state.ui.activeSlideId = 'css-s0';
      mountSlideRail(host);

      const cards = () => [...host.querySelectorAll('.avs-slide-card')];
      const painted = () => cards().filter(c => c.getBoundingClientRect().height > 0);
      expect(painted()).toHaveLength(14);

      const input = host.querySelector('#avs-rail-filter');
      input.value = 'angebot';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const still = painted();
      expect(still).toHaveLength(1);
      expect(still[0].querySelector('.avs-slide-name').textContent).toBe('Angebot');
      expect(getComputedStyle(cards()[0]).display).toBe('none');

      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(painted()).toHaveLength(14);
    } finally {
      host.remove();
      state.playlist = savedPlaylist;
      state.ui.activeSlideId = savedSlide;
    }
  });
});
