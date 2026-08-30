import { register } from './registry.js';
import { textScaleField } from '../text-scale.js';
import { colorOverrideDefaults, applyColorOverrides, themeColorSection } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';
import { remoteJsonFields } from '../remote-json-fields.js';
import { refreshIntervalMs } from '../refresh-field.js';
import { liveSource } from '../live-source.js';
import { offlineLiveOpts } from '../offline-data.js';
import { localeField, safeLocale } from '../locale-field.js';
import { formatNumber, formatCompact } from '../format-number.js';
import { STATUS_COLORS } from '../status-colors.js';
import { isSafeImgUrl } from '../safe-url.js';

// Ranked list — sales floors, gyms, schools, clubs, fundraising walls, esports.
//
// data-table can already print name/value pairs, but a leaderboard is a
// different object: it RANKS (so the order is derived, not typed), it compares
// (so every row wants a bar relative to the leader), and it celebrates (medals,
// one highlighted row for "you"). Faking those on a table meant re-sorting by
// hand every week and losing the comparison entirely.

const MEDALS = ['🥇', '🥈', '🥉'];

// Forgiving remote shapes, same policy as queue-call: signage must not be the
// reason a working API needs a proxy.
//   [ { name, value, … } … ]
//   { rows: […] } / { items: […] } / { entries: […] } / { data: […] }
//   { "Alice": 42, "Bob": 37 }        → object of name → value
function normalizeRow(v, key) {
  if (v == null) return null;
  if (typeof v === 'number' || typeof v === 'string') {
    if (key == null) return null;
    return { name: String(key), value: Number(v), note: '', avatar: '', deltaPct: null };
  }
  if (typeof v !== 'object') return null;
  const name = v.name ?? v.label ?? v.player ?? v.team ?? v.title ?? key ?? '';
  if (!String(name).trim()) return null;
  const raw = v.value ?? v.score ?? v.points ?? v.amount ?? v.total ?? v.count ?? 0;
  const delta = v.deltaPct ?? v.delta ?? v.change ?? null;
  return {
    name: String(name),
    value: Number(raw) || 0,
    note: String(v.note ?? v.subtitle ?? v.detail ?? v.unit ?? ''),
    avatar: String(v.avatar ?? v.image ?? v.photo ?? ''),
    deltaPct: delta == null || delta === '' ? null : Number(delta),
  };
}

export function normalizeLeaderboard(raw) {
  if (Array.isArray(raw)) return raw.map(r => normalizeRow(r)).filter(Boolean);
  if (raw && typeof raw === 'object') {
    for (const k of ['rows', 'items', 'entries', 'data', 'results', 'leaderboard']) {
      if (Array.isArray(raw[k])) return raw[k].map(r => normalizeRow(r)).filter(Boolean);
    }
    return Object.entries(raw).map(([k, v]) => normalizeRow(v, k)).filter(Boolean);
  }
  return [];
}

