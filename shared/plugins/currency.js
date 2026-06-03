import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { liveSource } from '../live-source.js';
import { isStored, offlineLiveOpts, DATAMODE_OPTIONS } from '../offline-data.js';
import { escapeHtml } from '../utils/escape.js';
import { currencySymbol } from '../data/currencies.js';

// Uses open.er-api.com (no key, CORS-enabled).

// The exchange-rate endpoint for a base currency. One source of truth so live
// render and offline provisioning fetch the same URL.
const fxUrl = (base) => `https://open.er-api.com/v6/latest/${encodeURIComponent(base || 'EUR')}`;

// FX rates span orders of magnitude (1 EUR ≈ 1.08 USD but ≈ 160 JPY). A flat
// 4 decimals turns large rates into noise ("160.0000"), so scale the precision
// to the magnitude, small rates keep 4 dp, large rates round to 2.
function formatRate(r) {
  const a = Math.abs(r);
  const decimals = a >= 100 ? 2 : a >= 10 ? 3 : 4;
  return r.toFixed(decimals);
}
export default register({
  type: 'currency',
  label: 'Currency Ticker',
  group: 'live',
  icon: '💱',
  network: true,
  usage: {
    tier: 'business-ok',
    attribution: 'Rates By Exchange Rate API',
    providerTerms: 'https://www.exchangerate-api.com/terms',
    note: 'Free open endpoint; attribution required, cache responses.',
  },
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(), dataMode: 'live', base: 'EUR', symbols: ['USD','GBP','JPY','CHF'], theme: 'corporate-blue' }),
  // Offline provisioning: fetch the rates Studio-side and store the raw response.
  // (No key here, but this is the generic seam currency/weather share.)
  provisionOffline: async (content) => {
    const r = await fetch(fxUrl(content?.base ?? 'EUR'), { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },
  schema: () => ({
    fields: [
      { key: 'dataMode', type: 'select', label: 'Data source', default: 'live', options: DATAMODE_OPTIONS,
        help: 'Offline: the Studio fetches the rates on “Refresh data” and stores them; the display reads that — no live call on screen.' },
      { key: 'base', type: 'currency', label: 'Base currency' },
      { key: 'symbols', type: 'list', label: 'Target currencies',
        itemShape: [{ key: 'code', type: 'currency', label: 'Currency' }] },
      themeField(),
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-fx bb-theme-${c.theme ?? 'corporate-blue'}`;
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <div class="bb-fx-base">1 ${escapeHtml(c.base ?? 'EUR')} =</div>
      <div class="bb-fx-grid">Loading rates…</div>
      <div class="bb-fx-attribution" style="font-size:clamp(10px, 1.4cqmin, 18px);line-height:1.4;opacity:.55;margin-top:6px;text-align:center;">
        Rates By <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">Exchange Rate API</a>
      </div>
    `;
    container.appendChild(root);
    if (ctx?.thumbnail) {
      const symbols = (Array.isArray(c.symbols) ? c.symbols : []).map(s => typeof s === 'string' ? s : s.code).filter(Boolean);
      root.querySelector('.bb-fx-grid').innerHTML = symbols.map(sym =>
        `<div class="bb-fx-cell"><span class="bb-fx-sym">${escapeHtml(sym)}</span><span class="bb-fx-rate">${escapeHtml(currencySymbol(sym))} 1.00</span></div>`
      ).join('') || '<div>(rates load in player)</div>';
      return composeDispose(() => root.remove());
    }
    // One-shot fetch via the shared live-source seam. er-api answers with HTTP
    // 200 even on failure, signalling via the body ({ result:'error' }); onData
    // throws on that so it lands as an honest "unavailable" (routed to onError)
    // rather than a silent grid of em-dashes.
    if (isStored(c) && c._offline?.data === undefined) {
      root.querySelector('.bb-fx-grid').textContent = 'Provided offline — appears on the display after “Refresh data”.';
      return composeDispose(() => root.remove());
    }
    const stop = liveSource({
      url: fxUrl(c.base),
      signal: ctx?.signal,
      ...offlineLiveOpts(c),
      onData: (j) => {
        if (j.result === 'error' || !j.rates) throw new Error('rates unavailable');
        const symbols = (Array.isArray(c.symbols) ? c.symbols : []).map(s => typeof s === 'string' ? s : s.code).filter(Boolean);
        const rates = j.rates;
        root.querySelector('.bb-fx-grid').innerHTML = symbols.map(sym => {
          const r = rates[sym];
          return `<div class="bb-fx-cell">
            <span class="bb-fx-sym">${escapeHtml(sym)}</span>
            <span class="bb-fx-rate">${r != null ? escapeHtml(currencySymbol(sym) + ' ' + formatRate(r)) : '—'}</span>
          </div>`;
        }).join('') || '<div>No symbols configured.</div>';
      },
      onError: () => {
        if (!ctx?.onError?.()) root.querySelector('.bb-fx-grid').textContent = 'Rates unavailable.';
      },
    });
    return composeDispose(() => { stop(); root.remove(); });
  },
});

