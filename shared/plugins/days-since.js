import { register } from './registry.js';
import { textScaleField } from '../text-scale.js';
import { colorOverrideDefaults, applyColorOverrides, themeColorSection } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';
import { localeField } from '../locale-field.js';
import { defaultTz } from '../utils/default-tz.js';
import { STATUS_COLORS } from '../status-colors.js';

// Audience-language connective words the player renders around the counter.
// Unit labels ("day"/"days") come from Intl plural rules, but Intl has no API
// for "since"/"Record"/"Milestone", so this small map covers the prefix-friendly
// languages of LOCALE_OPTIONS; anything else falls back to English (suffix-based
// languages like Turkish or Japanese can't take a leading "since" anyway).
const WORDS = {
  en: { since: 'since',  record: 'Record',  milestone: 'Milestone' },
  de: { since: 'seit',   record: 'Rekord',  milestone: 'Meilenstein' },
  fr: { since: 'depuis', record: 'Record',  milestone: 'Jalon' },
  it: { since: 'dal',    record: 'Record',  milestone: 'Traguardo' },
  es: { since: 'desde',  record: 'Récord',  milestone: 'Hito' },
  nl: { since: 'sinds',  record: 'Record',  milestone: 'Mijlpaal' },
  pl: { since: 'od',     record: 'Rekord',  milestone: 'Kamień milowy' },
  cs: { since: 'od',     record: 'Rekord',  milestone: 'Milník' },
  da: { since: 'siden',  record: 'Rekord',  milestone: 'Milepæl' },
  sv: { since: 'sedan',  record: 'Rekord',  milestone: 'Milstolpe' },
  no: { since: 'siden',  record: 'Rekord',  milestone: 'Milepæl' },
  pt: { since: 'desde',  record: 'Recorde', milestone: 'Marco' },
};

function wordsFor(locale) {
  const tag = String(locale || (typeof navigator !== 'undefined' && navigator.language) || 'en');
  return WORDS[tag.toLowerCase().split('-')[0]] ?? WORDS.en;
}

