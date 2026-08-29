// Verwaltung → Approvals Tab. Per-display pending content submissions — accept,
// reject, or roll back. Fans out one approval-state call per display, then shows
// only the displays with something pending. Misfit-for-the-mold: it has TWO
// empty states (no displays vs nothing pending), so it renders them itself
// inside render() rather than via spec.isEmpty.
import { mountTab, emptyState, esc } from './shell.js';
import { approval as approvalApi } from '../../api.js';
import { state } from '../../store.js';
import { t } from '../../i18n.js';
import { toast } from '../../ui/toast.js';
import { fmtDateTime } from '../../format-date.js';

export function mountApprovals(body) {
  return mountTab(body, {
    title: t('admin.approvals'),
    // GET /approval-state per display gives mode + pending in one call. Probe
    // every display in parallel; tolerate individual failures.
    load: async () => {
      const displays = state.fleet.displays ?? [];
      const results = await Promise.allSettled(displays.map(async d => {
        try {
          const r = await approvalApi.state(d.id);
          // pending is always an object; "actually pending" means at least one
          // non-null sub-field (verified live shape).
          const p = r?.pending;
          const hasPending = p && (p.submittedAt || p.versionId || p.fileName || p.description);
          return { display: d, mode: r?.mode ?? (r?.requireApproval ? 'on' : 'off'), pending: hasPending ? p : null };
        } catch { return null; }
      }));
      const rows = results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
      return { displays, pending: rows.filter(r => r.pending) };
    },
    render: ({ displays, pending }, ctx) => {
      if (!displays.length) {
        ctx.content.innerHTML = emptyState(t('appr.noDisplays'), { icon: '📺' });
        return;
      }
      if (!pending.length) {
        ctx.content.innerHTML = emptyState(t('appr.noPending'), { icon: '✅' });
        return;
      }
      ctx.content.innerHTML = `<div class="avs-admin-cards">${
        pending.map(p => `
          <article class="avs-admin-card">
            <h3>${esc(p.display.name ?? p.display.id)}</h3>
            <p class="avs-muted">🟡 ${esc(fmtDateTime(p.pending.submittedAt))} · ${esc(p.pending.submittedBy ?? '—')}</p>
            <p>${esc(p.pending.description ?? p.pending.contentDescription ?? '—')}</p>
            <div class="avs-admin-card-actions">
              <button class="bb-btn bb-btn-primary" data-accept="${esc(p.display.id)}">${t('approval.accept')}</button>
              <button class="bb-btn" data-reject="${esc(p.display.id)}">${t('approval.reject')}</button>
              <button class="bb-btn" data-rollback="${esc(p.display.id)}">${t('approval.rollback')}</button>
            </div>
          </article>`).join('')
      }</div>`;
      ctx.onAction('[data-accept]', async (b) => { await approvalApi.accept(b.dataset.accept); toast(t('approval.accept'), { kind: 'success' }); });
      ctx.onAction('[data-reject]', async (b) => { await approvalApi.reject(b.dataset.reject); toast(t('approval.reject'), { kind: 'success' }); });
      ctx.onAction('[data-rollback]', async (b) => { await approvalApi.rollback(b.dataset.rollback); toast(t('approval.rollback'), { kind: 'success' }); });
    },
  });
}