export default register({
  type: 'leaderboard',
  label: 'Leaderboard',
  group: 'data',
  icon: '🏆',
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(),
    heading: 'Top performers',
    subheading: 'This month',
    rows: [
      { name: 'Nordic Team',   value: 128400, note: '42 deals',  deltaPct: 8.4 },
      { name: 'Alpine Team',   value: 117950, note: '38 deals',  deltaPct: 3.1 },
      { name: 'Atlantic Team', value: 96200,  note: '31 deals',  deltaPct: -2.6 },
      { name: 'Baltic Team',   value: 74800,  note: '25 deals',  deltaPct: 1.2 },
      { name: 'Adria Team',    value: 61300,  note: '19 deals',  deltaPct: 5.0 },
    ],
    source: 'inline',
    dataUrl: '',
    refreshSec: 300,
    sortOrder: 'desc',
    maxRows: 8,
    unit: '€',
    unitPosition: 'after',
    numberFormat: 'compact',
    locale: '',
    showRank: true,
    medals: true,
    showBars: true,
    showDelta: true,
    showAvatars: false,
    highlightName: '',
    podium: false,
    textScale: 100,
    theme: 'corporate-blue',
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'heading', type: 'text', label: 'Heading', placeholder: 'Top performers' },
      { key: 'subheading', type: 'text', label: 'Subheading', placeholder: 'This month' },
      { key: 'rows', type: 'table', label: 'Entries',
        showIf: c => (c.source ?? 'inline') === 'inline',
        help: 'Rank is derived from the value — you never renumber by hand. Δ % is optional and shows a green/red arrow beside the value.',
        validate: (v) => {
          const arr = Array.isArray(v) ? v : [];
          if (!arr.length) return { level: 'warn', message: 'The leaderboard is empty — add at least one entry.' };
          return null;
        },
        columns: [
          { key: 'name',     label: 'Name' },
          { key: 'value',    label: 'Value', type: 'number' },
          { key: 'note',     label: 'Note', placeholder: '42 deals' },
          { key: 'deltaPct', label: 'Δ %', type: 'number', placeholder: 'optional' },
          { key: 'avatar',   label: 'Photo', type: 'asset', accept: 'image/*', placeholder: 'https://… (optional)' },
        ] },

      { type: 'section', key: 'data', label: 'Data',
        summary: c => ((c.source ?? 'inline') === 'inline' ? 'Typed in' : 'Remote JSON') },
      ...remoteJsonFields({
        placeholder: 'https://api.example.com/leaderboard.json',
        urlHelp: 'Returns an array of { "name": …, "value": … } (optionally note / deltaPct / avatar), '
          + 'an object with a rows/items/entries array, or a flat { "Alice": 42 } map.',
      }),
      { key: 'sortOrder', type: 'select', label: 'Ranking', buttons: true, options: [
        { value: 'desc', label: 'High → low' },
        { value: 'asc',  label: 'Low → high' },
        { value: 'none', label: 'Keep order' },
      ], help: 'Low → high ranks fastest-lap / lowest-cost boards. Keep order trusts the source to be pre-ranked.' },
      { key: 'maxRows', type: 'number', label: 'Entries shown', min: 1, max: 20, step: 1 },

      { type: 'section', key: 'values', label: 'Values',
        summary: c => `${c.numberFormat ?? 'compact'}${c.unit ? ' · ' + c.unit : ''}` },
      { type: 'row', children: [
        { key: 'unit', type: 'text', label: 'Unit', placeholder: '€, pts, km…' },
        { key: 'unitPosition', type: 'select', label: 'Unit position', buttons: true, options: [
          { value: 'after',  label: 'After' },
          { value: 'before', label: 'Before' },
        ] },
      ] },
      { key: 'numberFormat', type: 'select', label: 'Number format', buttons: true, options: [
        { value: 'compact',  label: 'Compact' },
        { value: 'standard', label: 'Full' },
        { value: 'integer',  label: 'Integer' },
      ] },
      { ...localeField(), tier: 'advanced' },

      { type: 'section', key: 'appearance', label: 'Appearance',
        summary: c => [c.medals && 'medals', c.showBars && 'bars', c.podium && 'podium'].filter(Boolean).join(' · ') || 'plain' },
      { key: 'podium', type: 'toggle', label: 'Podium for the top three',
        help: 'Lifts ranks 1–3 into a podium row above the list. Best on a tall tile; on a short one keep it off.' },
      { key: 'showRank', type: 'toggle', label: 'Show rank numbers' },
      { key: 'medals', type: 'toggle', label: 'Medals for the top three' },
      { key: 'showBars', type: 'toggle', label: 'Comparison bars',
        help: 'A bar per row, scaled against the leader — the difference between a list and a leaderboard.' },
      { key: 'showDelta', type: 'toggle', label: 'Show Δ % arrows' },
      { key: 'showAvatars', type: 'toggle', label: 'Show photos', tier: 'advanced' },
      { key: 'highlightName', type: 'text', label: 'Highlight entry', tier: 'advanced',
        placeholder: 'e.g. Alpine Team',
        help: 'Case-insensitive match. The matching row is tinted with the accent colour — the “that’s us” row on a shared wall.' },
      { ...textScaleField(), tier: 'advanced' },

      ...themeColorSection(),
    ],
  }),
  looks: () => [
    { id: 'sales-wall', name: 'Sales wall', patch: { showBars: true, showDelta: true, medals: true, podium: false, numberFormat: 'compact', theme: 'corporate-blue' } },
    { id: 'podium', name: 'Podium', patch: { podium: true, maxRows: 6, showBars: true, medals: true } },
    { id: 'clean-list', name: 'Clean list', patch: { showBars: false, showDelta: false, medals: false, showRank: true, theme: 'minimal-dark' } },
    { id: 'club-board', name: 'Club board', patch: { podium: true, showAvatars: true, medals: true, showDelta: false, theme: 'gradient-purple' } },
    { id: 'fastest-first', name: 'Lowest wins', patch: { sortOrder: 'asc', showBars: false, medals: true, numberFormat: 'standard' } },
  ],
  render(slide, container, ctx = {}) {
    const c = slide.content ?? {};
    const locale = safeLocale(c.locale);

    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-leaderboard bb-theme-${c.theme ?? 'corporate-blue'}`;
    root.style.cssText += 'container-type:size;width:100%;height:100%;background:transparent;'
      + 'display:flex;flex-direction:column;gap:clamp(4px,1.2cqmin,16px);padding:clamp(8px,2.4cqmin,32px);box-sizing:border-box;';
    root.style.setProperty('--bb-lb-scale', String((Number(c.textScale) || 100) / 100));

    const headFont = 'calc(min(5.2cqw, 9cqh) * var(--bb-lb-scale, 1))';
    const subFont = 'calc(min(3cqw, 5cqh) * var(--bb-lb-scale, 1))';

    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1" style="margin:0;">${escapeHtml(slide.title)}</h1>` : ''}
      <header class="bb-lb-head" data-field="heading subheading" style="flex:0 0 auto;">
        <div class="bb-lb-heading" style="font:800 ${headFont}/1.15 var(--bb-display,'Inter Tight',Inter,sans-serif);letter-spacing:-.01em;"></div>
        <div class="bb-lb-sub" style="font:600 ${subFont}/1.3 var(--bb-st-font,Inter,system-ui,sans-serif);color:var(--bb-st-accent);letter-spacing:.06em;text-transform:uppercase;"></div>
      </header>
      <div class="bb-lb-podium" data-field="podium" style="display:none;flex:0 0 auto;"></div>
      <div class="bb-lb-list" data-field="rows sortOrder maxRows showBars medals showRank"
           style="flex:1;min-height:0;display:flex;flex-direction:column;gap:clamp(3px,.9cqmin,10px);justify-content:center;"></div>`;

    const headingEl = root.querySelector('.bb-lb-heading');
    const subEl = root.querySelector('.bb-lb-sub');
    const podiumEl = root.querySelector('.bb-lb-podium');
    const listEl = root.querySelector('.bb-lb-list');

    headingEl.textContent = c.heading ?? '';
    headingEl.style.display = c.heading ? '' : 'none';
    subEl.textContent = c.subheading ?? '';
    subEl.style.display = c.subheading ? '' : 'none';

    const fmtValue = (n) => {
      const body = c.numberFormat === 'compact'
        ? formatCompact(n, locale)
        : formatNumber(n, locale, c.numberFormat === 'integer' ? { maximumFractionDigits: 0 } : {});
      const unit = String(c.unit ?? '').trim();
      if (!unit) return body;
      return c.unitPosition === 'before' ? `${unit}${body}` : `${body} ${unit}`;
    };

    const highlight = String(c.highlightName ?? '').trim().toLowerCase();
    const isHi = (name) => !!highlight && String(name).toLowerCase().includes(highlight);

    const paint = (rows) => {
      let list = rows.filter(r => r && String(r.name ?? '').trim());
      const order = c.sortOrder ?? 'desc';
      if (order === 'desc') list = [...list].sort((a, b) => b.value - a.value);
      else if (order === 'asc') list = [...list].sort((a, b) => a.value - b.value);
      const cap = Math.max(1, Math.min(20, Number(c.maxRows) || 8));
      list = list.slice(0, cap);

      podiumEl.replaceChildren();
      listEl.replaceChildren();
      if (!list.length) {
        const empty = document.createElement('div');
        empty.style.cssText = `font:500 ${subFont}/1.4 var(--bb-st-font,Inter,system-ui,sans-serif);opacity:.55;text-align:center;`;
        empty.textContent = '—';
        listEl.appendChild(empty);
        return;
      }

      // Bars compare against the best value in view; a low-wins board inverts
      // the bar so the leader is still the longest one.
      const values = list.map(r => Math.abs(r.value));
      const peak = Math.max(...values, 1);
      const floor = Math.min(...values);
      const barFrac = (v) => {
        if (order === 'asc') return floor > 0 ? Math.max(.08, floor / Math.max(Math.abs(v), 1e-9)) : .5;
        return Math.max(.05, Math.abs(v) / peak);
      };

      const usePodium = !!c.podium && list.length >= 3;
      const podium = usePodium ? list.slice(0, 3) : [];
      const rest = usePodium ? list.slice(3) : list;

      if (usePodium) {
        podiumEl.style.display = 'grid';
        podiumEl.style.cssText += 'grid-template-columns:1fr 1.15fr 1fr;gap:clamp(4px,1.2cqmin,16px);align-items:end;margin-bottom:clamp(4px,1.2cqmin,14px);';
        // Visual order 2 · 1 · 3 — the winner in the middle, as on a real podium.
        const cols = [[podium[1], 2, .82], [podium[0], 1, 1], [podium[2], 3, .72]];
        for (const [row, rank, h] of cols) {
          const cell = document.createElement('div');
          cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;text-align:center;gap:.15em;'
            + `border-radius:clamp(8px,1.8cqmin,18px);padding:clamp(4px,1.4cqmin,18px) clamp(4px,1cqmin,12px);`
            + `background:color-mix(in srgb, var(--bb-st-accent) ${rank === 1 ? 22 : 10}%, transparent);`
            + `min-height:calc(${h} * min(24cqh, 24cqh));justify-content:flex-end;`;
          if (isHi(row.name)) cell.style.outline = '2px solid var(--bb-st-accent)';
          const medal = document.createElement('div');
          medal.style.cssText = `font-size:calc(min(5cqw,9cqh) * var(--bb-lb-scale,1));line-height:1;`;
          medal.textContent = c.medals ? MEDALS[rank - 1] : `#${rank}`;
          const nm = document.createElement('div');
          nm.style.cssText = `font:700 calc(min(3.2cqw,5.4cqh) * var(--bb-lb-scale,1))/1.2 var(--bb-st-font,Inter,system-ui,sans-serif);`;
          nm.textContent = row.name;
          const val = document.createElement('div');
          val.style.cssText = `font:800 calc(min(${rank === 1 ? 4.6 : 3.8}cqw,${rank === 1 ? 8 : 6.4}cqh) * var(--bb-lb-scale,1))/1.1 var(--bb-display,'Inter Tight',Inter,sans-serif);color:var(--bb-st-accent);`;
          val.textContent = fmtValue(row.value);
          cell.append(medal, nm, val);
          podiumEl.appendChild(cell);
        }
      } else {
        podiumEl.style.display = 'none';
      }

      const rowFont = `calc(min(3.4cqw, ${Math.max(3.2, 42 / Math.max(rest.length, 1))}cqh) * var(--bb-lb-scale, 1))`;
      rest.forEach((r, i) => {
        const rank = (usePodium ? 4 : 1) + i;
        const el = document.createElement('div');
        el.style.cssText = 'position:relative;display:flex;align-items:center;gap:clamp(4px,1.2cqmin,14px);'
          + 'border-radius:clamp(6px,1.4cqmin,14px);padding:clamp(3px,.9cqmin,12px) clamp(6px,1.6cqmin,18px);overflow:hidden;'
          + `background:color-mix(in srgb, currentColor ${isHi(r.name) ? 0 : 7}%, transparent);`;
        if (isHi(r.name)) {
          el.style.background = 'color-mix(in srgb, var(--bb-st-accent) 20%, transparent)';
          el.style.outline = '1px solid color-mix(in srgb, var(--bb-st-accent) 60%, transparent)';
        }

        if (c.showBars) {
          const bar = document.createElement('div');
          bar.setAttribute('aria-hidden', 'true');
          bar.style.cssText = `position:absolute;inset:0 auto 0 0;width:${(barFrac(r.value) * 100).toFixed(1)}%;`
            + 'background:color-mix(in srgb, var(--bb-st-accent) 24%, transparent);border-radius:inherit;';
          el.appendChild(bar);
        }

        const badge = document.createElement('span');
        badge.style.cssText = `position:relative;flex:0 0 auto;min-width:1.8em;text-align:center;font:800 ${rowFont}/1.2 var(--bb-display,'Inter Tight',Inter,sans-serif);opacity:${rank <= 3 && c.medals ? 1 : .6};`;
        badge.textContent = (c.medals && rank <= 3) ? MEDALS[rank - 1] : (c.showRank ? String(rank) : '');
        if (badge.textContent) el.appendChild(badge);

        if (c.showAvatars && isSafeImgUrl(r.avatar)) {
          const img = document.createElement('img');
          img.src = r.avatar;
          img.alt = '';
          img.loading = 'lazy';
          img.style.cssText = 'position:relative;flex:0 0 auto;width:2.1em;height:2.1em;border-radius:50%;object-fit:cover;'
            + `font-size:${rowFont};`;
          el.appendChild(img);
        }

        const nameBox = document.createElement('div');
        nameBox.style.cssText = 'position:relative;flex:1;min-width:0;display:flex;flex-direction:column;';
        const nm = document.createElement('span');
        nm.style.cssText = `font:700 ${rowFont}/1.2 var(--bb-st-font,Inter,system-ui,sans-serif);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
        nm.textContent = r.name;
        nameBox.appendChild(nm);
        if (r.note) {
          const nt = document.createElement('span');
          nt.style.cssText = `font:500 calc(${rowFont} * .62)/1.25 var(--bb-st-font,Inter,system-ui,sans-serif);opacity:.62;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
          nt.textContent = r.note;
          nameBox.appendChild(nt);
        }
        el.appendChild(nameBox);

        if (c.showDelta && r.deltaPct != null && Number.isFinite(r.deltaPct)) {
          const d = document.createElement('span');
          const up = r.deltaPct >= 0;
          d.style.cssText = `position:relative;flex:0 0 auto;font:600 calc(${rowFont} * .68)/1.2 var(--bb-st-font,Inter,system-ui,sans-serif);`
            + `color:${up ? STATUS_COLORS.good : STATUS_COLORS.bad};`;
          d.textContent = `${up ? '▲' : '▼'} ${Math.abs(r.deltaPct).toFixed(1)} %`;
          el.appendChild(d);
        }

        const val = document.createElement('span');
        val.style.cssText = `position:relative;flex:0 0 auto;font:800 ${rowFont}/1.2 var(--bb-display,'Inter Tight',Inter,sans-serif);color:var(--bb-st-accent);font-variant-numeric:tabular-nums;`;
        val.textContent = fmtValue(r.value);
        el.appendChild(val);

        listEl.appendChild(el);
      });
    };

    const inlineRows = () => (Array.isArray(c.rows) ? c.rows : []).map(r => normalizeRow(r)).filter(Boolean);
    paint(inlineRows());

    const source = c.source ?? 'inline';
    if (source === 'inline') {
      container.appendChild(root);
      return composeDispose(() => root.remove());
    }
    const stop = liveSource({
      url: String(c.dataUrl ?? '').trim(),
      signal: ctx.signal,
      intervalMs: source === 'url' ? refreshIntervalMs(c.refreshSec) : 0,
      ...offlineLiveOpts(c),
      onData: data => paint(normalizeLeaderboard(data)),
      onError: (e, info) => { if (info?.gaveUp) ctx.onError?.(e); },
    });
    container.appendChild(root);
    return composeDispose(() => { stop(); root.remove(); });
  },
});
