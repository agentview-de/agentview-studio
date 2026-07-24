// Verwaltung → Brand-Kit Tab. Org-scoped colours + font persisted in a sidecar
// data-slot (`org-<id>-brandkit`); the slideshow runtime reads it to theme
// screens. Sits behind the Tab-Shell: supplies load + render + its actions.
import { mountTab } from './shell.js';
import { brandKitGrid, readBrandKitGrid } from '../../ui/brand-kit-form.js';
import { slots } from '../../api.js';
import { state } from '../../store.js';
import { t } from '../../i18n.js';
import { toast } from '../../ui/toast.js';

export function mountBrandKit(body) {
  const orgId = state.fleet.activeOrgId;
  const sidecarSlug = orgId ? `org-${orgId}-brandkit` : 'org-brandkit';
  return mountTab(body, {
    title: t('admin.brandkit'),
    // Fetch the sidecar slot fresh every activate — no state.admin cache.
    load: () => slots.getValue(sidecarSlug).catch(() => null),
    render: (kit, ctx) => {
      ctx.content.innerHTML = `
        <p class="bb-form-help">${t('brandkit.applies')}</p>
        ${brandKitGrid(kit ?? {}, { prefix: 'bk', fontDefault: 'Inter, sans-serif' })}
        <div class="avs-flex-row" style="margin-top:12px;">
          <button class="bb-btn bb-btn-primary" id="bk-save">${t('common.save')}</button>
          <button class="bb-btn" id="bk-reset">${t('brandkit.clearBtn')}</button>
        </div>`;
      // Save persists + toasts; no reload (the form already shows the new values).
      ctx.onClick('#bk-save', async () => {
        const next = readBrandKitGrid(body, 'bk');
        try {
          await slots.put(sidecarSlug, next, { label: t('brandkit.label', { org: state.fleet.activeOrgId ?? t('brandkit.default') }) });
          toast(t('common.saved'), { kind: 'success' });
        } catch (e) { toast(e.message, { kind: 'error' }); }
      });
      // Reset removes the slot; the shell reloads → empty form (and toasts on error).
      ctx.onAction('#bk-reset', async () => { await slots.remove(sidecarSlug); });
    },
  });
}
