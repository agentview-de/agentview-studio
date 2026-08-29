// The right column is 332px of a three-column grid.
//
// On a 1024px window — or at 125% browser zoom on a 1280px one, which is the
// same thing and is an accessibility setting — that leaves the canvas about
// 440px: not enough to see the slide you are designing.
//
// `state.ui.inspectorOpen` had been sitting in the store the whole time,
// declared, defaulted to true, and read by nobody. This is what it was for.
//
// Browser-only, and it shares the editor frame the alignment suite boots:
// starting the whole app twice on one page costs more than the page's budget
// allows.

import { test, expect, describe } from './runner.js';
import { withEditor } from './align-buttons.test.js';

describe('editor · the panel gets out of the way', () => {
  test('REGRESSION: collapsing gives the canvas the room back', async () => {
    await withEditor(async ({ doc, settle }) => {
      const canvas = () => Math.round(doc.getElementById('avs-canvas').getBoundingClientRect().width);
      const toggle = doc.getElementById('avs-right-toggle');
      const editor = doc.querySelector('.avs-editor');
      if (editor.classList.contains('avs-right-collapsed')) { toggle.click(); await settle(); }

      const open = canvas();
      toggle.click();
      await settle();
      expect(editor.classList.contains('avs-right-collapsed')).toBe(true);
      expect(canvas() > open).toBeTruthy();

      toggle.click();
      await settle();
      expect(editor.classList.contains('avs-right-collapsed')).toBe(false);
      expect(canvas()).toBe(open);
    });
  });

  test('the handle says which way it goes, and stays reachable when closed', async () => {
    await withEditor(async ({ doc, settle }) => {
      const toggle = doc.getElementById('avs-right-toggle');
      const editor = doc.querySelector('.avs-editor');
      if (editor.classList.contains('avs-right-collapsed')) { toggle.click(); await settle(); }

      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      const openLabel = toggle.getAttribute('aria-label');
      expect(openLabel.length > 0).toBeTruthy();

      toggle.click();
      await settle();
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      // A different word, not just a different arrow — the arrow is decoration.
      expect(toggle.getAttribute('aria-label') === openLabel).toBe(false);
      // Still on screen: a control that closes a panel and leaves with it is a
      // trap, not a toggle.
      const r = toggle.getBoundingClientRect();
      expect(r.width > 0 && r.right <= doc.defaultView.innerWidth).toBeTruthy();

      toggle.click();
      await settle();
    });
  });

  test('it names the panel it controls', async () => {
    await withEditor(({ doc }) => {
      const toggle = doc.getElementById('avs-right-toggle');
      expect(toggle.getAttribute('aria-controls')).toBe('avs-right-swap');
      expect(!!doc.getElementById(toggle.getAttribute('aria-controls'))).toBeTruthy();
    });
  });
});
