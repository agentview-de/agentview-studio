// Verwaltung → Licenses Tab. Pool / allocated / used overview, per-org
// allocation table, and a slot-pool extension for the active org. The add-slots
// button validates before calling the API, so it uses onClick (not onAction) —
// onAction would reload even when validation short-circuits without a call.
import { mountTab, table, esc } from './shell.js';
import { auth as authApi, licensing as licensingApi, pricing as pricingApi } from '../../api.js';
import { state } from '../../store.js';
import { t } from '../../i18n.js';
import { toast } from '../../ui/toast.js';
import { openModal } from '../../ui/modal.js';

export function mountLicenses(body) {
  return mountTab(body, {
    title: t('admin.licenses'),
    load: () => authApi.licenseInfo(),
    render: (info, ctx) => {
      const orgId = state.fleet.activeOrgId;
      // Verified real shape from /api/v1/agent/license-info:
      //   totalPremiumLicenses · totalAllocatedToOrgs · personalPremiumDisplays
      //   orgAllocations: [{ orgId, name, allocatedLicenses, usedDisplays, premiumDisplays, type }]
      const pool = info?.totalPremiumLicenses ?? info?.pool ?? info?.total ?? 0;
      const allocated = info?.totalAllocatedToOrgs ?? info?.allocated ?? 0;
      const usedInOrgs = (info?.orgAllocations ?? []).reduce((s, o) => s + (o.usedDisplays ?? 0), 0);
      const used = (info?.personalPremiumDisplays ?? 0) + usedInOrgs;
      const activeOrgRow = (info?.orgAllocations ?? []).find(o => o.orgId === orgId);

      ctx.content.innerHTML = `
        <div class="avs-license-grid">
          <div class="avs-stat"><b>${esc(pool)}</b><span>${t('lic.pool')}</span></div>
          <div class="avs-stat"><b>${esc(allocated)}</b><span>${t('lic.allocated')}</span></div>
          <div class="avs-stat"><b>${esc(used)}</b><span>${t('lic.active')}</span></div>
        </div>
        ${(info?.orgAllocations ?? []).length ? `
          <h4 style="margin-top:8px;">${t('lic.perOrg')}</h4>
          ${table([t('lic.colOrg'), t('lic.colAllocated'), t('lic.colUsed'), t('lic.colPremium')],
            info.orgAllocations.map(o => `<tr>
              <td>${esc(o.name ?? o.orgId)}</td>
              <td>${esc(o.allocatedLicenses ?? 0)}</td>
              <td>${esc(o.usedDisplays ?? 0)}</td>
              <td>${esc(o.premiumDisplays ?? 0)}</td>
            </tr>`))}
        ` : ''}
        <div class="bb-form-group" style="margin-top:16px;">
          <label>${esc(t('lic.poolExtension', { org: activeOrgRow?.name ?? orgId ?? t('lic.none') }))}</label>
          <p class="bb-form-help" style="font-size:11px;">${esc(t('lic.poolExtensionHelp', { org: orgId ?? '…' }))}</p>
          <div class="avs-flex-row">
            <input type="number" id="lic-delta" min="1" value="1" style="max-width:100px;">
            <button class="bb-btn bb-btn-primary" id="lic-add" ${info?.canAllocate === false ? `disabled title="${esc(t('lic.poolExhausted'))}"` : ''}>${t('lic.addSlots')}</button>
          </div>
          ${info?.freeAllocatableLicenses != null ? `<p class="avs-muted" style="font-size:11px;">${esc(t('lic.stillAllocatable', { n: info.freeAllocatableLicenses }))}</p>` : ''}
        </div>
        <p class="bb-form-help">${t('lic.assignHelp')}</p>
        <p style="margin-top:14px;"><button class="bb-btn" id="lic-compare">${t('lic.compare')}</button></p>`;

      ctx.onClick('#lic-compare', () => openPricingComparison());
      ctx.onClick('#lic-add', async () => {
        const delta = +ctx.content.querySelector('#lic-delta').value;
        if (!orgId) { toast(t('lic.noOrg'), { kind: 'warn' }); return; }
        if (!delta || delta < 1) { toast(t('lic.minOneSlot'), { kind: 'warn' }); return; }
        try { await licensingApi.addSlots(orgId, delta); toast(t('lic.slotsAssigned', { n: delta }), { kind: 'success' }); ctx.reload(); }
        catch (e) { toast(e.message, { kind: 'error' }); }
      });
    },
  });
}

