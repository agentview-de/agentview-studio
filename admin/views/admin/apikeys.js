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
          <td>${esc((k.createdAt ?? '').slice(0, 10))}</td>
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

async function addApiKey(ctx) {
  const box = await openFormModal({
    title: t('ak.addTitle'),
    body: `
    <div class="bb-form-group"><label>${t('ak.name')}</label><input id="ak-name" placeholder="Studio CI"></div>
    <div class="bb-form-group"><label>${t('ak.scope')}</label>
      <select id="ak-scope">
        <option value="admin">${t('ak.scopeAdmin')}</option>
        <option value="content_only">${t('ak.scopeContent')}</option>
      </select>
    </div>`,
  });
  if (!box) return;
  try {
    const created = await authApi.apiKeyCreate({
      name: box.querySelector('#ak-name').value.trim() || 'Studio Key',
      scope: box.querySelector('#ak-scope').value,
    });
    const key = created?.apiKey ?? created?.key ?? created?.plaintext;
    if (key) {
      await revealSecretModal({ title: t('ak.title'), intro: `<p>${t('wh.secretShown')}</p>`, secret: key });
    }
    ctx.reload();
  } catch (e) { toast(e.message, { kind: 'error' }); }
}
