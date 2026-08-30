import { register } from './registry.js';
import { textScaleField } from '../text-scale.js';
import { colorOverrideDefaults, applyColorOverrides, themeColorSection } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';
import { localeField, safeLocale } from '../locale-field.js';
import { defaultTz } from '../utils/default-tz.js';
import { STATUS_COLORS } from '../status-colors.js';

// Opening hours — the week table every shop, practice, salon, workshop, library
// and public office puts on its door, plus the one thing a printed sign can
// never do: say whether the place is open RIGHT NOW.
//
// clock.js already carries a tiny open/closed badge, but only for one uniform
// window across all seven days. Real hours have a Saturday that ends early, a
// Sunday that is closed, and a lunch break in the middle of Wednesday — which
// is exactly the shape stored here (two windows per day, per weekday).

// Weekday keys in ISO order (Monday first — the audience for this widget is
// European opening hours). Labels come from Intl in the audience language, so
// the widget never ships a hand-maintained translation table.
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
// 2024-01-01 was a Monday: index i is that weekday, in UTC, forever.
const DAY_SAMPLE = i => new Date(Date.UTC(2024, 0, 1 + i));

function dayLabels(locale, style) {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' });
  return DAY_KEYS.map((k, i) => fmt.format(DAY_SAMPLE(i)));
}

// "9:00" / "09:00" / "9.00" / "930" → minutes since midnight, or null.
export function parseHm(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\s*[:.]?\s*(\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] == null ? 0 : Number(m[2]);
  if (!(h >= 0 && h <= 24) || !(min >= 0 && min < 60)) return null;
  return h * 60 + min;
}

const fmtHm = (mins, locale, hour12) => {
  const d = new Date(Date.UTC(2024, 0, 1, Math.floor(mins / 60) % 24, mins % 60));
  try {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12, timeZone: 'UTC' }).format(d);
  } catch {
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
};

// The two possible windows of one stored day row, normalised and ordered.
function windowsOf(row) {
  if (!row || row.closed) return [];
  const out = [];
  for (const [a, b] of [['from', 'to'], ['from2', 'to2']]) {
    const s = parseHm(row[a]);
    const e = parseHm(row[b]);
    if (s == null || e == null || e <= s) continue;
    out.push([s, e]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

// Weekday index (0 = Monday) and minutes-since-midnight for `now` in `tz`.
// Derived from Intl parts, not from the device clock, so a Berlin shop board
// driven by a player in another zone still flips at Berlin times.
function localNow(now, tz) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now);
  } catch {
    const d = new Date(now);
    return { day: (d.getDay() + 6) % 7, mins: d.getHours() * 60 + d.getMinutes() };
  }
  const get = t => parts.find(p => p.type === t)?.value ?? '';
  const order = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const day = order[get('weekday')] ?? 0;
  // A midnight hour is reported as "24" by some ICU builds — fold it back to 0.
  const hour = Number(get('hour')) % 24;
  return { day, mins: hour * 60 + Number(get('minute')) };
}

// Open now? Plus the next transition, so the widget can say "closes 18:00" or
// "opens tomorrow 09:00" instead of a bare red dot.
export function openState(rows, day, mins) {
  const at = i => windowsOf(rows[((i % 7) + 7) % 7]);
  for (const [s, e] of at(day)) {
    if (mins >= s && mins < e) return { open: true, changeDay: 0, changeAt: e };
    if (mins < s) return { open: false, changeDay: 0, changeAt: s };
  }
  for (let ahead = 1; ahead <= 7; ahead++) {
    const w = at(day + ahead);
    if (w.length) return { open: false, changeDay: ahead, changeAt: w[0][0] };
  }
  return { open: false, changeDay: null, changeAt: null };
}

