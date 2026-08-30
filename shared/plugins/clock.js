import { register } from './registry.js';
import { themeColorSection, colorOverrideDefaults, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';
import { textScaleField } from '../text-scale.js';
import { localeField, safeLocale } from '../locale-field.js';
import { defaultTz } from '../utils/default-tz.js';

const TIME_MODES = ['time', 'time-seconds', 'date-time'];

// Audience-language fallback for the open/closed badge when the text fields
// are left blank — keyed off the locale field's base language. 'Open'/'Closed'
// has no Intl API, so a small endonym map does the job.
const OPEN_WORDS = {
  de: ['Geöffnet', 'Geschlossen'], en: ['Open', 'Closed'], fr: ['Ouvert', 'Fermé'],
  it: ['Aperto', 'Chiuso'], es: ['Abierto', 'Cerrado'], nl: ['Open', 'Gesloten'],
  pl: ['Otwarte', 'Zamknięte'], tr: ['Açık', 'Kapalı'], cs: ['Otevřeno', 'Zavřeno'],
  da: ['Åben', 'Lukket'], sv: ['Öppet', 'Stängt'], no: ['Åpent', 'Stengt'],
  fi: ['Avoinna', 'Suljettu'], pt: ['Aberto', 'Fechado'], ja: ['営業中', '閉店'],
  zh: ['营业中', '已打烊'],
};
function openWords(locale) {
  let tag = locale;
  if (!tag) { try { tag = navigator.language; } catch { /* non-browser */ } }
  return OPEN_WORDS[String(tag || 'en').toLowerCase().split('-')[0]] ?? OPEN_WORDS.en;
}

// 'HH:MM' → minutes since midnight, or null when unparsable.
const parseHM = s => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : null;
};

