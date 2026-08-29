// Verwaltung → API-Keys Tab. Owner-scoped programmatic credentials (admin or
// content_only scope); Studio creates/revokes them, the platform shows the
// plaintext key exactly once on creation. Sits behind the Tab-Shell: supplies
// load + render + its actions, plus a "Widerrufene zeigen" toggle whose state
// lives in state.admin._showRevokedKeys — that flag is UI-STATE (which rows to
// show), NOT a Verwaltung data cache, so it stays.
import { mountTab, table, esc, emptyState, unwrapList, openFormModal, revealSecretModal } from './shell.js';
import { auth as authApi } from '../../api.js';
import { state } from '../../store.js';
import { t } from '../../i18n.js';
import { toast } from '../../ui/toast.js';
import { fmtDate } from '../../format-date.js';

export function mountApiKeys(body) {
  return mountTab(body, {
    title: t('admin.apikeys'),
    // Header carries BOTH the show-revoked toggle and the Add button — exact HTML
    // from the original header() call.
    headerActions: `<label class="avs-flex-row" style="margin-right:8px;font-size:12px;cursor:pointer;">
       <input type="checkbox" id="ak-showrev" ${state.admin._showRevokedKeys ? 'checked' : ''}> ${t('ak.showRevoked')}
     </label>
     <button class="bb-btn bb-btn-primary" data-act="add">${t('admin.add')}</button>`,
    onHeader: (ctx) => {
      // The checkbox is a CHANGE event, not a click → wire it directly. Toggling
      // writes the UI-state flag and reloads (fresh data + re-applied filter).
      ctx.body.querySelector('#ak-showrev')?.addEventListener('change', e => {
        state.admin._showRevokedKeys = e.target.checked;
        ctx.reload();
      });
      ctx.onClick('[data-act="add"]', () => addApiKey(ctx));
    },
    // Verified server returns { keys, total, limit, offset }. Older specs
    // documented apiKeys / items — kept as fallbacks.
    load: async () => unwrapList(await authApi.apiKeyList(), 'keys', 'apiKeys', 'items'),
    // "Empty" here depends on the show-revoked filter, not the raw list, so it is
    // computed inside render (no spec.isEmpty).
    render: (list, ctx) => {
      const showRevoked = !!state.admin._showRevokedKeys;
      const filtered = showRevoked ? list : list.filter(k => !k.isRevoked);
      const hiddenCount = list.length - filtered.length;

      if (!filtered.length) {
        ctx.content.insertAdjacentHTML('beforeend', emptyState(showRevoked ? undefined : t('ak.noActive', { n: hiddenCount })));
        return;
      }
      ctx.content.insertAdjacentHTML('beforeend', table(
        [t('ak.colName'), t('ak.colPrefix'), t('ak.colScope'), t('ak.colPermission'), t('ak.colCreated'), t('ak.colLastUsed'), t('ak.colAction')],
        filtered.map(k => `<tr style="${k.isRevoked ? 'opacity:.5;' : ''}">
          <td>
            ${esc(k.name ?? '—')}
            ${k.isRevoked ? ` <span class="avs-plan-badge">${t('ak.revoked')}</span>` : ''}
            ${k.rotationRecommended ? ` <span class="avs-plan-badge avs-plan-free" title="${esc(t('ak.rotationTip'))}">↻</span>` : ''}
          </td>
          <td><code>${esc(k.keyPrefix ?? k.prefix ?? '')}…</code></td>
          <td>${esc(k.scope ?? '—')}</td>
          <td>${esc(k.permissions ?? '—')}</td>
          <td>${esc(fmtDate(k.createdAt))}</td>
          <td>${esc((k.lastUsedAt ?? '').slice(0, 10))}</td>
          <td>${k.isRevoked ? '' : `<button class="bb-btn bb-btn-danger" data-revoke="${esc(k.keyId ?? k.id)}">${t('admin.revoke')}</button>`}</td>
        </tr>`)
      ));
      if (!showRevoked && hiddenCount > 0) {
        ctx.content.insertAdjacentHTML('beforeend', `<p class="avs-muted" style="margin-top:8px;font-size:12px;">${esc(t('ak.hiddenCount', { n: hiddenCount }))}</p>`);
      }
      // Revoke re-fetches after success (handled by the Shell's onAction reload).
      ctx.onAction('[data-revoke]', async (b) => {
        await authApi.apiKeyRevoke(b.dataset.revoke);
        toast(t('admin.revoke'), { kind: 'success' });
      });
    },
  });
}

