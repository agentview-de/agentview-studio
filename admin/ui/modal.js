// Promise-based modal helper.

import { escapeHtml } from '../../shared/utils/escape.js';
import { tx } from '../i18n.js';
//
// openModal({ title, body, actions: [{ label, kind, value }] }) → Promise<value>
// body is HTMLElement or string of HTML.

export function openModal({ title, body, actions, onMount }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'bb-modal-overlay';
    overlay.tabIndex = -1;
    const card = document.createElement('div');
    card.className = 'bb-modal';
    card.innerHTML = `
      <header class="bb-modal-header">
        <h3>${escapeHtml(title ?? '')}</h3>
        <button class="bb-modal-x" aria-label="${escapeHtml(tx('Close'))}">✕</button>
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
    overlay.focus();

    // Focus trap: keep Tab / Shift+Tab cycling inside the modal instead of
    // escaping to the (inert) background content. We recompute the focusable
    // set on each Tab press so dynamically-added body controls are covered.
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const trapHandler = e => {
      if (e.key !== 'Tab') return;
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

    const escHandler = e => { if (e.key === 'Escape') close(undefined); };
    document.addEventListener('keydown', escHandler);
    document.addEventListener('keydown', trapHandler);

    function close(value) {
      document.removeEventListener('keydown', escHandler);
      document.removeEventListener('keydown', trapHandler);
      overlay.classList.add('bb-modal-closing');
      setTimeout(() => { overlay.remove(); resolve(value); }, 200);
    }

    if (onMount) onMount(card, close);
    requestAnimationFrame(() => overlay.classList.add('bb-modal-open'));
  });
}

