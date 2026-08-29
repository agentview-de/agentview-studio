// The handful of strings the PLAYER itself puts on a screen.
//
// The Studio has two translation mechanisms; the player deliberately has
// neither — it must boot inside a sandboxed iframe with no admin code, and its
// widgets show operator-authored content, not UI text. But the runtime does
// speak for itself twice, in a banner over the slides, and both messages were
// hard-coded English on a display that already knows its language: every
// display carries one (window.BB_DISPLAY_LANG, used to pick slide.langs
// variants). A shop in Bremen showing "No visible slides right now." after
// closing time is the whole product speaking the wrong language.
//
// Deliberately a plain table rather than a copy of admin/i18n.js: two strings
// do not need a dictionary, a locale store or a change event, and every byte
// here is inlined into every published bundle.

const MESSAGES = {
  offlineCached: {
    en: 'Offline — showing the cached playlist',
    de: 'Offline — zeige die zwischengespeicherte Playlist',
  },
  noVisible: {
    en: 'Nothing scheduled right now',
    de: 'Zurzeit ist nichts eingeplant',
  },
};

/**
 * @param {string} key   one of the keys above
 * @param {string} lang  a display language: 'de', 'de-DE', 'en-GB', anything
 * @returns {string} the message, English for an unknown language, and the key
 *   itself for an unknown key — a visible marker rather than an empty banner.
 */
export function playerText(key, lang = 'en') {
  const entry = MESSAGES[key];
  if (!entry) return key;
  // 'de-DE' and 'de-AT' both want the German line; anything unknown gets English.
  const primary = String(lang ?? '').toLowerCase().split(/[-_]/)[0];
  return entry[primary] ?? entry.en;
}

/** The languages the player itself can speak. Exported for tests and tooling. */
export function playerLocales() {
  return [...new Set(Object.values(MESSAGES).flatMap(Object.keys))].sort();
}