// Plan-comparison modal from /api/v1/agent/pricing (the old public
// /api/v1/pricing 404s since the 2.1.x API). Live shape (2026-07-07):
// { plans: [{ name, price:"Free"|"€4/month per display", monthlyPrice, displays, features[] }] }.
async function openPricingComparison() {
  const box = document.createElement('div');
  box.innerHTML = '<p class="avs-muted">…</p>';
  const p = openModal({
    title: t('lic.compareTitle'), body: box,
    actions: [{ label: t('common.close'), kind: 'primary' }],
  });
  // A positive numeric monthlyPrice renders as "€N /month"; otherwise show the
  // server's own price string ("Free", "€4/month per display") without a
  // suffix so the label isn't doubled.
  const priceHtml = pl => {
    if (typeof pl.monthlyPrice === 'number' && pl.monthlyPrice > 0) {
      return `€${esc(pl.monthlyPrice)}<span class="avs-muted" style="font-size:12px;">${t('lic.perMonth')}</span>`;
    }
    return esc(pl.pricePerMonth ?? pl.monthly ?? pl.price ?? '—');
  };
  try {
    const data = await pricingApi.get();
    const plans = data?.plans ?? data?.tiers ?? (Array.isArray(data) ? data : []);
    if (!plans.length) { box.innerHTML = `<p class="avs-muted">${t('lic.dataEmpty', { link: '<a href="https://agentview.de/pricing" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">agentview.de/pricing ↗</a>' })}</p>`; }
    else {
      box.innerHTML = `<div class="avs-license-grid" style="grid-template-columns: repeat(${Math.min(plans.length, 4)}, 1fr);">${
        plans.map(pl => `
          <div class="avs-admin-card" style="text-align:center;">
            <h3 style="margin-bottom:6px;">${esc(pl.name ?? pl.id ?? '—')}</h3>
            <p style="font-size:22px;font-weight:700;margin:8px 0;">${priceHtml(pl)}</p>
            ${pl.pricePerYear != null ? `<p class="avs-muted" style="font-size:11px;">${esc(t('lic.orYear', { price: pl.pricePerYear }))}</p>` : ''}
            ${pl.includedLicenses != null ? `<p>${esc(t('lic.includedLicenses', { n: pl.includedLicenses }))}</p>` : ''}
            ${Array.isArray(pl.features) ? `<ul style="text-align:left;font-size:12px;margin-top:10px;padding-left:18px;">${pl.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
          </div>`).join('')
      }</div>`;
      // Account-specific billing portal (2.1.x) — best-effort: the button only
      // appears when the endpoint answers with a URL.
      authApi.billingUrl().then(r => {
        const url = r?.url ?? r?.billingUrl;
        if (!url || !/^https:\/\//i.test(url)) return;
        const row = document.createElement('p');
        row.style.cssText = 'margin-top:12px;text-align:center;';
        row.innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener" class="bb-btn bb-btn-secondary">${t('lic.billingPortal')} ↗</a>`;
        box.appendChild(row);
      }).catch(() => {});
    }
  } catch (e) {
    // Older servers may not expose the pricing endpoint — link out instead of erroring.
    box.innerHTML = `<p class="avs-muted">${esc(e.message)}</p>
      <p style="margin-top:10px;"><a href="https://agentview.de/pricing" target="_blank" rel="noopener" class="bb-btn">${t('lic.compareLink')}</a></p>`;
  }
  await p;
}
