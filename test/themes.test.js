// The theme list and the theme stylesheet are two files that have to agree.
//
// They are the same class of hazard the slide inspector had until recently: it
// carried its own hand-copied array of theme ids, so a theme added to
// themes.js reached every widget picker and silently not the slide picker.
// That one is gone; this is the remaining pair, and it fails in both
// directions without a word.
//
//   id in THEME_SWATCHES, no CSS rule → the picker offers a theme that paints
//   nothing. The slide keeps the previous theme's look and the user concludes
//   the option is broken (it is).
//   CSS rule, no id → a theme nobody can select, which usually means a rename
//   only landed on one side and every playlist still storing the old id now
//   renders unstyled.
//
// Browser-only: it fetches the stylesheet as text rather than reading
// document.styleSheets, so it does not care whether the page happens to load
// that sheet — and the shared test page does not.

import { describe, test, expect } from './runner.js';
import { THEME_SWATCHES, ALL_THEMES, themeLabel } from '../shared/data/themes.js';

const CSS_URL = '../styles/slide-themes.css';

// `.bb-theme-<id>` at the start of a selector — the theme's own rule. Matches
// only where the class opens a selector, so a descendant rule like
// `.bb-theme-x .bb-menu-row` does not count as a second declaration.
function declaredInCss(css) {
  const ids = new Set();
  for (const m of css.matchAll(/(^|[\s,}])\.bb-theme-([a-z0-9-]+)\s*[,{]/g)) ids.add(m[2]);
  return ids;
}

describe('themes · the list and the stylesheet agree', () => {
  test('every registered theme has a rule that paints it', async () => {
    const css = await (await fetch(new URL(CSS_URL, import.meta.url))).text();
    const inCss = declaredInCss(css);
    const missing = ALL_THEMES.filter(id => !inCss.has(id));
    expect(missing).toEqual([]);
  });

  test('every rule in the stylesheet is a theme you can pick', async () => {
    const css = await (await fetch(new URL(CSS_URL, import.meta.url))).text();
    const registered = new Set(ALL_THEMES);
    const orphans = [...declaredInCss(css)].filter(id => !registered.has(id));
    expect(orphans).toEqual([]);
  });

  test('every swatch carries the two colours the picker draws', () => {
    for (const id of ALL_THEMES) {
      const sw = THEME_SWATCHES[id];
      expect(typeof sw?.bg).toBe('string');
      expect(typeof sw?.accent).toBe('string');
      expect(sw.bg.length > 0).toBe(true);
      // An accent is a plain colour everywhere — several widgets pass it
      // straight to color-mix() and to the readable-ink helper, neither of
      // which can do anything with a gradient string.
      expect(/^#[0-9a-f]{3,8}$/i.test(sw.accent)).toBe(true);
      expect(themeLabel(id).length > 0).toBe(true);
    }
  });
});
