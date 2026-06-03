// Verwaltung → Members Tab. Invite (via shareable link), change roles, remove;
// and create an organisation when the user is in none. Misfit-for-the-mold:
// org-context gating + permission checks decide the whole UI, the role cells are
// live <select> change events (not click actions), and the title carries the org
// name (set after the fetch via ctx.setTitle). Reads org context from
// state.fleet; uses no state.admin cache.
import { mountTab, table, emptyState, esc } from './shell.js';
import { orgs as orgsApi } from '../../api.js';
import { state } from '../../store.js';
import { t } from '../../i18n.js';
import { toast } from '../../ui/toast.js';
import { openModal } from '../../ui/modal.js';

// Mirror of the server's GroupTypeRegistry. Roles highest-privilege first; the
// FIRST is the owner role (never invitable/settable). `manage` = roles with
// CanManage=true. Invitable = every role except the owner role.
const ORG_TYPE_DEF = {
  organization: { roles: ['owner', 'admin', 'manager', 'viewer'], manage: ['owner', 'admin'], default: 'viewer' },
  family:       { roles: ['parent', 'child'],                     manage: ['parent'],          default: 'child' },
};
const orgTypeOf = (o) => (o?.type ?? o?.groupType ?? 'organization').toLowerCase();
const typeDef = (type) => ORG_TYPE_DEF[(type || 'organization').toLowerCase()] ?? ORG_TYPE_DEF.organization;
const ownerRoleForType = (type) => typeDef(type).roles[0];
const invitableRolesForType = (type) => typeDef(type).roles.slice(1);
const defaultInviteRole = (type) => typeDef(type).default;
const canManageRole = (type, role) => typeDef(type).manage.includes((role || '').toLowerCase());
// The server uses GroupId as the canonical org id; documented aliases as fallbacks.
const orgIdOf = (o) => o?.orgId ?? o?.id ?? o?.organizationId ?? o?.groupId ?? null;
const activeOrg = () => (state.fleet.orgs ?? []).find(o => orgIdOf(o) === state.fleet.activeOrgId) ?? null;

export function mountMembers(body) {
  return mountTab(body, {
    title: t('admin.members'),
    load: async () => {
      const orgId = state.fleet.activeOrgId;
      if (!orgId) return { noOrg: true };
      return { orgId, detail: await orgsApi.get(orgId) };
    },
    render: (data, ctx) => {
      if (data.noOrg) { renderNoOrg(ctx); return; }
      renderRoster(data.orgId, data.detail, ctx);
    },
  });
}

// No org context → "organization" is optional, so a user can land here with
// nothing. Explain what an org is and offer the create path.
function renderNoOrg(ctx) {
  ctx.content.innerHTML = emptyState(
    t('mem.noOrg'),
    { icon: '🏢', cta: `<button class="bb-btn bb-btn-primary" data-act="create-org">${t('mem.createOrg')}</button>` });
  ctx.onClick('[data-act="create-org"]', () => createOrg(ctx));
}

