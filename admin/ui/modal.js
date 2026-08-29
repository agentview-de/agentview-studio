// Promise-based modal helper.

import { escapeHtml } from '../../shared/utils/escape.js';
import { tx } from '../i18n.js';
import { uiIconSvg } from '../../shared/data/ui-icons.js';
import { inertBackground } from './inert-background.js';

//
// openModal({ title, body, actions: [{ label, kind, value }] }) → Promise<value>
// body is HTMLElement or string of HTML.

// Per-dialog id so aria-labelledby points at THIS modal's heading even when two
// are open (a confirm on top of an editor).
let modalSeq = 0;

export function openModal({ title, body, actions, onMount }) {
  return new Promise(resolve => {
    // Remember who opened us. The per-display drawer already does this and says
    // why: "keyboard users shouldn't get dumped at the top of the page". The
    // modal had the focus TRAP but not the hand-back, so closing any dialog sent
    // focus to the document root and the user had to tab their way home.
    const opener = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'bb-modal-overlay';
    const card = document.createElement('div');
    card.className = 'bb-modal';
    // role/aria-modal/labelledby, like the drawer: without them a screen reader
    // announces an anonymous group instead of a dialog with a name.
    const titleId = `bb-modal-title-${++modalSeq}`;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', titleId);
    card.tabIndex = -1;
    card.innerHTML = `
      <header class="bb-modal-header">
        <h3 id="${titleId}">${escapeHtml(title ?? '')}</h3>
        <button class="bb-modal-x" aria-label="${escapeHtml(tx('Close'))}">${uiIconSvg('close', 14)}</button>
      </header>
      <div class="bb-modal-body"></div>
      <footer class="bb-modal-footer"></footer>
    `;
    overlay.appendChild(card);
    const bodyHost = card.querySelector('.bb-modal-body');
    if (typeof body === 'string') bodyHost.innerHTML = body;
    else if (body instanceof HTMLElement) bodyHost.appendChild(body);
    const footer = card.querySelector('.bb-modal-footer');
    (actions ?? [{ label: tx('OK'), kind: 'primary', value: true }]).forEach(a => {
      const btn = document.createElement('button');
      btn.className = `bb-btn bb-btn-${a.kind ?? 'secondary'}`;
      btn.textContent = a.label;
      btn.addEventListener('click', () => close(a.value));
      footer.appendChild(btn);
    });
    card.querySelector('.bb-modal-x').addEventListener('click', () => close(undefined));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(undefined); });
    document.body.appendChild(overlay);
    // …and everything else out of the accessibility tree, not just out of the
    // tab order. See ui/inert-background.js.
    const unInert = inertBackground(overlay);
    // Focus the dialog itself, not the overlay: a labelled element with role=dialog
    // is what a screen reader announces on entry.
    card.focus();

    // Focus trap: keep Tab / Shift+Tab cycling inside the modal instead of
    // escaping to the (inert) background content. We recompute the focusable
    // set on each Tab press so dynamically-added body controls are covered.
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const trapHandler = e => {
      if (e.key !== 'Tab' || !isTopmost()) return;
      const items = [...card.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      // When focus is outside the card (e.g. still on the overlay), pull it back
      // to the appropriate edge so the very first Tab lands inside.
      if (!card.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };

    // Only the TOPMOST dialog reacts. Both handlers sit on document, so with a
    // confirm stacked on an editor one Escape used to close both at once.
    const isTopmost = () => [...document.querySelectorAll('.bb-modal-overlay')].pop() === overlay;
    const escHandler = e => { if (e.key === 'Escape' && isTopmost()) close(undefined); };
    document.addEventListener('keydown', escHandler);
    document.addEventListener('keydown', trapHandler);

    function close(value) {
      document.removeEventListener('keydown', escHandler);
      document.removeEventListener('keydown', trapHandler);
      overlay.classList.add('bb-modal-closing');
      unInert();
      setTimeout(() => {
        overlay.remove();
        // Hand focus back to whatever opened the dialog, if it is still around.
        // Do it AFTER the overlay is gone, or the browser refuses to move focus
        // into an element the modal still covers.
        try { if (opener?.isConnected) opener.focus?.(); } catch {}
        resolve(value);
      }, 200);
    }

    if (onMount) onMount(card, close);
    requestAnimationFrame(() => overlay.classList.add('bb-modal-open'));
  });
}


/**
 * Ask a yes/no question in the app's own dialog.
 *
 * Four destructive actions used the browser's `confirm()` — deleting assets,
 * and the display drawer's three key operations. That skipped everything this
 * module exists for (the focus trap, the hand-back, the inert background, the
 * app's language on the buttons) and, worse, it does not work where the studio
 * is embedded: in a sandboxed iframe without `allow-modals`, `confirm()`
 * returns FALSE with no dialog and no error, so the action silently did
 * nothing and the user was told nothing.
 *
 * @param {{ title?: string, message: string, confirmLabel?: string, danger?: boolean }} opts
 * @returns {Promise<boolean>}
 */
export async function confirmModal({ title, message, confirmLabel, danger = true }) {
  const body = document.createElement('p');
  body.className = 'bb-form-help';
  body.textContent = message;
  const choice = await openModal({
    title: title ?? tx('Are you sure?'),
    body,
    actions: [
      { label: tx('Cancel') },
      { label: confirmLabel ?? tx('Confirm'), kind: danger ? 'danger' : 'primary', value: 'yes' },
    ],
  });
  return choice === 'yes';
}
