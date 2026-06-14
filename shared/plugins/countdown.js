import { register } from './registry.js';
import { themeColorSection, colorOverrideDefaults, applyColorOverrides } from '../widget-color.js';
import { textScaleField } from '../text-scale.js';
import { localeField } from '../locale-field.js';
import { defaultTz } from '../utils/default-tz.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';

// Audience-language unit labels. The short map carries hand-picked
// abbreviations for the languages where Intl's "short" unit display reads
// clunky on signage (de: 'Std.' with a period, 'Tg.' for days); every other
// locale falls back to Intl.NumberFormat's unit part, then to English.
// Full-word style always asks Intl first so plurals come out right
// ('1 Tag' vs '2 Tage') without us shipping a plural-rules table.
const SHORT_UNIT_LABELS = {
  en: { d: 'days', h: 'hrs', m: 'min', s: 'sec' },
  de: { d: 'Tage', h: 'Std', m: 'Min', s: 'Sek' },
};
const INTL_UNITS = { d: 'day', h: 'hour', m: 'minute', s: 'second' };

function intlUnitLabel(k, count, locale, display) {
  try {
    const part = new Intl.NumberFormat(locale || undefined, { style: 'unit', unit: INTL_UNITS[k], unitDisplay: display })
      .formatToParts(count).find(p => p.type === 'unit');
    return part?.value || null;
  } catch { return null; } // exotic embedders without style:'unit' support
}

function unitLabel(k, count, locale, style) {
  if (style === 'hidden') return '';
  const lang = String(locale || (typeof navigator !== 'undefined' && navigator.language) || 'en')
    .split('-')[0].toLowerCase();
  if (style === 'full') {
    return intlUnitLabel(k, count, locale, 'long') ?? (SHORT_UNIT_LABELS[lang] ?? SHORT_UNIT_LABELS.en)[k];
  }
  return SHORT_UNIT_LABELS[lang]?.[k] ?? intlUnitLabel(k, count, locale, 'short') ?? SHORT_UNIT_LABELS.en[k];
}

// "Fri, 12 Jun 2026, 09:00" in the TARGET's timezone — the caption answers
// "counting down to WHEN exactly?", so it must show the instant as stored,
// not re-projected into the viewer's zone. Bad/missing tz → viewer zone.
function formatTarget(target, tz, locale) {
  const opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  try { return new Intl.DateTimeFormat(locale || undefined, { ...opts, timeZone: tz || undefined }).format(target); }
  catch { return new Intl.DateTimeFormat(locale || undefined, opts).format(target); }
}

const UNIT_KEYS = {
  days: ['d'],
  dh:   ['d', 'h'],
  dhm:  ['d', 'h', 'm'],
  hms:  ['h', 'm', 's'],
  dhms: ['d', 'h', 'm', 's'],
};