function renderRoster(orgId, detail, ctx) {
  const org = activeOrg();
  // GET org-detail omits `type`; only the list item carries it → read it from
  // the cached org list, falling back to "organization".
  const type = orgTypeOf(org);
  const ownerRole = ownerRoleForType(type);
  const invitable = invitableRolesForType(type);
  const yourRole = (detail?.yourRole ?? org?.role ?? '').toLowerCase();
  const canManage = org ? canManageRole(type, yourRole)
    : ['owner', 'admin', 'parent'].includes(yourRole); // permissive when type unknown
  const members = detail?.members ?? detail?.organization?.members ?? [];

  const selfId = state.connection.user?.userId ?? state.connection.user?.id ?? null;
  const selfEmail = (state.connection.user?.email ?? '').toLowerCase();
  const isSelf = (m) => (selfId && m.userId === selfId) ||
    (selfEmail && m.email && m.email.toLowerCase() === selfEmail);

  const typeLabel = type === 'family' ? t('mem.typeFamily') : t('mem.typeOrg');
  ctx.setTitle(`${t('admin.members')} · ${detail?.name ?? org?.name ?? orgId}`);

  ctx.content.innerHTML = `
    <div class="avs-flex-row" style="justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span class="avs-plan-badge" title="${esc(t('mem.orgTypeTitle'))}">${esc(typeLabel)}</span>
      <div class="avs-flex-row" style="gap:8px;">
        ${canManage ? `<button class="bb-btn bb-btn-primary" data-act="add">${t('admin.add')}</button>` : ''}
        <button class="bb-btn" data-act="create-org">${t('mem.orgFamily')}</button>
      </div>
    </div>
    ${!canManage ? `<p class="bb-form-help">${t('mem.roleHint', { role: `<code>${esc(yourRole || '—')}</code>` })}</p>` : ''}`;

  if (!members.length) {
    ctx.content.insertAdjacentHTML('beforeend', emptyState(t('mem.none'), { icon: '👥' }));
  } else {
    const headers = [t('mem.colEmail'), t('mem.colName'), t('mem.colRole'), t('mem.colSlots'), t('mem.colJoined')];
    if (canManage) headers.push(t('mem.colAction'));
    ctx.content.insertAdjacentHTML('beforeend', table(headers, members.map(m => {
      const uid = m.userId ?? m.id ?? '';
      const self = isSelf(m);
      const isOwner = (m.role ?? '').toLowerCase() === ownerRole;
      // Role is a live <select> only for OTHER, non-owner members (the server
      // blocks changing your own role and the owner's). Otherwise a static badge.
      const editable = canManage && !self && !isOwner;
      const opts = [...new Set([...invitable, (m.role ?? '').toLowerCase()].filter(Boolean))];
      const roleCell = editable
        ? `<select data-role-for="${esc(uid)}" data-prev="${esc(m.role ?? '')}">
             ${opts.map(r => `<option value="${esc(r)}"${(m.role === r) ? ' selected' : ''}>${esc(r)}</option>`).join('')}
           </select>`
        : `<span class="avs-plan-badge">${esc(m.role ?? '—')}</span>${isOwner ? ' 👑' : ''}${self ? ` <span class="avs-muted">${t('mem.you')}</span>` : ''}`;
      const actionCell = canManage
        ? `<td>${(self || isOwner) ? '' : `<button class="bb-btn bb-btn-danger" data-rm-member="${esc(uid)}" data-email="${esc(m.email ?? uid)}">${t('mem.remove')}</button>`}</td>`
        : '';
      return `<tr>
        <td>${esc(m.email ?? m.userId ?? '')}</td>
        <td>${esc(m.name ?? '—')}</td>
        <td>${roleCell}</td>
        <td>${esc(m.allocatedDisplays ?? 0)}</td>
        <td>${esc((m.joinedAt ?? '').slice(0, 10))}</td>
        ${actionCell}
      </tr>`;
    })));
  }

  ctx.onClick('[data-act="add"]', () => addMember(ctx));
  ctx.onClick('[data-act="create-org"]', () => createOrg(ctx));

  // Role <select> is a change event (not a click) → wired directly.
  ctx.content.querySelectorAll('[data-role-for]').forEach(s => s.addEventListener('change', async () => {
    const prev = s.dataset.prev;
    try {
      await orgsApi.setRole(orgId, s.dataset.roleFor, s.value);
      s.dataset.prev = s.value;
      toast(t('common.saved'), { kind: 'success' });
    } catch (e) {
      s.value = prev; // server rejected (e.g. owner/own-role) → revert the dropdown
      toast(e.message, { kind: 'error' });
    }
  }));
  ctx.content.querySelectorAll('[data-rm-member]').forEach(b => b.addEventListener('click', async () => {
    const box = document.createElement('div');
    box.innerHTML = `<p>${t('mem.removeBody', { email: `<b>${esc(b.dataset.email)}</b>`, org: esc(detail?.name ?? orgId) })}</p>
      <p class="bb-form-help">${t('mem.removeHelp')}</p>`;
    const ok = await openModal({ title: t('mem.removeTitle'), body: box,
      actions: [{ label: t('common.cancel') }, { label: t('mem.remove'), kind: 'danger', value: 1 }] });
    if (!ok) return;
    try {
      const r = await orgsApi.removeMember(orgId, b.dataset.rmMember);
      const moved = r?.displaysTransferred ?? 0;
      toast(moved > 0 ? t('mem.removedMoved', { n: moved }) : t('mem.removed'), { kind: 'success' });
      ctx.reload();
    } catch (e) { toast(e.message, { kind: 'error' }); }
  }));
}

