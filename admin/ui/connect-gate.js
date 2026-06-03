// Connect gate — the friendly "connect your agentView account to use this"
// panel shown in connection-dependent views (Displays, Verwaltung) while the
// user is not connected. The editor stays fully usable without an account; this
// only replaces content that would otherwise be empty or error out, so the
// showcase still reveals the capability and invites the user to connect.
//
// The button reuses the topbar connection chip (#t-conn) rather than importing
// the modal opener, to avoid coupling to admin/main.js.

import { t } from '../i18n.js';
import { escapeHtml } from '../../shared/utils/escape.js';

export function renderConnectGate(host, { title, desc } = {}) {
  host.innerHTML = `
    <div class="avs-connect-gate">
      <img class="avs-brand-logo" src="logo.png" alt="agentView" />
      <div class="avs-cg-title">${escapeHtml(title ?? '')}</div>
      <p class="avs-cg-desc">${escapeHtml(desc ?? '')}</p>
      <button type="button" class="bb-btn bb-btn-primary avs-cg-btn">${escapeHtml(t('welcome.connect'))}</button>
    </div>`;
  host.querySelector('.avs-cg-btn')?.addEventListener('click', () => document.getElementById('t-conn')?.click());
}