export default register({
  type: 'opening-hours',
  label: 'Opening Hours',
  group: 'live',
  icon: '🕘',
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(),
    heading: 'Opening hours',
    days: [
      { day: 'mon', from: '09:00', to: '18:00', from2: '', to2: '', closed: false },
      { day: 'tue', from: '09:00', to: '18:00', from2: '', to2: '', closed: false },
      { day: 'wed', from: '09:00', to: '13:00', from2: '15:00', to2: '18:00', closed: false },
      { day: 'thu', from: '09:00', to: '18:00', from2: '', to2: '', closed: false },
      { day: 'fri', from: '09:00', to: '20:00', from2: '', to2: '', closed: false },
      { day: 'sat', from: '10:00', to: '16:00', from2: '', to2: '', closed: false },
      { day: 'sun', from: '', to: '', from2: '', to2: '', closed: true },
    ],
    timezone: defaultTz(),
    locale: '',
    hour12: false,
    dayStyle: 'short',
    layout: 'list',
    showStatus: true,
    highlightToday: true,
    closedText: 'Closed',
    openLabel: 'Open now',
    closedLabel: 'Closed',
    note: '',
    textScale: 100,
    theme: 'minimal-dark',
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'heading', type: 'text', label: 'Heading', placeholder: 'Opening hours' },
      { key: 'days', type: 'table', label: 'Week',
        help: 'One row per weekday, Monday first. Leave the second window empty unless the day has a break (e.g. 09:00–13:00 and 15:00–18:00). Tick “Closed” for a rest day.',
        columns: [
          { key: 'day',    label: 'Day', placeholder: 'mon' },
          { key: 'from',   label: 'From', placeholder: '09:00' },
          { key: 'to',     label: 'To', placeholder: '18:00' },
          { key: 'from2',  label: 'From (2nd)', placeholder: 'optional' },
          { key: 'to2',    label: 'To (2nd)', placeholder: 'optional' },
          { key: 'closed', label: 'Closed', type: 'toggle' },
        ] },
      { key: 'note', type: 'text', label: 'Note', placeholder: 'Public holidays closed' },

      { type: 'section', key: 'status', label: 'Open / closed',
        summary: c => (c.showStatus ? 'live status' : 'table only') },
      { key: 'showStatus', type: 'toggle', label: 'Show the live status badge',
        help: 'A green “Open now · closes 18:00” or grey “Closed · opens tomorrow 09:00”, re-evaluated every minute.' },
      { type: 'row', children: [
        { key: 'openLabel', type: 'text', label: 'Open wording', placeholder: 'Open now', tier: 'advanced' },
        { key: 'closedLabel', type: 'text', label: 'Closed wording', placeholder: 'Closed', tier: 'advanced' },
      ] },
      { key: 'timezone', type: 'timezone', label: 'Timezone',
        help: 'The shop’s own timezone — the status flips at the shop’s clock, not the player device’s.' },

      { type: 'section', key: 'appearance', label: 'Appearance',
        summary: c => `${c.layout ?? 'list'} · ${c.dayStyle ?? 'short'}` },
      { key: 'layout', type: 'select', label: 'Arrangement', buttons: true, options: [
        { value: 'list', label: 'List' },
        { value: 'grid', label: 'Grid' },
      ], help: 'List: one row per day, name left, hours right. Grid: seven columns — good on a wide banner tile.' },
      { key: 'dayStyle', type: 'select', label: 'Day names', buttons: true, options: [
        { value: 'short',  label: 'Mon' },
        { value: 'long',   label: 'Monday' },
        { value: 'narrow', label: 'M' },
      ] },
      { key: 'highlightToday', type: 'toggle', label: 'Highlight today' },
      { key: 'closedText', type: 'text', label: 'Wording for a closed day', placeholder: 'Closed', tier: 'advanced' },
      { key: 'hour12', type: 'toggle', label: '12-hour clock', tier: 'advanced' },
      { ...localeField(), tier: 'advanced' },
      { ...textScaleField(), tier: 'advanced' },

      ...themeColorSection(),
    ],
  }),
  looks: () => [
    { id: 'door-sign', name: 'Door sign', patch: { layout: 'list', dayStyle: 'long', showStatus: true, highlightToday: true } },
    { id: 'wide-banner', name: 'Wide banner', patch: { layout: 'grid', dayStyle: 'short', showStatus: true, textScale: 110 } },
    { id: 'table-only', name: 'Table only', patch: { showStatus: false, highlightToday: false, layout: 'list' } },
    { id: 'compact', name: 'Compact', patch: { layout: 'grid', dayStyle: 'narrow', showStatus: false, textScale: 90 } },
    { id: 'reception', name: 'Reception', patch: { layout: 'list', dayStyle: 'short', showStatus: true, theme: 'corporate-blue' } },
  ],
  render(slide, container) {
    const c = slide.content ?? {};
    const locale = safeLocale(c.locale);
    const tz = String(c.timezone ?? '').trim() || defaultTz();
    const layout = c.layout === 'grid' ? 'grid' : 'list';

    // Normalise the stored table into exactly seven Monday-first rows, so a
    // half-filled or re-ordered table can never shift a day's hours onto the
    // wrong weekday.
    const stored = Array.isArray(c.days) ? c.days : [];
    const rows = DAY_KEYS.map((k, i) =>
      stored.find(r => String(r?.day ?? '').trim().toLowerCase().startsWith(k)) ?? stored[i] ?? { day: k, closed: true });

    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-hours bb-theme-${c.theme ?? 'minimal-dark'}`;
    root.style.cssText += 'container-type:size;width:100%;height:100%;background:transparent;'
      + 'display:flex;flex-direction:column;gap:clamp(4px,1.2cqmin,16px);padding:clamp(8px,2.4cqmin,32px);box-sizing:border-box;justify-content:center;';
    root.style.setProperty('--bb-oh-scale', String((Number(c.textScale) || 100) / 100));

    const headFont = 'calc(min(4.6cqw, 8cqh) * var(--bb-oh-scale, 1))';
    const rowFont = `calc(min(${layout === 'grid' ? 2.6 : 3.4}cqw, ${layout === 'grid' ? 8 : 7}cqh) * var(--bb-oh-scale, 1))`;
    const noteFont = 'calc(min(2.6cqw, 4.4cqh) * var(--bb-oh-scale, 1))';

    // The table is `flex: 0 0 auto` — it must NOT shrink. As a shrinkable
    // item its BOX got smaller while its rows stayed the size they were, so
    // the last day of the week spilled out of the box and printed straight
    // through the note underneath it: "Sunday 11:30-15:00" and "Kitchen
    // closes 30 minutes before we do" on the same line. Refusing to shrink
    // turns that into an honest overflow, which the legibility suite catches.
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1" style="margin:0;">${escapeHtml(slide.title)}</h1>` : ''}
      <header style="flex:0 0 auto;display:flex;align-items:baseline;justify-content:space-between;gap:1em;flex-wrap:wrap;">
        <div class="bb-oh-heading" data-field="heading" style="font:800 ${headFont}/1.15 var(--bb-display,'Inter Tight',Inter,sans-serif);letter-spacing:-.01em;"></div>
        <div class="bb-oh-status" data-field="showStatus openLabel closedLabel timezone"
             style="font:700 ${noteFont}/1.2 var(--bb-st-font,Inter,system-ui,sans-serif);border-radius:999px;padding:.35em 1em;white-space:nowrap;"></div>
      </header>
      <div class="bb-oh-table" data-field="days layout dayStyle highlightToday" style="flex:0 0 auto;"></div>
      <div class="bb-oh-note" data-field="note" style="font:500 ${noteFont}/1.35 var(--bb-st-font,Inter,system-ui,sans-serif);opacity:.6;"></div>`;

    const headingEl = root.querySelector('.bb-oh-heading');
    const statusEl = root.querySelector('.bb-oh-status');
    const tableEl = root.querySelector('.bb-oh-table');
    const noteEl = root.querySelector('.bb-oh-note');

    headingEl.textContent = c.heading ?? '';
    headingEl.style.display = c.heading ? '' : 'none';
    noteEl.textContent = c.note ?? '';
    noteEl.style.display = c.note ? '' : 'none';
    statusEl.style.display = c.showStatus ? '' : 'none';

    const labels = (() => {
      try { return dayLabels(locale, c.dayStyle === 'long' ? 'long' : c.dayStyle === 'narrow' ? 'narrow' : 'short'); }
      catch { return DAY_KEYS.map(k => k[0].toUpperCase() + k.slice(1)); }
    })();
    const closedWord = String(c.closedText ?? '').trim() || 'Closed';
    const hour12 = !!c.hour12;

    const hoursText = (i) => {
      const w = windowsOf(rows[i]);
      if (!w.length) return closedWord;
      return w.map(([s, e]) => `${fmtHm(s, locale, hour12)}–${fmtHm(e, locale, hour12)}`).join(layout === 'grid' ? '\n' : '  ·  ');
    };

    tableEl.style.cssText += layout === 'grid'
      ? 'display:grid;grid-template-columns:repeat(7,1fr);gap:clamp(3px,.9cqmin,12px);'
      : 'display:flex;flex-direction:column;gap:clamp(2px,.7cqmin,8px);';

    const cells = DAY_KEYS.map((_, i) => {
      const cell = document.createElement('div');
      const closed = !windowsOf(rows[i]).length;
      if (layout === 'grid') {
        cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:.25em;text-align:center;'
          + 'border-radius:clamp(6px,1.4cqmin,14px);padding:clamp(3px,1cqmin,14px) clamp(2px,.6cqmin,8px);'
          + 'background:color-mix(in srgb, currentColor 7%, transparent);';
        const d = document.createElement('div');
        d.style.cssText = `font:700 ${rowFont}/1.2 var(--bb-st-font,Inter,system-ui,sans-serif);color:var(--bb-st-accent);`;
        d.textContent = labels[i];
        const h = document.createElement('div');
        h.style.cssText = `font:500 calc(${rowFont} * .82)/1.35 var(--bb-st-font,Inter,system-ui,sans-serif);white-space:pre-line;font-variant-numeric:tabular-nums;opacity:${closed ? .45 : .95};`;
        h.textContent = hoursText(i);
        cell.append(d, h);
      } else {
        cell.style.cssText = 'display:flex;align-items:baseline;justify-content:space-between;gap:1em;'
          + 'border-radius:clamp(5px,1.2cqmin,12px);padding:clamp(2px,.8cqmin,10px) clamp(5px,1.4cqmin,16px);'
          + 'background:color-mix(in srgb, currentColor 6%, transparent);';
        const d = document.createElement('span');
        d.style.cssText = `font:700 ${rowFont}/1.3 var(--bb-st-font,Inter,system-ui,sans-serif);`;
        d.textContent = labels[i];
        const h = document.createElement('span');
        h.style.cssText = `font:500 ${rowFont}/1.3 var(--bb-st-font,Inter,system-ui,sans-serif);font-variant-numeric:tabular-nums;text-align:right;opacity:${closed ? .5 : 1};`;
        h.textContent = hoursText(i);
        cell.append(d, h);
      }
      tableEl.appendChild(cell);
      return cell;
    });

    const tick = () => {
      const { day, mins } = localNow(Date.now(), tz);
      if (c.highlightToday) cells.forEach((el, i) => {
        const on = i === day;
        el.style.background = on
          ? 'color-mix(in srgb, var(--bb-st-accent) 20%, transparent)'
          : 'color-mix(in srgb, currentColor 6%, transparent)';
        el.style.outline = on ? '1px solid color-mix(in srgb, var(--bb-st-accent) 55%, transparent)' : '';
      });
      if (!c.showStatus) return;
      const st = openState(rows, day, mins);
      const color = st.open ? STATUS_COLORS.good : STATUS_COLORS.bad;
      statusEl.style.color = color;
      statusEl.style.background = `color-mix(in srgb, ${color} 18%, transparent)`;
      const word = st.open
        ? (String(c.openLabel ?? '').trim() || 'Open now')
        : (String(c.closedLabel ?? '').trim() || 'Closed');
      // "Open now · until 18:00" / "Closed · from Mon 09:00". The day name is
      // only added when the change is NOT today — on the day itself it is
      // noise, and it is the difference between a door sign that is useful and
      // one that says "Closed" and stops there.
      let tail = '';
      if (st.changeAt != null) {
        const when = fmtHm(st.changeAt, locale, hour12);
        const dayName = st.changeDay === 0 ? '' : `${labels[(day + st.changeDay) % 7]} `;
        tail = ` · ${st.open ? '→' : '↻'} ${dayName}${when}`;
      }
      statusEl.textContent = `${st.open ? '●' : '○'} ${word}${tail}`;
    };
    tick();
    // Every 30 s, so a window that ends at :30 is never a full minute stale.
    const id = setInterval(tick, 30000);
    container.appendChild(root);
    return composeDispose(() => { clearInterval(id); root.remove(); });
  },
});