// Capability flags a key may exercise. They NARROW a key — never widen it —
// and combine with scope + permissions + the resource allowlists. Nothing
// ticked means "no capability restriction", which is why the form has to say so
// out loud: an empty box here is the permissive choice, not the safe one.
const CAPABILITIES = ['slot.read', 'slot.write', 'display.read', 'display.send', 'display.manage'];

async function addApiKey(ctx) {
  const displays = state.fleet.displays ?? [];
  const box = await openFormModal({
    title: t('ak.addTitle'),
    body: `
    <div class="bb-form-group"><label>${t('ak.name')}</label><input id="ak-name" placeholder="Studio CI"></div>
    <div class="bb-form-group"><label>${t('ak.scope')}</label>
      <select id="ak-scope">
        <option value="admin">${t('ak.scopeAdmin')}</option>
        <option value="content_only" selected>${t('ak.scopeContent')}</option>
      </select>
    </div>
    <div class="bb-form-group"><label>${t('ak.permissions')}</label>
      <select id="ak-perm">
        <option value="read_write">${t('ak.permReadWrite')}</option>
        <option value="read">${t('ak.permRead')}</option>
        <option value="write">${t('ak.permWrite')}</option>
      </select>
      <p class="bb-form-help">${t('ak.permHelp')}</p>
    </div>
    <div class="bb-form-group"><label>${t('ak.expiry')}</label>
      <select id="ak-exp">
        <option value="30">${t('ak.expiry30')}</option>
        <option value="90" selected>${t('ak.expiry90')}</option>
        <option value="365">${t('ak.expiry365')}</option>
        <option value="">${t('ak.expiryNever')}</option>
      </select>
    </div>
    <details class="bb-form-group">
      <summary style="cursor:pointer;">${t('ak.restrictTitle')}</summary>
      <p class="bb-form-help">${t('ak.restrictHelp')}</p>
      <label style="display:block;margin-top:8px;font-size:11px;opacity:.7;">${t('ak.capabilities')}</label>
      ${CAPABILITIES.map(c => `<label class="avs-flex-row" style="font-size:12px;">
        <input type="checkbox" data-cap="${esc(c)}"> <code>${esc(c)}</code></label>`).join('')}
      <label style="display:block;margin-top:8px;font-size:11px;opacity:.7;">${t('ak.allowedDisplays')}</label>
      ${displays.length
        ? `<select id="ak-displays" multiple size="${Math.min(displays.length, 6)}" style="width:100%;">
             ${displays.map(d => `<option value="${esc(d.id ?? '')}">${esc(d.name ?? d.id ?? '')}</option>`).join('')}
           </select>`
        : `<p class="bb-form-help">${t('ak.noDisplays')}</p>`}
      <label style="display:block;margin-top:8px;font-size:11px;opacity:.7;">${t('ak.allowedSlots')}</label>
      <input id="ak-slots" placeholder="sensor-lobby, sensor-garage">
    </details>`,
  });
  if (!box) return;
  try {
    // Empty selections are dropped by apiKeyCreate() — the server reads an
    // absent allowlist as "unrestricted", so we never send [] and pretend it
    // means something stricter.
    const capabilities = [...box.querySelectorAll('[data-cap]')].filter(c => c.checked).map(c => c.dataset.cap);
    const allowedDisplayIds = [...(box.querySelector('#ak-displays')?.selectedOptions ?? [])].map(o => o.value).filter(Boolean);
    const allowedSlotSlugs = box.querySelector('#ak-slots').value.split(',').map(v => v.trim()).filter(Boolean);
    const expiresInDays = Number(box.querySelector('#ak-exp').value) || undefined;
    const created = await authApi.apiKeyCreate({
      name: box.querySelector('#ak-name').value.trim() || 'Studio Key',
      scope: box.querySelector('#ak-scope').value,
      permissions: box.querySelector('#ak-perm').value,
      expiresInDays,
      capabilities,
      allowedDisplayIds,
      allowedSlotSlugs,
    });
    const key = created?.apiKey ?? created?.key ?? created?.plaintext;
    if (key) {
      await revealSecretModal({ title: t('ak.title'), intro: `<p>${t('wh.secretShown')}</p>`, secret: key });
    }
    ctx.reload();
  } catch (e) { toast(e.message, { kind: 'error' }); }
}
