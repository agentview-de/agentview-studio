// Everything except the dialog, out of the way.
//
// This app puts real work into keyboard traps: the modal, the drawer, the
// command palette and the fullscreen preview all keep Tab inside themselves.
// modal.js even describes what is behind it as "the (inert) background
// content" — and nothing in the app ever set `inert` on anything.
//
// A Tab trap is not a reader trap. The virtual cursor, which is how most blind
// users actually move through a page, walks the accessibility tree and ignores
// tabindex entirely: it went straight out of the open dialog and on through the
// editor behind it, with nothing to say where the dialog ended.
//
// Browser-only: `inert` is a property of a real element.

import { test, expect, describe } from './runner.js';
import { inertBackground } from '../admin/ui/inert-background.js';
import { openModal } from '../admin/ui/modal.js';

const div = (cls) => {
  const el = document.createElement('div');
  if (cls) el.className = cls;
  document.body.appendChild(el);
  return el;
};

describe('inert background · the page behind a dialog', () => {
  test('REGRESSION: everything but the dialog is taken out of the tree', () => {
    const app = div('probe-app');
    const other = div('probe-other');
    const dialog = div('probe-dialog');
    try {
      const undo = inertBackground(dialog);
      expect(app.inert).toBeTruthy();
      expect(other.inert).toBeTruthy();
      expect(dialog.inert).toBeFalsy();
      undo();
      expect(app.inert).toBeFalsy();
      expect(other.inert).toBeFalsy();
    } finally { app.remove(); other.remove(); dialog.remove(); }
  });

  test('a stack of two restores in the right order', () => {
    // A confirm on top of an editor. Closing the confirm must give the editor
    // back — and must NOT hand back the page underneath it.
    const app = div('probe-app');
    const first = div('probe-first');
    try {
      const undoFirst = inertBackground(first);
      expect(app.inert).toBeTruthy();
      const second = div('probe-second');
      try {
        const undoSecond = inertBackground(second);
        expect(first.inert).toBeTruthy();
        expect(second.inert).toBeFalsy();
        undoSecond();
        // The lower dialog is usable again…
        expect(first.inert).toBeFalsy();
        // …and the page it inerted is still inert, because it was not this
        // call that inerted it.
        expect(app.inert).toBeTruthy();
      } finally { second.remove(); }
      undoFirst();
      expect(app.inert).toBeFalsy();
    } finally { app.remove(); first.remove(); }
  });

  test('several elements can be kept — a backdrop still takes clicks', () => {
    // `inert` blocks pointer events too. The drawer's backdrop closes it on
    // click and sits beside the drawer, so inerting it would break closing.
    const app = div('probe-app');
    const backdrop = div('probe-backdrop');
    const drawer = div('probe-drawer');
    try {
      const undo = inertBackground([drawer, backdrop]);
      expect(app.inert).toBeTruthy();
      expect(backdrop.inert).toBeFalsy();
      expect(drawer.inert).toBeFalsy();
      undo();
    } finally { app.remove(); backdrop.remove(); drawer.remove(); }
  });

  test('the toast host stays announceable', () => {
    const host = div('bb-toast-host');
    const dialog = div('probe-dialog');
    try {
      const undo = inertBackground(dialog);
      expect(host.inert).toBeFalsy();
      undo();
    } finally { host.remove(); dialog.remove(); }
  });

  test('nothing to keep is a no-op, not a blanked page', () => {
    const app = div('probe-app');
    try {
      inertBackground(null)();
      inertBackground([])();
      expect(app.inert).toBeFalsy();
    } finally { app.remove(); }
  });
});

describe('inert background · the real modal uses it', () => {
  test('REGRESSION: opening a dialog inerts the page, closing gives it back', async () => {
    const app = div('probe-app');
    try {
      const pending = openModal({ title: 'Probe', body: 'x', actions: [{ label: 'OK', value: 1 }] });
      await new Promise(r => setTimeout(r, 30));
      expect(app.inert).toBeTruthy();
      const overlay = document.querySelector('.bb-modal-overlay');
      expect(overlay === null).toBeFalsy();
      expect(overlay.inert).toBeFalsy();
      [...overlay.querySelectorAll('button')].find(b => b.textContent.trim() === 'OK').click();
      await pending;
      // Given back the moment the dialog is answered — not after its fade.
      expect(app.inert).toBeFalsy();
      await new Promise(r => setTimeout(r, 250));
      expect(app.inert).toBeFalsy();
    } finally { app.remove(); }
  });
});