// The calendar day (as a UTC-midnight timestamp) that the instant `ms` falls
// on IN THE GIVEN TIMEZONE. en-CA formats as YYYY-MM-DD, so the parse is
// trivial. Diffing two of these is an exact multiple of 86400000 — no DST
// rounding needed, because both ends are real UTC midnights.
function calendarDayUTC(ms, tz) {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ms));
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export default register({
  type: 'days-since',
  label: 'Days Since',
  group: 'live',
  icon: '🧮',
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(),
    since: { at: Date.now() - 30 * 86400000, tz: defaultTz() },
    heading: 'Days without incident',
    showDate: true,
    locale: '',
    unitSingular: '',
    unitPlural: '',
    recordDays: 0,
    milestoneEvery: 0,
    goodAbove: 0,
    goodColor: '',
    textScale: 100,
    theme: 'industrial-steel',
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'counter', label: 'Counter' },
      { key: 'heading', type: 'text', label: 'Heading', placeholder: 'e.g. Days without incident' },
      { key: 'since', type: 'datetime', label: 'Counting since',
        validate: (v) => {
          const at = (v && typeof v === 'object') ? v.at : null;
          return at != null && at > Date.now()
            ? { level: 'warn', message: 'Start date is in the future — the counter shows 0.' }
            : null;
        } },
      { key: 'showDate', type: 'toggle', label: 'Show the start date',
        help: 'Shows “since 12 May 2026” in the audience language under the counter.' },
      { type: 'row', children: [
        { key: 'unitSingular', type: 'text', label: 'Unit (singular)', placeholder: 'day' },
        { key: 'unitPlural', type: 'text', label: 'Unit (plural)', placeholder: 'days',
          help: 'Leave empty for the automatic, language-aware “day” / “days” — or repurpose the counter with your own unit (“shifts”, “deliveries”).' },
      ] },
      localeField(),

      { type: 'section', key: 'milestones', label: 'Milestones & status', collapsed: true,
        summary: (c) => {
          const on = [
            (Number(c.recordDays) || 0) > 0 && 'record',
            (Number(c.milestoneEvery) || 0) > 0 && 'milestones',
            (Number(c.goodAbove) || 0) > 0 && 'status colour',
          ].filter(Boolean);
          return on.join(' · ') || 'off';
        } },
      { key: 'recordDays', type: 'number', label: 'Record (0 = hidden)', min: 0, step: 1, suffix: ' days',
        help: 'Best streak so far — shown as a secondary line and highlighted once the current streak beats it.' },
      { key: 'milestoneEvery', type: 'number', label: 'Milestone every (0 = off)', min: 0, step: 1, suffix: ' days',
        help: 'Celebrates round numbers: on every Nth day the counter shows a milestone badge.' },
      { key: 'goodAbove', type: 'number', label: 'Good above (0 = off)', min: 0, step: 1, suffix: ' days',
        help: 'Once the streak reaches this many days, the count switches to the good colour — classic safety-board signalling.' },
      { key: 'goodColor', type: 'color', label: 'Good colour', clearable: true,
        showIf: c => (Number(c.goodAbove) || 0) > 0,
        help: 'Leave empty for the standard green.' },

      { type: 'section', key: 'appearance', label: 'Appearance',
        summary: c => `${c.textScale ?? 100}%` },
      textScaleField(),

      ...themeColorSection(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const at = (c.since && typeof c.since === 'object') ? c.since.at : null;
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-dayssince bb-theme-${c.theme ?? 'industrial-steel'}`;
    root.style.cssText += 'container-type:size;width:100%;height:100%;background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.2em;';
    root.style.setProperty('--bb-ds-text-scale', String((c.textScale ?? 100) / 100));

    if (at == null) {
      root.innerHTML = `
        ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
        <div class="bb-ds-empty">Set a start date.</div>`;
      container.appendChild(root);
      return composeDispose(() => root.remove());
    }

    const locale = c.locale || undefined;
    const words = wordsFor(c.locale);
    const recordDays = Math.max(0, Number(c.recordDays) || 0);

    // Custom unit labels beat the Intl default; either field alone covers both
    // forms ("shifts" works as singular AND plural for most repurposings).
    const unitLabel = (n) => {
      const sing = String(c.unitSingular ?? '').trim();
      const plur = String(c.unitPlural ?? '').trim();
      if (sing || plur) return n === 1 ? (sing || plur) : (plur || sing);
      try {
        return new Intl.NumberFormat(locale, { style: 'unit', unit: 'day', unitDisplay: 'long' })
          .formatToParts(n).filter(p => p.type === 'unit').map(p => p.value).join('').trim();
      } catch { return n === 1 ? 'day' : 'days'; }
    };

    // New secondary lines size via cq units * the text-scale var inline, so
    // they need no stylesheet additions and track the tile like the rest.
    const subFont = 'calc(min(5cqw, 7cqh) * var(--bb-ds-text-scale, 1))';
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      ${c.heading ? `<div class="bb-ds-heading">${escapeHtml(c.heading)}</div>` : ''}
      <div class="bb-ds-count">—</div>
      <div class="bb-ds-unit"></div>
      <div class="bb-ds-milestone" style="display:none;font:700 calc(min(4.5cqw,6.5cqh) * var(--bb-ds-text-scale,1))/1.2 var(--bb-st-font,Inter,sans-serif);color:var(--bb-st-accent);background:color-mix(in srgb, var(--bb-st-accent) 16%, transparent);border-radius:999px;padding:.25em .9em;margin-top:.3em;"></div>
      ${recordDays > 0 ? `<div class="bb-ds-record" style="font-size:${subFont};opacity:.75;margin-top:.3em;"></div>` : ''}
      ${c.showDate ? `<div class="bb-ds-date"></div>` : ''}`;

    const countEl = root.querySelector('.bb-ds-count');
    const unitEl = root.querySelector('.bb-ds-unit');
    const badgeEl = root.querySelector('.bb-ds-milestone');
    const recordEl = root.querySelector('.bb-ds-record');
    const dateEl = root.querySelector('.bb-ds-date');

    const tick = () => {
      // Count whole CALENDAR days (midnight → midnight) in the timezone the
      // user picked on the start date — NOT the player device's zone, so a
      // Berlin safety board driven from a UTC player still flips at Berlin
      // midnight. calendarDayUTC maps both instants to UTC midnights of their
      // tz-local dates, so the diff is an exact day multiple (DST-proof). The
      // local-midnight fallback covers a stored invalid/legacy tz string.
      const tz = (c.since && c.since.tz) || defaultTz();
      let days;
      try {
        days = Math.max(0, Math.round((calendarDayUTC(Date.now(), tz) - calendarDayUTC(at, tz)) / 86400000));
      } catch {
        const start = new Date(at); start.setHours(0, 0, 0, 0);
        const today = new Date();   today.setHours(0, 0, 0, 0);
        days = Math.max(0, Math.round((today - start) / 86400000));
      }
      countEl.textContent = days.toLocaleString(locale);
      unitEl.textContent = unitLabel(days);

      // Threshold colour: status-board semantics — the count flips to the
      // good colour once the streak reaches N days. `||` (not ??) so the
      // cleared '' colour falls back to the shared traffic-light green.
      const goodAbove = Number(c.goodAbove) || 0;
      countEl.style.color = (goodAbove > 0 && days >= goodAbove) ? (c.goodColor || STATUS_COLORS.good) : '';

      // Milestone badge on every Nth day (day 0 never celebrates).
      const every = Number(c.milestoneEvery) || 0;
      const isMilestone = every > 0 && days > 0 && days % every === 0;
      badgeEl.style.display = isMilestone ? '' : 'none';
      if (isMilestone) badgeEl.textContent = `🎉 ${words.milestone}`;

      // Record line, accent-highlighted once the current streak beats it.
      if (recordEl) {
        recordEl.textContent = `${words.record}: ${recordDays.toLocaleString(locale)} ${unitLabel(recordDays)}`;
        const beaten = days > recordDays;
        recordEl.style.color = beaten ? 'var(--bb-st-accent)' : '';
        recordEl.style.fontWeight = beaten ? '700' : '';
        recordEl.style.opacity = beaten ? '1' : '.75';
      }

      if (dateEl) {
        let formatted;
        try {
          formatted = new Date(at).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric', timeZone: tz });
        } catch {
          formatted = new Date(at).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
        }
        dateEl.textContent = `${words.since} ${formatted}`;
      }
    };
    tick();
    const id = setInterval(tick, 60000);
    container.appendChild(root);
    return composeDispose(() => { clearInterval(id); root.remove(); });
  },
});
