// Verwaltung → Connectivity Tab. Org-level default connectivity mode + URL
// whitelist for this org's displays (orthogonal to per-display Privacy). A pure
// form — no fetch — so it omits load and builds straight into the Tab-Shell's
// content; Save persists (POST, full replacement) and just toasts (no reload).
// A second section rotates the account-wide display approval secret (confirm
// modal → auth.rotateApprovalSecret), invalidating all existing auto-pairing
// links — an action, not a save, so it also just toasts (no reload).
import { mountTab } from './shell.js';
import { connectivity as connectivityApi, auth as authApi } from '../../api.js';
import { state } from '../../store.js';
import { t } from '../../i18n.js';
import { toast } from '../../ui/toast.js';
import { openModal } from '../../ui/modal.js';

export function mountConnectivity(body) {
  return mountTab(body, {
    title: t('admin.connectivity'),
    render: (_data, ctx) => {
      const orgId = state.fleet.activeOrgId;
      ctx.content.innerHTML = `
        <p class="bb-form-help">${t('conn.cExplainer')}</p>
        <div class="bb-form-group">
          <label>${t('conn.cDefaultMode')}</label>
          <select id="conn-mode">
            <option value="full-access">${t('conn.cModeFull')}</option>
            <option value="whitelist-only">${t('conn.cModeWhitelist')}</option>
            <option value="isolated">${t('conn.cModeIsolated')}</option>
          </select>
        </div>
        <div class="bb-form-group">
          <label>${t('conn.cWhitelist')}</label>
          <textarea id="conn-wl" rows="6" placeholder="weather.example.com\ncdn.example.com"></textarea>
        </div>
        <button class="bb-btn bb-btn-primary" id="conn-save">${t('common.save')}</button>
        <h3 style="margin-top:28px;padding-top:20px;border-top:1px solid var(--bb-border);">${t('conn.approvalSecTitle')}</h3>
        <p class="bb-form-help">${t('conn.approvalSecHelp')}</p>
        <button class="bb-btn" id="conn-rot-approval">${t('conn.rotApproval')}</button>`;
      ctx.onClick('#conn-save', async () => {
        if (!orgId) { toast(t('conn.cNoOrg'), { kind: 'warn' }); return; }
        const mode = ctx.content.querySelector('#conn-mode').value;
        const whitelist = ctx.content.querySelector('#conn-wl').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        try { await connectivityApi.setForOrg(orgId, mode, whitelist); toast(t('common.saved'), { kind: 'success' }); }
        catch (e) { toast(e.message, { kind: 'error' }); }
      });
      // Rotate the account-wide approval secret — destructive (invalidates all
      // existing auto-pairing links), so it confirms first via a danger modal.
      // Not org-scoped and not a save, so no orgId guard and no reload; the
      // outcome is just toasted, matching the Save button above.
      ctx.onClick('#conn-rot-approval', async () => {
        const ok = await openModal({
          title: t('conn.rotApproval'),
          body: `<p>${t('conn.rotApprovalConfirm')}</p>`,
          actions: [{ label: t('common.cancel') }, { label: t('conn.rotApproval'), kind: 'danger', value: 1 }],
        });
        if (!ok) return;
        try { await authApi.rotateApprovalSecret(); toast(t('conn.rotApprovalSuccess'), { kind: 'success' }); }
        catch (e) { toast(e.message, { kind: 'error' }); }
      });
    },
  });
}