export default register({
  type: 'countdown',
  label: 'Countdown',
  group: 'live',
  icon: '⏳',
  schemaVersion: 2,
  defaults: () => ({ ...colorOverrideDefaults(),
    target: { at: Date.now() + 7 * 86_400_000, tz: defaultTz() },
    heading: 'Countdown to',
    theme: 'gradient-purple',
    expiredText: 'Now!',
    units: 'auto',
    unitStyle: 'short',
    locale: '',
    showTarget: false,
    textScale: 100,
    urgentBelow: 0,
    urgentColor: '',
    finishedMode: 'text',
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'heading', type: 'text', label: 'Heading', placeholder: 'e.g. Grand opening in' },
      { key: 'target',  type: 'datetime', label: 'Target date & time',
        validate: v => (v && typeof v === 'object' && v.at != null && v.at < Date.now())
          ? { level: 'warning', message: 'Target is in the past — the finished state is shown.' }
          : null },

      { type: 'section', key: 'appearance', label: 'Appearance',
        summary: c => {
          const u = { auto: 'Auto', dhms: 'D·H·M·S', dhm: 'D·H·M', dh: 'D·H', days: 'D', hms: 'H·M·S' }[c.units ?? 'auto'] ?? '';
          return c.locale ? `${u} · ${c.locale}` : u;
        } },
      { key: 'units', type: 'select', label: 'Show units', options: [
        { value: 'auto',   label: 'Auto (hide finer units when target is far away)' },
        { value: 'dhms',   label: 'Days · hours · minutes · seconds' },
        { value: 'dhm',    label: 'Days · hours · minutes' },
        { value: 'dh',     label: 'Days · hours' },
        { value: 'days',   label: 'Just days' },
        { value: 'hms',    label: 'Hours · minutes · seconds (≤24h)' },
      ], help: 'For long countdowns (≥1 week) "just days" or "days+hours" reads better than burning a seconds digit.' },
      { key: 'unitStyle', type: 'select', label: 'Unit labels', buttons: true, options: [
        { value: 'short',  label: 'Short' },
        { value: 'full',   label: 'Full words' },
        { value: 'hidden', label: 'Hidden' },
      ], help: 'How the labels under the digits are written — they follow the language below.' },
      localeField(),
      { key: 'showTarget', type: 'toggle', label: 'Show target date',
        help: 'Shows the exact target date & time under the countdown.' },
      textScaleField(),

      { type: 'section', key: 'behavior', label: 'Behavior',
        summary: c => {
          const s = c.urgentBelow ?? 0;
          if (!s) return '';
          return s >= 3600 ? `< ${Math.round(s / 3600)} h` : s >= 60 ? `< ${Math.round(s / 60)} min` : `< ${s} s`;
        } },
      { key: 'urgentBelow', type: 'duration', label: 'Urgent when below (0 = off)',
        help: 'When the remaining time drops below this, the digits switch to the urgency colour.' },
      { key: 'urgentColor', type: 'color', label: 'Urgency colour', clearable: true,
        help: 'Leave empty to use the accent colour.',
        showIf: c => (c.urgentBelow ?? 0) > 0 },

      { type: 'section', key: 'finished', label: 'When finished',
        summary: c => ({ text: 'Show text', countup: 'Count up', freeze: 'Freeze at zero' }[c.finishedMode ?? 'text'] ?? '') },
      { key: 'finishedMode', type: 'select', label: 'When the target is reached', buttons: true, options: [
        { value: 'text',    label: 'Show text' },
        { value: 'countup', label: 'Count up' },
        { value: 'freeze',  label: 'Freeze at zero' },
      ], help: '“Count up” keeps counting past the target (time since), “Freeze at zero” holds the zeros.' },
      { key: 'expiredText', type: 'text', label: 'Text when reached',
        help: 'Shown once the target is reached.',
        showIf: c => (c.finishedMode ?? 'text') === 'text' },

      ...themeColorSection(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const locale = c.locale || undefined;
    const unitStyle = c.unitStyle ?? 'short';
    const targetAt = (c.target && typeof c.target === 'object') ? c.target.at : null;
    const target = targetAt != null ? new Date(targetAt) : null;
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-countdown bb-theme-${c.theme ?? 'gradient-purple'}`;
    root.style.setProperty('--bb-countdown-text-scale', String((c.textScale ?? 100) / 100));
    const caption = c.showTarget && target && !isNaN(target.getTime())
      ? `<div class="bb-cd-target" data-field="target showTarget locale textScale" style="margin-top:18px;opacity:.7;font:500 calc(min(3.6cqw,5cqh) * var(--bb-countdown-text-scale,1))/1.3 var(--bb-st-font, Inter, sans-serif);">${escapeHtml(formatTarget(target, c.target?.tz, locale))}</div>`
      : '';
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      ${c.heading ? `<div class="bb-cd-heading" data-field="heading textScale">${escapeHtml(c.heading)}</div>` : ''}
      <div class="bb-cd-grid"></div>
      ${caption}
    `;
    container.appendChild(root);
    const grid = root.querySelector('.bb-cd-grid');
    const urgentColor = c.urgentColor || 'var(--bb-st-accent)'; // || so '' inherits
    const cell = (k, count, v, urgent) =>
      `<div><b class="bb-cd-${k}" data-field="target units finishedMode textScale urgentBelow urgentColor"${urgent ? ` style="color:${escapeHtml(urgentColor)};"` : ''}>${v}</b>${
        unitStyle === 'hidden' ? '' : `<span class="bb-cd-u-${k}" data-field="unitStyle units locale">${escapeHtml(unitLabel(k, count, locale, unitStyle))}</span>`}</div>`;
    const pad = n => String(n).padStart(2, '0');

    // The grid only rebuilds its DOM when the SHAPE changes (unit mode,
    // urgency flip, finished state); per-tick updates touch the digit text
    // nodes only, so the 1s cadence stays cheap on weak player hardware.
    let lastSig = null;
    const tick = () => {
      if (!target || isNaN(target.getTime())) {
        if (lastSig !== 'empty') { grid.textContent = 'Set a target date.'; lastSig = 'empty'; }
        return 30000;
      }
      const remaining = target.getTime() - Date.now();
      const finished = remaining <= 0;
      const fMode = c.finishedMode ?? 'text';
      if (finished && fMode === 'text') {
        if (lastSig !== 'finished-text') {
          // Responsive like the rest of the widget set, a fixed 84px overflowed
          // small tiles and looked lost on a wall-sized TV. .bb-cd-grid is inside
          // the .bb-slide size-container, so cq units track the actual tile.
          grid.innerHTML = `<div data-field="expiredText finishedMode textScale" style="font:800 calc(min(18cqw,26cqh) * var(--bb-countdown-text-scale,1))/1.05 var(--bb-st-font, Inter, sans-serif);">${escapeHtml(c.expiredText ?? 'Now!')}</div>`;
          lastSig = 'finished-text';
        }
        return 30000;
      }
      // countup keeps the grid running on |elapsed| ("time since launch"),
      // freeze pins it at zero in the configured unit layout.
      const span = finished && fMode === 'freeze' ? 0 : Math.abs(remaining);
      const d = Math.floor(span / 86_400_000);
      const h = Math.floor(span / 3_600_000) % 24;
      const m = Math.floor(span / 60_000) % 60;
      const s = Math.floor(span / 1000) % 60;
      // Pick which units to show. Auto: ≥30d days only; ≥7d d+h; ≥1d d+h+m;
      // else full d+h+m+s. (≤24h "hms" hides days, useful for openings.)
      // Resolved from the CURRENT span, so a far-out auto countdown ticks at
      // 30s and only upgrades to finer units (and 1s ticks) as it approaches.
      let mode = c.units ?? 'auto';
      if (mode === 'auto') mode = d >= 30 ? 'days' : d >= 7 ? 'dh' : d >= 1 ? 'dhm' : 'dhms';
      const keys = UNIT_KEYS[mode] ?? UNIT_KEYS.dhms;
      const urgentMs = (c.urgentBelow ?? 0) * 1000;
      const urgent = !finished && urgentMs > 0 && remaining <= urgentMs;
      const counts = { d, h: mode === 'hms' ? d * 24 + h : h, m, s };
      const values = { d: String(d), h: pad(counts.h), m: pad(m), s: pad(s) };
      const sig = `${mode}|${urgent ? 'u' : ''}|${finished ? fMode : ''}`;
      if (sig !== lastSig) {
        grid.innerHTML = keys.map(k => cell(k, counts[k], values[k], urgent)).join('');
        lastSig = sig;
      } else {
        for (const k of keys) {
          grid.querySelector(`.bb-cd-${k}`).textContent = values[k];
          if (unitStyle === 'full') {
            // Full-word labels pluralize with the count ('1 day' → '2 days').
            const u = grid.querySelector(`.bb-cd-u-${k}`);
            if (u) u.textContent = unitLabel(k, counts[k], locale, unitStyle);
          }
        }
      }
      // Per-second tick only while seconds are visible; coarse modes repaint
      // every 30s — except near the finish line or the urgency threshold,
      // where we tighten to 1s so the flip lands on time. A frozen grid
      // never changes again, so it idles at 30s regardless of units.
      if (finished && fMode === 'freeze') return 30000;
      let next = keys.includes('s') ? 1000 : 30000;
      if (!finished && next > 1000 &&
          (remaining <= 31000 || (urgentMs > 0 && remaining > urgentMs && remaining - urgentMs <= 31000))) {
        next = 1000;
      }
      return next;
    };
    let timer = 0;
    const loop = () => { timer = setTimeout(loop, tick()); };
    loop();
    return composeDispose(() => { clearTimeout(timer); root.remove(); });
  },
});