export default register({
  type: 'clock',
  label: 'Clock',
  group: 'live',
  icon: '🕐',
  schemaVersion: 2,
  defaults: () => ({ ...colorOverrideDefaults(),
    timezone: defaultTz(),
    label: '',
    showLabel: true,
    locale: '',
    showOffset: false,
    display: 'date-time',
    style: 'digital',
    faceStyle: 'ticks',
    hour12: false,
    align: 'center',
    textScale: 100,
    showOpenBadge: false,
    openFrom: '08:00',
    openTo: '18:00',
    openText: '',
    closedText: '',
    theme: 'gradient-purple',
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'clock', label: 'Clock' },
      { key: 'timezone', type: 'timezone', label: 'Time zone',
        help: 'Drives both the time and the date line — set the venue\'s zone, not the player\'s.' },
      { key: 'showLabel', type: 'toggle', label: 'Show label',
        help: 'The small line above the clock. Turn it off for a bare clock — a corner clock on a single-site screen has nothing useful to say there.' },
      { key: 'label', type: 'text', label: 'Label', placeholder: 'e.g. Berlin',
        showIf: c => c.showLabel !== false,
        help: 'Shown above the clock. Leave blank to show the time zone name instead.' },
      { ...localeField(), tier: 'advanced' },
      { key: 'showOffset', type: 'toggle', label: 'Show UTC offset', tier: 'advanced',
        help: 'Appends the zone offset (e.g. UTC+2) next to the label — handy on multi-site boards.' },

      { type: 'section', key: 'format', label: 'Format' },
      { key: 'display', type: 'select', label: 'Show', tier: 'advanced', options: [
        { value: 'time', label: 'Time (HH:MM)' },
        { value: 'time-seconds', label: 'Time with seconds' },
        { value: 'date-time', label: 'Date + time' },
        { value: 'date', label: 'Full date' },
        { value: 'date-short', label: 'Date (short)' },
        { value: 'weekday', label: 'Weekday only' },
        { value: 'day-month', label: 'Day + month' },
        { value: 'iso',     label: 'ISO 8601 (yyyy-MM-dd HH:mm)' },
        { value: 'eu',      label: 'European (dd.MM.yyyy HH:mm)' },
        { value: 'us',      label: 'US (M/d/yyyy h:mm a)' },
        { value: 'custom', label: 'Custom format…' },
      ] },
      { key: 'customFormat', type: 'text', label: 'Custom format',
        placeholder: 'EEE, d MMM yyyy HH:mm',
        tier: 'advanced',
        showIf: c => c.display === 'custom',
        help: 'Tokens: yyyy y MMMM MMM MM M d EEEE EEE HH H mm m ss s a (12h marker). Anything else passes through literally.',
        validate: v => {
          const s = String(v ?? '').trim();
          if (!s) return { level: 'warn', message: 'Empty pattern — the default "EEE, d MMM yyyy HH:mm" is used.' };
          return s.match(FMT_TOKENS) ? null
            : { level: 'warn', message: 'No recognised tokens — the pattern will render as literal text.' };
        } },
      { key: 'hour12', type: 'toggle', label: '12-hour clock', tier: 'advanced',
        showIf: c => TIME_MODES.includes(c.display ?? 'date-time') || c.display === 'custom' },
      { key: 'style', type: 'select', label: 'Style', buttons: true,
        options: [
          { value: 'digital', label: 'Digital' },
          { value: 'analog', label: 'Analog' },
        ],
        showIf: c => TIME_MODES.includes(c.display ?? 'date-time') },
      { key: 'faceStyle', type: 'select', label: 'Face style', buttons: true, tier: 'advanced',
        options: [
          { value: 'ticks',    label: 'Ticks' },
          { value: 'quarters', label: '12 · 3 · 6 · 9' },
          { value: 'numerals', label: 'All numerals' },
        ],
        showIf: c => c.style === 'analog' && TIME_MODES.includes(c.display ?? 'date-time') },

      { type: 'section', key: 'appearance', label: 'Appearance' },
      { key: 'align', type: 'align', label: 'Alignment', tier: 'advanced' },
      { ...textScaleField(), tier: 'advanced' },

      { type: 'section', key: 'hours', label: 'Opening hours', collapsed: true,
        summary: c => c.showOpenBadge ? `${c.openFrom || '08:00'}–${c.openTo || '18:00'}` : 'Off' },
      { key: 'showOpenBadge', type: 'toggle', label: 'Open/closed badge', tier: 'advanced',
        help: 'Shows a pill under the clock comparing the current time in the selected zone with the hours below. A "Closes at" earlier than "Opens at" wraps past midnight.' },
      { type: 'row', showIf: c => !!c.showOpenBadge, children: [
        { key: 'openFrom', type: 'time', label: 'Opens at', tier: 'advanced' },
        { key: 'openTo',   type: 'time', label: 'Closes at', tier: 'advanced' },
      ] },
      { type: 'row', showIf: c => !!c.showOpenBadge, children: [
        { key: 'openText',   type: 'text', label: 'Text when open', placeholder: 'Auto', tier: 'advanced',
          help: 'Leave blank for an automatic word in the selected language.' },
        { key: 'closedText', type: 'text', label: 'Text when closed', placeholder: 'Auto', tier: 'advanced' },
      ] },

      ...themeColorSection('Color theme (text/accent)'),
    ],
  }),
  looks: () => [
    { id: 'digital', name: 'Digital', patch: { style: 'digital', display: 'date-time' } },
    { id: 'analog', name: 'Analog', patch: { style: 'analog', display: 'time', faceStyle: 'quarters' } },
    { id: 'time-12h', name: '12-hour', patch: { display: 'time', hour12: true, style: 'digital' } },
    { id: 'numerals', name: 'Numeral face', patch: { style: 'analog', faceStyle: 'numerals', display: 'time' } },
    { id: 'open-badge', name: 'With open badge', patch: { showOpenBadge: true, align: 'left' } },
  ],
  render(slide, container) {
    const c = slide.content ?? {};
    const tz = c.timezone || defaultTz();
    const loc = safeLocale(c.locale);
    const display = c.display ?? 'date-time';
    const timeMode = TIME_MODES.includes(display);
    const bigTime = display === 'time' || display === 'time-seconds' || display === 'date-time';
    const analog = c.style === 'analog' && timeMode;
    const h12 = !!c.hour12;
    const align = c.align ?? 'center';

    // → { primary, secondary } strings for the current instant.
    const parts = now => {
      const fmt = opts => new Intl.DateTimeFormat(loc, { timeZone: tz, ...opts }).format(now);
      switch (display) {
        case 'time': return { primary: fmt({ hour: '2-digit', minute: '2-digit', hour12: h12 }), secondary: '' };
        case 'time-seconds': return { primary: fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: h12 }), secondary: '' };
        case 'date': return { primary: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), secondary: '' };
        case 'date-short': return { primary: fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }), secondary: '' };
        case 'weekday': return { primary: fmt({ weekday: 'long' }), secondary: '' };
        case 'day-month': return { primary: fmt({ day: 'numeric', month: 'long' }), secondary: '' };
        case 'iso':
          return { primary: formatCustom(now, tz, 'yyyy-MM-dd HH:mm', h12, loc), secondary: '' };
        case 'eu':
          return { primary: formatCustom(now, tz, 'dd.MM.yyyy HH:mm', h12, loc), secondary: '' };
        case 'us':
          return { primary: formatCustom(now, tz, 'M/d/yyyy h:mm a', true, loc), secondary: '' };
        case 'custom':
          return { primary: formatCustom(now, tz, c.customFormat ?? 'EEE, d MMM yyyy HH:mm', h12, loc), secondary: '' };
        case 'date-time':
        default: return {
          primary: fmt({ hour: '2-digit', minute: '2-digit', hour12: h12 }),
          secondary: fmt({ weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
        };
      }
    };

    // 'GMT+2' from Intl, normalised to the more familiar 'UTC+2'.
    const offsetStr = now => {
      try {
        const part = new Intl.DateTimeFormat(loc, { timeZone: tz, timeZoneName: 'shortOffset' })
          .formatToParts(now).find(x => x.type === 'timeZoneName');
        return (part?.value ?? '').replace(/^GMT/, 'UTC');
      } catch { return ''; }
    };

    // Minutes since midnight in the configured zone ('en-GB' so the digits
    // stay parseable regardless of the audience locale).
    const tzMinutes = now => {
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
      return (+p.find(x => x.type === 'hour').value % 24) * 60 + +p.find(x => x.type === 'minute').value;
    };

    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-clock bb-clock-${analog ? 'analog' : 'digital'} bb-theme-${c.theme ?? 'gradient-purple'}`;
    root.style.cssText += 'container-type:size;width:100%;height:100%;background:transparent;';
    root.style.setProperty('--bb-clock-text-scale', String((Number(c.textScale) || 100) / 100));
    root.style.textAlign = align;
    if (align !== 'center') root.style.alignItems = align === 'left' ? 'flex-start' : 'flex-end';

    // c.label || tz (NOT ??): defaults() stores '', which must still fall
    // through to the time zone name on a fresh clock — that is what the field's
    // help promises, and a clock dropped on an empty slide should say which
    // zone it is showing.
    //
    // What it must NOT do is make that undeclinable. Every corner clock in the
    // template catalog carried a tiny uppercase "EUROPE/BERLIN" above it — nine
    // slides, up to 29 px of it on the school board — because clearing the
    // label is exactly how you ask for no label, and clearing it brought the
    // zone back. `showLabel` is the way to say no. It defaults to true, so no
    // stored playlist changes: the key is simply absent and reads as on.
    const labelHtml = c.showLabel === false ? '' : `
      <div class="bb-clock-label" data-field="label showLabel timezone showOffset align textScale locale">${escapeHtml(c.label || tz)}${c.showOffset
        ? '<span class="bb-clock-offset" data-field="showOffset timezone locale" style="opacity:.65;margin-left:.6em;font-size:.85em;letter-spacing:.05em;"></span>' : ''}</div>`;
    const titleHtml = slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : '';
    const badgeHtml = '<div class="bb-clock-badge" data-field="showOpenBadge openFrom openTo openText closedText timezone locale textScale" style="display:none"></div>';

    if (analog) {
      const faceStyle = c.faceStyle ?? 'ticks';
      const nums = faceStyle === 'quarters' ? [12, 3, 6, 9]
        : faceStyle === 'numerals' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [];
      const ticksHtml = faceStyle === 'numerals' ? ''
        : [...Array(12)].map((_, i) => `<span class="bb-tick" style="--i:${i}"></span>`).join('');
      // cq units resolve against .bb-analog (container-type:size set below).
      const numsHtml = nums.map(n => {
        const rad = (n % 12) / 12 * 2 * Math.PI;
        const x = (50 + 38 * Math.sin(rad)).toFixed(1);
        const y = (50 - 38 * Math.cos(rad)).toFixed(1);
        return `<span class="bb-face-num" style="position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%);` +
          `font-weight:700;font-size:${faceStyle === 'quarters' ? 10 : 9}cqmin;line-height:1;opacity:.85;font-variant-numeric:tabular-nums;">${n}</span>`;
      }).join('');
      root.innerHTML = `
        ${titleHtml}
        ${labelHtml}
        <div class="bb-analog" data-field="style faceStyle timezone hour12 display">
          <div class="bb-analog-face">
            ${ticksHtml}
            ${numsHtml}
            <div class="bb-hand bb-hand-hour"></div>
            <div class="bb-hand bb-hand-min"></div>
            <div class="bb-hand bb-hand-sec"></div>
            <div class="bb-analog-center"></div>
          </div>
        </div>
        <div class="bb-clock-date" data-field="display timezone locale textScale"></div>
        ${badgeHtml}`;
    } else {
      root.innerHTML = `
        ${titleHtml}
        ${labelHtml}
        <div class="bb-digital" data-field="display timezone hour12 customFormat textScale locale align">--</div>
        <div class="bb-clock-date" data-field="display timezone locale textScale"></div>
        ${badgeHtml}`;
    }
    container.appendChild(root);

    const lab = root.querySelector('.bb-clock-label');
    if (lab) lab.style.fontSize = 'calc(min(5cqw, 9cqh) * var(--bb-clock-text-scale, 1))';
    const dig = root.querySelector('.bb-digital');
    if (dig) {
      dig.style.fontSize = bigTime
        ? 'calc(min(16cqw, 34cqh) * var(--bb-clock-text-scale, 1))'
        : 'calc(min(9cqw, 17cqh) * var(--bb-clock-text-scale, 1))';
      dig.style.lineHeight = '1.05';
      dig.style.margin = '0.3em 0';
      dig.style.whiteSpace = bigTime ? 'nowrap' : 'normal';
      dig.style.textAlign = align;
      if (!bigTime) dig.style.fontFamily = 'var(--bb-st-font, "Inter Tight", Inter, sans-serif)';
    }
    const dat = root.querySelector('.bb-clock-date');
    if (dat) dat.style.fontSize = 'calc(min(4.5cqw, 8cqh) * var(--bb-clock-text-scale, 1))';
    const badge = root.querySelector('.bb-clock-badge');
    if (badge) {
      badge.style.cssText += 'padding:0.35em 1.1em;border-radius:999px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-top:0.6em;';
      badge.style.fontSize = 'calc(min(3.5cqw, 6cqh) * var(--bb-clock-text-scale, 1))';
    }

    const analogEl = root.querySelector('.bb-analog');
    if (analogEl) {
      const s = 'min(72cqw, 72cqh)';
      analogEl.style.width = s; analogEl.style.height = s;
      // margin auto would re-center on the cross axis and defeat the
      // alignment control, so only use it for the centered default.
      analogEl.style.margin = align === 'center' ? '4cqh auto' : '4cqh 0';
      analogEl.style.containerType = 'size';
      const face = analogEl.querySelector('.bb-analog-face');
      if (face) face.style.borderWidth = 'max(1px, 0.4cqmin)';
      analogEl.querySelectorAll('.bb-tick').forEach(tk => {
        tk.style.width = '0.6cqmin'; tk.style.height = '2.8cqmin'; tk.style.top = '1.8cqmin';
        tk.style.transformOrigin = '50% calc(50% - 1.8cqmin)';
      });
      const setHand = (sel, w) => { const h = analogEl.querySelector(sel); if (h) { h.style.width = w; h.style.marginLeft = `calc(${w} / -2)`; } };
      setHand('.bb-hand-hour', '1.7cqmin'); setHand('.bb-hand-min', '1.2cqmin'); setHand('.bb-hand-sec', '0.7cqmin');
      const ctr = analogEl.querySelector('.bb-analog-center');
      if (ctr) { ctr.style.width = '3.6cqmin'; ctr.style.height = '3.6cqmin'; }
    }

    const off = root.querySelector('.bb-clock-offset');
    const updateBadge = now => {
      if (!badge) return;
      const from = parseHM(c.openFrom);
      const to = parseHM(c.openTo);
      if (!c.showOpenBadge || from == null || to == null) { badge.style.display = 'none'; return; }
      const nowM = tzMinutes(now);
      // from === to → open around the clock; to < from → wraps past midnight.
      const open = from === to ? true : from < to ? (nowM >= from && nowM < to) : (nowM >= from || nowM < to);
      const words = openWords(c.locale);
      badge.style.display = 'inline-block';
      badge.textContent = open ? (c.openText || words[0]) : (c.closedText || words[1]);
      badge.style.background = open
        ? 'color-mix(in srgb, var(--bb-st-accent) 20%, transparent)'
        : 'color-mix(in srgb, var(--bb-st-fg) 10%, transparent)';
      badge.style.color = open ? 'var(--bb-st-accent)' : 'var(--bb-st-fg)';
      badge.style.border = open
        ? '1px solid color-mix(in srgb, var(--bb-st-accent) 45%, transparent)'
        : '1px solid color-mix(in srgb, var(--bb-st-fg) 25%, transparent)';
      badge.style.opacity = open ? '1' : '.75';
    };

    const tick = () => {
      const now = new Date();
      const { primary, secondary } = parts(now);
      if (dig) dig.textContent = primary;
      if (dat) dat.textContent = (analog ? (display === 'date-time' ? secondary : '') : secondary);
      if (off) off.textContent = offsetStr(now); // re-read each tick: DST flips it
      updateBadge(now);
      if (analogEl) {
        const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false }).formatToParts(now);
        const h = +p.find(x => x.type === 'hour').value;
        const m = +p.find(x => x.type === 'minute').value;
        const sec = +p.find(x => x.type === 'second').value;
        analogEl.querySelector('.bb-hand-hour').style.transform = `rotate(${(h % 12) * 30 + m * 0.5}deg)`;
        analogEl.querySelector('.bb-hand-min').style.transform = `rotate(${m * 6 + sec * 0.1}deg)`;
        analogEl.querySelector('.bb-hand-sec').style.transform = `rotate(${sec * 6}deg)`;
      }
    };
    tick();
    // Per-second only when seconds are visible (incl. an s/ss token in a
    // custom pattern); otherwise per-15s is plenty.
    const customSeconds = display === 'custom' && /s/.test(String(c.customFormat ?? ''));
    const everyMs = (display === 'time-seconds' || analog || customSeconds) ? 1000 : 15000;
    const id = setInterval(tick, everyMs);
    return composeDispose(() => { clearInterval(id); root.remove(); });
  },
});


