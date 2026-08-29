// The two lines the player itself puts on a screen.
//
// Both were hard-coded English on a display that already knows its language:
// every display carries one (window.BB_DISPLAY_LANG, the same setting that
// picks slide.langs variants). A shop in Bremen showing "No visible slides
// right now." to the street after closing time is the product speaking the
// wrong language at the only audience it has.

import { test, expect, describe } from './runner.js';
import { playerText, playerLocales } from '../player/messages.js';

describe('player messages', () => {
  test('speaks the display language', () => {
    expect(playerText('noVisible', 'de')).toBe('Zurzeit ist nichts eingeplant');
    expect(playerText('noVisible', 'en')).toBe('Nothing scheduled right now');
  });

  test('a regional tag still finds its language', () => {
    for (const tag of ['de-DE', 'de-AT', 'de_CH', 'DE']) {
      expect(playerText('offlineCached', tag)).toBe('Offline — zeige die zwischengespeicherte Playlist');
    }
  });

  test('an unknown language falls back to English, never to nothing', () => {
    expect(playerText('noVisible', 'fr')).toBe('Nothing scheduled right now');
    expect(playerText('noVisible', '')).toBe('Nothing scheduled right now');
    expect(playerText('noVisible', null)).toBe('Nothing scheduled right now');
    expect(playerText('noVisible')).toBe('Nothing scheduled right now');
  });

  test('an unknown key shows the key — a visible marker beats an empty banner', () => {
    expect(playerText('nope', 'de')).toBe('nope');
  });

  test('every message exists in every language the player claims to speak', () => {
    for (const lang of playerLocales()) {
      for (const key of ['noVisible', 'offlineCached']) {
        const s = playerText(key, lang);
        expect(s === key).toBeFalsy();      // not the untranslated marker
        expect(s.length > 0).toBeTruthy();
      }
    }
  });

  test('the player speaks the two languages the Studio does', () => {
    expect(playerLocales()).toEqual(['de', 'en']);
  });
});
