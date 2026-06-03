// Verwaltung → Brand-Kit Tab. Org-scoped colours + font persisted in a sidecar
// data-slot (`org-<id>-brandkit`); the slideshow runtime reads it to theme
// screens. Sits behind the Tab-Shell: supplies load + render + its actions.
import { mountTab, esc } from './shell.js';
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
      const c = kit?.colors ?? {};
      ctx.content.innerHTML = `
        <p class="bb-form-help">${t('brandkit.applies')}</p>
        <div class="avs-brandkit-grid">
          <label>${t('brandkit.bg')}     <input type="color" id="bk-bg"     value="${esc(c.bg ?? '#0f1218')}"></label>
          <label>${t('brandkit.fg')}     <input type="color" id="bk-fg"     value="${esc(c.fg ?? '#f1f1f4')}"></label>
          <label>${t('brandkit.accent')} <input type="color" id="bk-accent" value="${esc(c.accent ?? '#8b5cf6')}"></label>
          <label>${t('brandkit.font')}   <input type="text"  id="bk-font"   value="${esc(kit?.font ?? 'Inter, sans-serif')}" style="grid-column:span 2;"></label>
        </div>
        <div class="avs-flex-row" style="margin-top:12px;">
          <button class="bb-btn bb-btn-primary" id="bk-save">${t('common.save')}</button>
          <button class="bb-btn" id="bk-reset">${t('brandkit.clearBtn')}</button>
        </div>`;
      // Save persists + toasts; no reload (the form already shows the new values).
      ctx.onClick('#bk-save', async () => {
        const next = {
          colors: {
            bg: body.querySelector('#bk-bg').value,
            fg: body.querySelector('#bk-fg').value,
            accent: body.querySelector('#bk-accent').value,
          },
          font: body.querySelector('#bk-font').value.trim(),
        };
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
