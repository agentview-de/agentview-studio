// Verwaltung → Audit Tab. Org activity audit, filtered by display/actor/action/
// date, cursor-paginated. Misfit-for-the-mold: the filter form re-fetches on
// Apply and "Weitere laden" appends via cursor, so the Tab does its own fetching
// inside render() and uses the Shell only for the header + Refresh + error
// boundary. The accumulated rows live in a local (the former state.admin.audit
// data-cache is dropped); state.admin.auditFilter is KEPT — it is UI-state (the
// user's filter), not cached data.
import { mountTab, table, emptyState, esc, unwrapList } from './shell.js';
import { audit as auditApi } from '../../api.js';
import { state } from '../../store.js';
import { t } from '../../i18n.js';

export function mountAudit(body) {
  return mountTab(body, {
    title: t('admin.audit'),
    render: (_data, ctx) => {
      const filter = state.admin.auditFilter ?? {};
      ctx.content.innerHTML = `
        <div class="avs-admin-filter">
          <input id="f-display" placeholder="${t('audit.fDisplay')}" value="${esc(filter.display ?? '')}">
          <input id="f-user" placeholder="${t('audit.fActor')}" value="${esc(filter.user ?? '')}">
          <input id="f-action" placeholder="${t('audit.fAction')}" value="${esc(filter.action ?? '')}">
          <input id="f-from" type="date" placeholder="${t('audit.fFrom')}" value="${esc(filter.from ?? '')}">
          <input id="f-to" type="date" placeholder="${t('audit.fTo')}" value="${esc(filter.to ?? '')}">
          <button class="bb-btn" id="f-apply">${t('audit.fApply')}</button>
        </div>
        <div id="audit-tbody"></div>`;
      const tbody = ctx.content.querySelector('#audit-tbody');
      let cursor = null;
      let all = [];
      const apply = async (append = false) => {
        state.admin.auditFilter = {
          display: ctx.content.querySelector('#f-display').value.trim(),
          user: ctx.content.querySelector('#f-user').value.trim(),
          action: ctx.content.querySelector('#f-action').value.trim(),
          from: ctx.content.querySelector('#f-from').value.trim(),
          to: ctx.content.querySelector('#f-to').value.trim(),
        };
        let resp;
        try {
          const params = { ...state.admin.auditFilter, limit: 50 };
          if (append && cursor) params.cursor = cursor;
          resp = await auditApi.list(params);
        } catch (e) {
          tbody.innerHTML = `<div class="avs-admin-empty">${esc(e.message)}</div>`;
          return;
        }
        // Verified live shape: { rows, nextCursor, hasMore, count, limit }.
        // The server ships `rows`/`timestamp`; tolerate documented aliases too.
        const rows = unwrapList(resp, 'rows', 'entries', 'items');
        cursor = resp?.nextCursor ?? null;
        all = append ? [...all, ...rows] : rows;
        if (!all.length) {
          tbody.innerHTML = emptyState(t('audit.empty'), { icon: '📋' });
          return;
        }
        tbody.innerHTML = table(
          [t('audit.colTime'), t('audit.colActor'), t('audit.colAction'), t('audit.colTarget'), t('audit.colOrg'), t('audit.colIp'), t('audit.colMeta')],
          all.map(r => {
            // Verified live: `timestamp`, `actorUserId`, `ipAddressPrefix`,
            // `metadata` as a JSON string.
            const ts = r.timestamp ?? r.at ?? '';
            const actor = r.actor ?? r.actorUserId ?? '—';
            const ip = r.ipAddressPrefix ?? r.ipPrefix ?? '';
            let metaPretty = '—';
            if (r.metadata) {
              try {
                const obj = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
                if (obj && Object.keys(obj).length) metaPretty = `<code>${esc(JSON.stringify(obj))}</code>`;
              } catch { metaPretty = `<code>${esc(String(r.metadata))}</code>`; }
            }
            return `<tr>
              <td>${esc(ts.slice(0, 19).replace('T', ' '))}</td>
              <td>${esc(actor)}${r.authMethod ? ` <span class="avs-muted">(${esc(r.authMethod)})</span>` : ''}</td>
              <td><code>${esc(r.action ?? '—')}</code></td>
              <td>${esc(r.targetType ?? '')} <code>${esc(r.targetId ?? '')}</code></td>
              <td>${esc(r.orgId ?? '—')}</td>
              <td><span class="avs-muted">${esc(ip)}</span></td>
              <td>${metaPretty}</td>
            </tr>`;
          })
        ) + (cursor ? `<div style="margin-top:12px;text-align:center;"><button class="bb-btn" id="f-more">${t('audit.more')}</button></div>` : '');
        tbody.querySelector('#f-more')?.addEventListener('click', () => apply(true));
      };
      ctx.content.querySelector('#f-apply').addEventListener('click', () => apply(false));
      apply();
    },
  });
}
