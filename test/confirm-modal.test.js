// Four destructive actions asked with the browser's `confirm()`.
//
// Deleting assets, and the display drawer's three key operations — rotate a
// managed key, revoke it, rotate the recovery code. Every one of them skipped
// the module built for exactly this: the focus trap, the hand-back to whoever
// opened it, the inert background, the app's own language on the buttons.
//
// And it does not work where the studio is embedded. In a sandboxed iframe
// without `allow-modals`, `confirm()` returns FALSE with no dialog and no
// error — so the click did nothing, and nothing said why. Measured, not
// assumed: see the last test.
//
// Browser-only: it opens the real dialog. Every test closes it in a `finally`
// — an open modal leaves the rest of the page `inert`, and the first draft of
// this file wedged the whole suite by leaving one standing.

import { test, expect, describe } from './runner.js';
import { confirmModal } from '../admin/ui/modal.js';

const settle = () => new Promise(r => setTimeout(r, 90));

// No await in this file may outlive its test. A promise that never settles
// does not fail one line — it takes the WHOLE page's results with it, and the
// runner reports "never produced results" for two hundred suites that were
// fine. The first draft of this file did exactly that.
const within = (ms, p, what) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out: ${what}`)), ms)),
]);
const dialog = () => document.querySelector('.bb-modal-overlay .bb-modal');

/**
 * Open the dialog, hand the body to `fn`, then answer it whatever happens.
 * @returns {Promise<boolean>} what confirmModal resolved to
 */
async function ask(opts, fn, answer = 'cancel') {
  const p = confirmModal(opts);
  let answered = false;
  const press = (which) => {
    const d = dialog();
    if (!d) return;
    const btns = [...d.querySelectorAll('button')];
    const target = which === 'confirm'
      ? btns[btns.length - 1]
      : (d.querySelector('.bb-modal-x') ?? btns[0]);
    target?.click();
    answered = true;
  };
  try {
    await settle();
    if (fn) await fn({ d: dialog(), press });
    if (!answered) press(answer);
    return await within(3000, p, 'the dialog never answered');
  } finally {
    if (!answered) { press('cancel'); await within(3000, p, 'cleanup').catch(() => {}); }
    await settle();
  }
}

describe('confirmModal · asking in the app, not in the browser', () => {
  test('REGRESSION: it is a real dialog, with the page behind it inert', async () => {
    let seen = {};
    const out = await ask({ message: 'Delete 3 assets?' }, ({ d }) => {
      seen = {
        role: d.getAttribute('role'),
        modal: d.getAttribute('aria-modal'),
        text: d.textContent,
        // The inert sweep is what keeps a screen reader and Tab inside.
        inert: [...document.body.children].some(el => el.inert),
      };
    });
    expect(seen.role).toBe('dialog');
    expect(seen.modal).toBe('true');
    expect(seen.text).toContain('Delete 3 assets?');
    expect(seen.inert).toBeTruthy();
    expect(out).toBe(false);
  });

  test('confirming resolves true, dismissing resolves false', async () => {
    expect(await ask({ message: 'x', confirmLabel: 'Delete' }, null, 'confirm')).toBe(true);
    expect(await ask({ message: 'x' }, null, 'cancel')).toBe(false);
  });

  test('it takes the caller’s wording for the dangerous button', async () => {
    let labels = [];
    await ask({ message: 'x', confirmLabel: 'Rotate key' }, ({ d }) => {
      labels = [...d.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean);
    });
    expect(labels.some(l => /rotate key/i.test(l))).toBeTruthy();
  });

  test('REGRESSION: nothing is left on the page afterwards', async () => {
    await ask({ message: 'x' });
    expect(document.querySelector('.bb-modal-overlay')).toBe(null);
    // …including the inert flags, which would silently break every later test.
    expect([...document.body.children].some(el => el.inert)).toBeFalsy();
  });

  test('REGRESSION: why not confirm() — it answers "no" in a sandbox', async () => {
    // The measurement behind this whole change. A sandboxed iframe without
    // `allow-modals` does not throw and does not ask: it just says false.
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    f.style.cssText = 'position:fixed;left:-4000px;top:0;width:200px;height:100px;';
    f.srcdoc = '<!doctype html><title>x</title>';
    document.body.appendChild(f);
    try {
      await within(4000, new Promise(r => { f.addEventListener('load', () => setTimeout(r, 60)); }), 'sandbox iframe load');
      expect(f.contentWindow.confirm('really?')).toBe(false);
    } finally { f.remove(); }
  });
});