// Invite creates a shareable LINK (7-day, optionally email-bound) — the server
// sends NO email. Surface the returned inviteUrl in a copyable block.
async function addMember(ctx) {
  const orgId = state.fleet.activeOrgId;
  if (!orgId) return;
  const type = orgTypeOf(activeOrg());
  const invitable = invitableRolesForType(type);
  const def = defaultInviteRole(type);
  const box = document.createElement('div');
  box.innerHTML = `
    <p class="bb-form-help">${t('mem.inviteHelp')}</p>
    <div class="bb-form-group"><label>${t('mem.role')}</label>
      <select id="mb-role">
        ${invitable.map(r => `<option value="${esc(r)}"${r === def ? ' selected' : ''}>${esc(r)}</option>`).join('')}
      </select>
    </div>
    <div class="bb-form-group"><label>${t('mem.emailOptional')} <span class="avs-muted">(${t('insp.optional')})</span></label>
      <input id="mb-email" placeholder="user@example.com">
      <p class="bb-form-help" style="font-size:11px;margin-top:4px;">${t('mem.emailHint')}</p>
    </div>`;
  const ok = await openModal({ title: t('mem.addTitle'), body: box,
    actions: [{ label: t('common.cancel') }, { label: t('mem.createInvite'), kind: 'primary', value: 1 }] });
  if (!ok) return;
  const role = box.querySelector('#mb-role').value;
  const email = box.querySelector('#mb-email').value.trim();
  try {
    const res = await orgsApi.invite(orgId, { role, ...(email && { email }) });
    const url = res?.inviteUrl ?? res?.url ?? res?.inviteToken ?? res?.token ?? '—';
    const expires = (res?.expiresAt ?? '').slice(0, 10);
    const d = document.createElement('div');
    d.innerHTML = `
      <p>${t('mem.inviteCreated', { role: `<code>${esc(res?.role ?? role)}</code>`, boundTo: res?.inviteeEmail ? t('mem.inviteBoundTo', { email: `<b>${esc(res.inviteeEmail)}</b>` }) : '' })}</p>
      <p class="bb-form-help">${t('mem.inviteShare', { expires: expires ? t('mem.inviteExpires', { date: esc(expires) }) : '' })}</p>
      <label style="display:block;margin-top:12px;font-size:11px;opacity:.7;">${t('mem.inviteLinkLabel')}</label>
      <pre class="avs-codeblock">${esc(url)}</pre>`;
    await openModal({ title: t('mem.inviteLinkTitle'), body: d, actions: [{ label: t('mem.understood'), kind: 'primary', value: 1 }] });
    ctx.reload();
  } catch (e) { toast(e.message, { kind: 'error' }); }
}

// Create an organization (server entity: Group). You become owner.
async function createOrg(ctx) {
  const box = document.createElement('div');
  box.innerHTML = `
    <p class="bb-form-help">${t('mem.createOrgHelp')}</p>
    <div class="bb-form-group"><label>${t('mem.name')}</label><input id="org-name" placeholder="Acme GmbH"></div>
    <div class="bb-form-group"><label>${t('mem.type')}</label>
      <select id="org-type">
        <option value="organization">${t('mem.optOrg')}</option>
        <option value="family">${t('mem.optFamily')}</option>
      </select>
    </div>`;
  const ok = await openModal({ title: t('mem.createOrgTitle'), body: box,
    actions: [{ label: t('common.cancel') }, { label: t('common.create'), kind: 'primary', value: 1 }] });
  if (!ok) return;
  const name = box.querySelector('#org-name').value.trim();
  const orgKind = box.querySelector('#org-type').value;
  if (!name) { toast(t('mem.nameRequired'), { kind: 'warn' }); return; }
  try {
    const created = await orgsApi.create({ name, type: orgKind });
    const newId = orgIdOf(created);
    // Re-list so the chip, switcher and this tab all see the new org, then make
    // it active and notify main.js to redraw the top-bar org chip.
    try {
      const o = await orgsApi.list();
      state.fleet.orgs = Array.isArray(o) ? o : (o?.organizations ?? o?.items ?? []);
    } catch {}
    if (newId) state.fleet.activeOrgId = newId;
    document.dispatchEvent(new CustomEvent('avs:orgs-changed'));
    toast(t('mem.orgCreated'), { kind: 'success' });
    ctx.reload();
  } catch (e) { toast(e.message, { kind: 'error' }); }
}