// Lightweight format-pattern → string. Subset of the Unicode LDML tokens
// people actually type (no need to pull in date-fns / dayjs for this). Tokens
// are looked up against an Intl-derived parts table for the requested tz +
// audience locale so the right month/weekday names appear automatically.
const FMT_TOKENS = /(yyyy|yy|y|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|hh|h|mm|m|ss|s|a)/g;
function formatCustom(date, tz, pattern, hour12, locale) {
  const dtf = new Intl.DateTimeFormat(locale, {
    timeZone: tz, hourCycle: hour12 ? 'h12' : 'h23',
    year: 'numeric', month: 'long', day: '2-digit', weekday: 'long',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  // Short forms, Intl doesn't give us "MMM" / "EEE" in one call, so pull them
  // separately.
  const monthShort = new Intl.DateTimeFormat(locale, { timeZone: tz, month: 'short' }).format(date);
  const monthNum = new Intl.DateTimeFormat(locale, { timeZone: tz, month: 'numeric' }).format(date);
  const dayNum = new Intl.DateTimeFormat(locale, { timeZone: tz, day: 'numeric' }).format(date);
  const dowShort = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: 'short' }).format(date);
  const hour12Str = new Intl.DateTimeFormat(locale, { timeZone: tz, hour: 'numeric', hourCycle: 'h12' }).format(date).replace(/\s?[AaPp][Mm]\.?$/, '');
  const ampm = new Intl.DateTimeFormat(locale, { timeZone: tz, hour: 'numeric', hourCycle: 'h12' }).format(date).match(/[AaPp][Mm]/)?.[0] ?? '';
  const table = {
    yyyy: p.year, yy: String(p.year).slice(-2), y: p.year,
    MMMM: p.month, MMM: monthShort, MM: String(monthNum).padStart(2, '0'), M: monthNum,
    dd: String(dayNum).padStart(2, '0'), d: dayNum,
    EEEE: p.weekday, EEE: dowShort,
    HH: p.hour, H: String(parseInt(p.hour, 10)),
    hh: hour12Str.padStart(2, '0'), h: hour12Str,
    mm: p.minute, m: String(parseInt(p.minute, 10)),
    ss: p.second, s: String(parseInt(p.second, 10)),
    a: ampm,
  };
  return String(pattern).replace(FMT_TOKENS, t => table[t] ?? t);
}
