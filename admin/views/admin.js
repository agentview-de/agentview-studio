// Verwaltung-View — 9 sub-tabs over owner-scoped + cross-cutting admin surfaces.
// This file owns ONLY the nav, the active-tab dispatch, and the lazy in-flight
// coalescing. Each Tab is its own module behind the Tab-Shell (./admin/shell.js):
// it supplies its load + render + actions; the Shell owns the
// loading/error/empty/refresh lifecycle. Tabs fetch fresh on activation (the old
// write-only state.admin data-cache was dropped).

import { state, subscribe } from '../store.js';
import { t } from '../i18n.js';
import { emptyState, esc } from './admin/shell.js';
import { renderConnectGate } from '../ui/connect-gate.js';
import { mountApprovals } from './admin/approvals.js';
import { mountAudit } from './admin/audit.js';
import { mountWebhooks } from './admin/webhooks.js';
import { mountApiKeys } from './admin/apikeys.js';
import { mountMembers } from './admin/members.js';
import { mountLicenses } from './admin/licenses.js';
import { mountConnectivity } from './admin/connectivity.js';
import { mountBrandKit } from './admin/brandkit.js';
import { mountVersions } from './admin/versions.js';

const TABS = [
  { id: 'approvals',    label: () => t('admin.approvals'),    icon: '🟡' },
  { id: 'audit',        label: () => t('admin.audit'),        icon: '📋' },
  { id: 'webhooks',     label: () => t('admin.webhooks'),     icon: '🪝' },
  { id: 'apikeys',      label: () => t('admin.apikeys'),      icon: '🔑' },
  { id: 'members',      label: () => t('admin.members'),      icon: '👥' },
  { id: 'licenses',     label: () => t('admin.licenses'),     icon: '⭐' },
  { id: 'connectivity', label: () => t('admin.connectivity'), icon: '🌐' },
  { id: 'brandkit',     label: () => t('admin.brandkit'),     icon: '🎨' },
  { id: 'versions',     label: () => t('admin.versions'),     icon: '🕒' },
];

// id → the Tab's mount(body) function (each behind the Tab-Shell).
const renderers = {
  approvals: mountApprovals,
  audit: mountAudit,
  webhooks: mountWebhooks,
  apikeys: mountApiKeys,
  members: mountMembers,
  licenses: mountLicenses,
  connectivity: mountConnectivity,
  brandkit: mountBrandKit,
  versions: mountVersions,
};

let rootEl = null;

export function mountAdmin(host) {
  rootEl = host;
  host.innerHTML = `
    <div class="avs-admin">
      <nav class="avs-admin-nav" id="avs-admin-nav">
        ${TABS.map(tab => `
          <button class="avs-admin-tab" data-tab="${tab.id}">
            <span class="avs-admin-tab-icon">${tab.icon}</span>
            <span class="avs-admin-tab-label">${tab.label()}</span>
          </button>`).join('')}
      </nav>
      <section class="avs-admin-body" id="avs-admin-body"></section>
    </div>`;
  host.querySelectorAll('.avs-admin-tab').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });
  // Swap the gate <-> the active tab when the connection state changes. The nav
  // stays visible while disconnected so the showcase still reveals the console.
  subscribe('connection', () => switchTab(state.ui.adminTab ?? 'approvals'));
  switchTab(state.ui.adminTab ?? 'approvals');
}

export function refreshAdmin() {
  if (!rootEl) return;
  // Re-render current tab to pick up state changes from other views.
  switchTab(state.ui.adminTab ?? 'approvals');
}

// Tracks the tab whose mount is currently in flight. A Tab resets its body
// BEFORE its first await and renders AFTER it, so two concurrent mounts of the
// SAME tab would draw it twice. Coalesce those; a switch to a DIFFERENT tab
// still supersedes.
let inFlightTab = null;
function switchTab(id) {
  state.ui.adminTab = id;
  rootEl.querySelectorAll('.avs-admin-tab').forEach(b => b.classList.toggle('avs-on', b.dataset.tab === id));
  const body = rootEl.querySelector('#avs-admin-body');
  if (state.connection.status !== 'connected') {
    renderConnectGate(body, { title: t('cg.adminTitle'), desc: t('cg.adminDesc') });
    return;
  }
  if (inFlightTab === id) return;
  body.innerHTML = '<div class="avs-admin-loading">…</div>';
  const renderer = renderers[id] ?? renderEmpty;
  inFlightTab = id;
  Promise.resolve(renderer(body))
    .catch(e => { body.innerHTML = `<div class="avs-admin-error">${esc(e?.message ?? 'Error')}</div>`; })
    .finally(() => { if (inFlightTab === id) inFlightTab = null; });
}

function renderEmpty(body) {
  body.innerHTML = emptyState();
}
