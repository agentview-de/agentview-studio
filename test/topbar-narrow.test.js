// The header used to throw its right-hand end off the screen.
//
// `.avs-topbar` is a nowrap flex row, `body` has `overflow-x: hidden`, and the
// row stops shrinking at about 1040px. Below that the connection chip and the
// ⋯ button simply left the window — with no horizontal scrollbar to reach them,
// because the body clips.
//
// That ⋯ menu holds New, Open from cloud, **Import**, **Export**, Brand kit,
// Data slots, Theme, Shortcuts and About. So on a 1024px window — or at 125%
// browser zoom on a 1280px one, which is the same thing and is an accessibility
// setting — there was no way to export a playlist. Including, pointedly, when
// the editor has just told you that your browser storage is full and you should
// export the playlist to a file.
//
// An iframe carries its own viewport, so the real media queries answer here.

import { test, expect, describe } from './runner.js';

// The German UI is the wider one — "Nicht verbunden" against "Not connected",
// "Veröffentlichen" against "Publish" — and it is this app's first language, so
// the narrow cases are measured in it.
const load = (w, h = 700, locale = 'de') => new Promise((resolve, reject) => {
  try { localStorage.setItem('bb_locale', locale); } catch { /* private mode */ }
  const f = document.createElement('iframe');
  f.style.cssText = `position:fixed;left:-5000px;top:0;width:${w}px;height:${h}px;border:0`;
  f.src = '../index.html';
  f.addEventListener('load', () => setTimeout(() => resolve(f), 350));
  f.addEventListener('error', reject);
  document.body.appendChild(f);
});

const header = (f) => {
  const d = f.contentDocument;
  // The editor may boot with a modal up, and an open modal marks the rest of
  // the page `inert` — which correctly removes the header from hit testing and
  // would make the check below measure the modal instead of the layout. Clear
  // both so the question stays "is the button on screen".
  for (const o of d.querySelectorAll('.bb-modal-overlay')) o.remove();
  for (const el of d.body.children) el.inert = false;
  const bar = d.querySelector('.avs-topbar');
  const more = d.getElementById('t-overflow');
  const w = f.contentWindow.innerWidth;
  return {
    bar, more, w,
    barOverflow: bar.scrollWidth - bar.clientWidth,
    moreRight: more.getBoundingClientRect().right,
    // What a click would actually hit at the button's own centre.
    // elementsFROMPoint, plural: the whole stack under that spot. A modal that
    // happens to be open is a legitimate overlay and says nothing about
    // whether the button is on screen, which is the question here.
    hits: (() => {
      const r = more.getBoundingClientRect();
      const stack = d.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return stack.some(el => el === more || more.contains(el));
    })(),
  };
};

async function atWidth(w, fn, locale) {
  const f = await load(w, 700, locale);
  try { await fn(header(f), f); } finally { f.remove(); }
}

describe('header · nothing is clipped away', () => {
  test('REGRESSION: at 1024px the ⋯ menu is on screen and clickable', async () => {
    // In German. The English header is ~15px narrower and squeaked past 1024
    // even before the fix — so this case only guards anything in the language
    // the app is actually used in.
    await atWidth(1024, h => {
      expect(h.barOverflow).toBe(0);
      expect(h.moreRight <= h.w).toBeTruthy();
      expect(h.hits).toBeTruthy();
    });
  });

  test('REGRESSION: at 900px too — it wraps rather than pushing things out', async () => {
    await atWidth(900, h => {
      expect(h.barOverflow).toBe(0);
      expect(h.moreRight <= h.w).toBeTruthy();
      expect(h.hits).toBeTruthy();
    });
  });

  test('and at 768px, which is 150% zoom on a small laptop', async () => {
    await atWidth(768, h => {
      expect(h.barOverflow).toBe(0);
      expect(h.moreRight <= h.w).toBeTruthy();
    });
  });

  test('a roomy window still gets ONE row, not a wrapped one', async () => {
    await atWidth(1440, (h) => {
      expect(Math.round(h.bar.getBoundingClientRect().height)).toBe(54);
      expect(h.barOverflow).toBe(0);
    });
  });

  test('the words go before the controls do', async () => {
    // The connection chip is the widest optional thing up there. Narrow: the
    // dot and the click target stay, the label goes, and the title says what
    // the label no longer does.
    await atWidth(900, (_h, f) => {
      const chip = f.contentDocument.getElementById('t-conn');
      const label = chip.querySelector('.avs-conn-label');
      expect(!!label).toBeTruthy();
      expect(f.contentWindow.getComputedStyle(label).display).toBe('none');
      expect(!!chip.querySelector('.avs-dot')).toBeTruthy();
      expect(chip.title.length > 0).toBeTruthy();
    });
    await atWidth(1440, (_h, f) => {
      const label = f.contentDocument.querySelector('#t-conn .avs-conn-label');
      expect(f.contentWindow.getComputedStyle(label).display === 'none').toBe(false);
    });
  });
});
