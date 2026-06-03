// Tiny toast system. mount() once; call toast(text, opts).

import { escapeHtml } from '../../shared/utils/escape.js';

let _host = null;

export function mount() {
  if (_host) return;
  _host = document.createElement('div');
  _host.className = 'bb-toast-host';
  document.body.appendChild(_host);
}

export function toast(text, opts = {}) {
  mount();
  const el = document.createElement('div');
  el.className = `bb-toast bb-toast-${opts.kind ?? 'info'}`;
  el.innerHTML = `
    <span class="bb-toast-icon">${opts.icon ?? ICONS[opts.kind ?? 'info']}</span>
    <span class="bb-toast-text">${escapeHtml(text)}</span>
  `;
  _host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('bb-toast-show'));
  const ttl = opts.ttl ?? 3500;
  setTimeout(() => {
    el.classList.remove('bb-toast-show');
    setTimeout(() => el.remove(), 300);
  }, ttl);
  return el;
}

const ICONS = {
  info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌',
};

