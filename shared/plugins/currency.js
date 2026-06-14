import { register } from './registry.js';
import { themeColorSection, colorOverrideDefaults, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { liveSource } from '../live-source.js';
import { isStored, offlineLiveOpts, dataModeField } from '../offline-data.js';
import { refreshSecField } from '../refresh-field.js';
import { textScaleField } from '../text-scale.js';
import { STATUS_COLORS } from '../status-colors.js';
import { escapeHtml } from '../utils/escape.js';
import { currencySymbol, currencyByCode } from '../data/currencies.js';

// Uses open.er-api.com (no key, CORS-enabled).

// The exchange-rate endpoint for a base currency. One source of truth so live
// render and offline provisioning fetch the same URL.
const fxUrl = (base) => `https://open.er-api.com/v6/latest/${encodeURIComponent(base || 'EUR')}`;

// FX rates span orders of magnitude (1 EUR ≈ 1.08 USD but ≈ 160 JPY). A flat
// 4 decimals turns large rates into noise ("160.0000"), so the 'auto' default
// scales the precision to the magnitude — small rates keep 4 dp, large rates
// round to 2. A numeric `decimals` ('2'|'3'|'4') pins the precision instead so
// columns line up on dense multi-currency boards.
function formatRate(r, decimals) {
  const fixed = Number(decimals);
  if (Number.isFinite(fixed)) return r.toFixed(fixed);
  const a = Math.abs(r);
  const d = a >= 100 ? 2 : a >= 10 ? 3 : 4;
  return r.toFixed(d);
}

// symbols tolerates both plain-string entries and { code } objects (the legacy
// stored shape) — one normaliser shared by thumbnail, live render and validate
// so the tolerance can never drift between paths.
const normSymbols = (list) =>
  (Array.isArray(list) ? list : []).map(s => typeof s === 'string' ? s : s?.code).filter(Boolean);

// ── Trend baseline (▲/▼/– arrows) ───────────────────────────────────────────
// er-api publishes a new fix roughly once a day, so "trend" means "versus the
// PREVIOUS publication", not versus the previous poll (hourly polls of the same
// fix would otherwise flatten every arrow). We keep the last TWO publications
// per base currency in localStorage: when a payload with a new
// time_last_update stamp arrives, the store rolls forward (last → prev) and the
// old fix becomes the comparison baseline. Re-renders within the same
// publication keep comparing against the same prev — arrows are stable across
// editor keystrokes and player slide loops. Keyed by base only: two currency
// widgets with the same base see identical rates, so sharing the store is
// correct (and halves the writes).
const TREND_LS = 'bb-fx-trend:';
function rollTrendBaseline(base, j) {
  let store = null;
  // try/catch also covers environments without localStorage (private mode,
  // quota, non-browser) — trends just stay neutral there.
  try { store = JSON.parse(localStorage.getItem(TREND_LS + base) || 'null'); } catch { store = null; }
  const stamp = j.time_last_update_unix ?? j.time_last_update_utc ?? null;
  const isNewFix = !store
    || (stamp != null
      ? store.lastStamp !== stamp
      : JSON.stringify(store.lastRates) !== JSON.stringify(j.rates));
  if (!isNewFix) return store.prevRates ?? null;
  try {
    localStorage.setItem(TREND_LS + base, JSON.stringify({
      prevStamp: store?.lastStamp ?? null,
      prevRates: store?.lastRates ?? null,
      lastStamp: stamp,
      lastRates: j.rates,
    }));
  } catch { /* storage unavailable — arrows render neutral until it is */ }
  return store?.lastRates ?? null;
}

// The per-cell arrow: ▲ green when the rate rose against the previous fix,
// ▼ red when it fell, muted – when flat or no baseline exists yet (first run).
// Colours come from the shared STATUS_COLORS traffic-light palette; the tiny
// relative epsilon kills float jitter without hiding genuine 4th-decimal moves.
function trendHtml(prev, cur) {
  const p = Number(prev), v = Number(cur);
  let ch = '–', color = '';
  if (Number.isFinite(p) && Number.isFinite(v)) {
    const eps = Math.abs(p) * 1e-9;
    if (v > p + eps) { ch = '▲'; color = STATUS_COLORS.good; }
    else if (v < p - eps) { ch = '▼'; color = STATUS_COLORS.bad; }
  }
  return `<span class="bb-fx-trend" style="font-size:.5em;vertical-align:.35em;margin-left:.3em;${color ? `color:${color};` : 'opacity:.4;'}">${ch}</span>`;
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
  defaults: () => ({
    ...colorOverrideDefaults(),
    dataMode: 'live',
    base: 'EUR',
    symbols: ['USD', 'GBP', 'JPY', 'CHF'],
    // Hourly by default: er-api publishes daily, so hourly polling is generous
    // headroom while keeping always-on displays from going stale. Existing
    // stored widgets without the key keep the old fetch-once behaviour (0).
    refreshSec: 3600,
    decimals: 'auto',
    showName: false,
    trend: false,
    textScale: 100,
    theme: 'corporate-blue',
  }),
  // Offline provisioning: fetch the rates Studio-side and store the raw response.
  // (No key here, but this is the generic seam currency/weather share.)
  provisionOffline: async (content) => {
    const r = await fetch(fxUrl(content?.base ?? 'EUR'), { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'base', type: 'currency', label: 'Base currency',
        help: 'All rates are expressed against this currency.' },
      { key: 'symbols', type: 'list', label: 'Target currencies',
        itemShape: [{ key: 'code', type: 'currency', label: 'Currency' }],
        help: 'Shown in this order on the display — drag to reorder.',
        validate: (v) => normSymbols(v).length ? null
          : { level: 'warn', message: 'Add at least one target currency — the display shows nothing otherwise.' } },

      { type: 'section', key: 'data', label: 'Data' },
      dataModeField(),
      // Polling interval for live mode (offline mode reads a pre-fetched slot,
      // so the knob is hidden there). 5 s render floor per the shared contract.
      refreshSecField({
        help: 'open.er-api.com publishes new rates once a day — hourly is plenty. 0 fetches once and keeps that rate until the slide re-renders.',
        showIf: c => !isStored(c),
      }),

      { type: 'section', key: 'appearance', label: 'Appearance' },
      { key: 'decimals', type: 'select', label: 'Decimal places', buttons: true,
        options: [
          { value: 'auto', label: 'Auto' },
          { value: '2', label: '2' },
          { value: '3', label: '3' },
          { value: '4', label: '4' },
        ],
        help: 'Auto scales the precision to the rate’s magnitude (162.51 vs 1.0842); a fixed count keeps columns aligned on dense boards.' },
      { type: 'row', children: [
        { key: 'showName', type: 'toggle', label: 'Currency names',
          help: 'Shows the full name (“US Dollar”) under each code.' },
        { key: 'trend', type: 'toggle', label: 'Trend arrows',
          help: 'Marks each rate ▲ up / ▼ down / – flat against the previous daily fix, green = up, red = down.' },
      ] },
      textScaleField(),

      ...themeColorSection(),
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-fx bb-theme-${c.theme ?? 'corporate-blue'}`;
    // Text-size multiplier — consumed by the .bb-fx-base/.bb-fx-sym/.bb-fx-rate
    // clamps in styles/slide-themes.css (calc(clamp(…) * var(--bb-fx-text-scale, 1)))
    // and by the inline attribution/name sizes below.
    root.style.setProperty('--bb-fx-text-scale', String((Number(c.textScale) || 100) / 100));
    const showName = c.showName === true;
    const showTrend = c.trend === true;
    // Full currency name under the code ("US Dollar"), from the same curated
    // list the picker uses; unknown/legacy codes simply render no name line.
    const nameHtml = (sym) => {
      if (!showName) return '';
      const name = currencyByCode(sym)?.name;
      return name ? `<span class="bb-fx-name" data-field="showName symbols" style="display:block;font-size:calc(clamp(11px, 1.5cqmin, 18px) * var(--bb-fx-text-scale, 1));line-height:1.2;opacity:.55;margin-top:2px;">${escapeHtml(name)}</span>` : '';
    };
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <div class="bb-fx-base" data-field="base">1 ${escapeHtml(c.base ?? 'EUR')} =</div>
      <div class="bb-fx-grid">Loading rates…</div>
      <div class="bb-fx-attribution" style="font-size:calc(clamp(10px, 1.4cqmin, 18px) * var(--bb-fx-text-scale, 1));line-height:1.4;opacity:.55;margin-top:6px;text-align:center;">
        Rates By <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">Exchange Rate API</a>
      </div>
    `;
    container.appendChild(root);
    if (ctx?.thumbnail) {
      // Fabricated 1.00 rates ("looks alive" without a network call). Names and
      // fixed decimals still apply so the thumbnail mirrors the configuration;
      // trend arrows are skipped — there is no real baseline to compare against.
      const symbols = normSymbols(c.symbols);
      const fake = /^\d+$/.test(String(c.decimals ?? '')) ? (1).toFixed(Number(c.decimals)) : '1.00';
      root.querySelector('.bb-fx-grid').innerHTML = symbols.map(sym =>
        `<div class="bb-fx-cell"><span class="bb-fx-sym" data-field="symbols">${escapeHtml(sym)}</span>${nameHtml(sym)}<span class="bb-fx-rate" data-field="symbols decimals trend">${escapeHtml(currencySymbol(sym) + ' ' + fake)}</span></div>`
      ).join('') || '<div>(rates load in player)</div>';
      return composeDispose(() => root.remove());
    }
    // er-api answers with HTTP 200 even on failure, signalling via the body
    // ({ result:'error' }); onData throws on that so it lands as an honest
    // "unavailable" (routed to onError) rather than a silent grid of em-dashes.
    if (isStored(c) && c._offline?.data === undefined) {
      root.querySelector('.bb-fx-grid').textContent = 'Provided offline — appears on the display after “Refresh data”.';
      return composeDispose(() => root.remove());
    }
    // Poll on the configured interval (0 = the old one-shot behaviour) so
    // always-on displays pick up the daily fix without a slide re-render.
    // maxErrors:0 + stopOnCorsError:false keep a polling board alive through
    // network blips (a fetch TypeError on an offline player looks CORS-shaped);
    // the default backoff retries within a minute instead of waiting the full
    // hour, and onData repaints the whole grid so recovery is automatic.
    const refreshSec = Math.max(0, Number(c.refreshSec) || 0);
    const stop = liveSource({
      url: fxUrl(c.base),
      signal: ctx?.signal,
      intervalMs: refreshSec > 0 ? Math.max(5000, refreshSec * 1000) : 0,
      maxErrors: 0,
      stopOnCorsError: false,
      ...offlineLiveOpts(c),
      onData: (j) => {
        if (j.result === 'error' || !j.rates) throw new Error('rates unavailable');
        const symbols = normSymbols(c.symbols);
        const rates = j.rates;
        // Roll the trend store ONCE per payload (not per cell) so prev/last
        // shift exactly one publication per new fix.
        const baseline = showTrend ? rollTrendBaseline(c.base ?? 'EUR', j) : null;
        root.querySelector('.bb-fx-grid').innerHTML = symbols.map(sym => {
          const r = rates[sym];
          let rateHtml = '—';
          if (r != null) {
            rateHtml = escapeHtml(currencySymbol(sym) + ' ' + formatRate(r, c.decimals));
            if (showTrend) rateHtml += trendHtml(baseline?.[sym], r);
          }
          return `<div class="bb-fx-cell">
            <span class="bb-fx-sym" data-field="symbols">${escapeHtml(sym)}</span>${nameHtml(sym)}
            <span class="bb-fx-rate" data-field="symbols decimals trend">${rateHtml}</span>
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
