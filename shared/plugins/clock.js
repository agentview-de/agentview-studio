import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';

const TIME_MODES = ['time', 'time-seconds', 'date-time'];

export default register({
  type: 'clock',
  label: 'Clock',
  group: 'live',
  icon: '🕐',
  schemaVersion: 2,
  defaults: () => ({ ...colorOverrideDefaults(), timezone: 'Europe/Berlin', label: '', display: 'date-time', style: 'digital', hour12: false, theme: 'gradient-purple' }),
  schema: () => ({
    fields: [
      { key: 'timezone', type: 'timezone', label: 'Time zone' },
      { key: 'label', type: 'text', label: 'Label (e.g. Berlin)' },
      { key: 'display', type: 'select', label: 'Show', options: [
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
        showIf: c => c.display === 'custom',
        help: 'Tokens: yyyy y MMMM MMM MM M d EEEE EEE HH H mm m ss s a (12h marker). Anything else passes through literally.' },
      { key: 'hour12', type: 'toggle', label: '12-hour clock', showIf: c => TIME_MODES.includes(c.display ?? 'date-time') },
      { key: 'style', type: 'select', label: 'Style', options: ['digital', 'analog'],
        showIf: c => TIME_MODES.includes(c.display ?? 'date-time') },
      themeField('Color theme (text/accent)'),
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const tz = c.timezone || 'Europe/Berlin';
    const display = c.display ?? 'date-time';
    const timeMode = TIME_MODES.includes(display);
    const bigTime = display === 'time' || display === 'time-seconds' || display === 'date-time';
    const analog = c.style === 'analog' && timeMode;
    const h12 = !!c.hour12;

    // → { primary, secondary } strings for the current instant.
    const parts = now => {
      const fmt = opts => new Intl.DateTimeFormat(undefined, { timeZone: tz, ...opts }).format(now);
      switch (display) {
        case 'time': return { primary: fmt({ hour: '2-digit', minute: '2-digit', hour12: h12 }), secondary: '' };
        case 'time-seconds': return { primary: fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: h12 }), secondary: '' };
        case 'date': return { primary: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), secondary: '' };
        case 'date-short': return { primary: fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }), secondary: '' };
        case 'weekday': return { primary: fmt({ weekday: 'long' }), secondary: '' };
        case 'day-month': return { primary: fmt({ day: 'numeric', month: 'long' }), secondary: '' };
        case 'iso':
          return { primary: formatCustom(now, tz, 'yyyy-MM-dd HH:mm', h12), secondary: '' };
        case 'eu':
          return { primary: formatCustom(now, tz, 'dd.MM.yyyy HH:mm', h12), secondary: '' };
        case 'us':
          return { primary: formatCustom(now, tz, 'M/d/yyyy h:mm a', true), secondary: '' };
        case 'custom':
          return { primary: formatCustom(now, tz, c.customFormat ?? 'EEE, d MMM yyyy HH:mm', h12), secondary: '' };
        case 'date-time':
        default: return {
          primary: fmt({ hour: '2-digit', minute: '2-digit', hour12: h12 }),
          secondary: fmt({ weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
        };
      }
    };

    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-clock bb-clock-${analog ? 'analog' : 'digital'} bb-theme-${c.theme ?? 'gradient-purple'}`;
    root.style.cssText += 'container-type:size;width:100%;height:100%;background:transparent;';

    if (analog) {
      root.innerHTML = `
        <div class="bb-clock-label">${escapeHtml(c.label ?? tz)}</div>
        <div class="bb-analog">
          <div class="bb-analog-face">
            ${[...Array(12)].map((_, i) => `<span class="bb-tick" style="--i:${i}"></span>`).join('')}
            <div class="bb-hand bb-hand-hour"></div>
            <div class="bb-hand bb-hand-min"></div>
            <div class="bb-hand bb-hand-sec"></div>
            <div class="bb-analog-center"></div>
          </div>
        </div>
        <div class="bb-clock-date"></div>`;
    } else {
      root.innerHTML = `
        <div class="bb-clock-label">${escapeHtml(c.label ?? tz)}</div>
        <div class="bb-digital">--</div>
        <div class="bb-clock-date"></div>`;
    }
    container.appendChild(root);

    const lab = root.querySelector('.bb-clock-label');
    if (lab) lab.style.fontSize = 'min(5cqw, 9cqh)';
    const dig = root.querySelector('.bb-digital');
    if (dig) {
      dig.style.fontSize = bigTime ? 'min(16cqw, 34cqh)' : 'min(9cqw, 17cqh)';
      dig.style.lineHeight = '1.05';
      dig.style.margin = '0.3em 0';
      dig.style.whiteSpace = bigTime ? 'nowrap' : 'normal';
      dig.style.textAlign = 'center';
      if (!bigTime) dig.style.fontFamily = 'var(--bb-st-font, "Inter Tight", Inter, sans-serif)';
    }
    const dat = root.querySelector('.bb-clock-date');
    if (dat) dat.style.fontSize = 'min(4.5cqw, 8cqh)';

    const analogEl = root.querySelector('.bb-analog');
    if (analogEl) {
      const s = 'min(72cqw, 72cqh)';
      analogEl.style.width = s; analogEl.style.height = s; analogEl.style.margin = '4cqh auto';
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

    const tick = () => {
      const now = new Date();
      const { primary, secondary } = parts(now);
      if (dig) dig.textContent = primary;
      if (dat) dat.textContent = (analog ? (display === 'date-time' ? secondary : '') : secondary);
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
    // Per-second only when seconds are visible; otherwise per-15s is plenty.
    const everyMs = (display === 'time-seconds' || analog) ? 1000 : 15000;
    const id = setInterval(tick, everyMs);
    return composeDispose(() => { clearInterval(id); root.remove(); });
  },
});


// Lightweight format-pattern → string. Subset of the Unicode LDML tokens
// people actually type (no need to pull in date-fns / dayjs for this). Tokens
// are looked up against an Intl-derived parts table for the requested tz so
// the right locale month/weekday names appear automatically.
const FMT_TOKENS = /(yyyy|yy|y|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|hh|h|mm|m|ss|s|a)/g;
function formatCustom(date, tz, pattern, hour12) {
  const dtf = new Intl.DateTimeFormat(undefined, {
    timeZone: tz, hourCycle: hour12 ? 'h12' : 'h23',
    year: 'numeric', month: 'long', day: '2-digit', weekday: 'long',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  // Short forms, Intl doesn't give us "MMM" / "EEE" in one call, so pull them
  // separately.
  const monthShort = new Intl.DateTimeFormat(undefined, { timeZone: tz, month: 'short' }).format(date);
  const monthNum = new Intl.DateTimeFormat(undefined, { timeZone: tz, month: 'numeric' }).format(date);
  const dayNum = new Intl.DateTimeFormat(undefined, { timeZone: tz, day: 'numeric' }).format(date);
  const dowShort = new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short' }).format(date);
  const hour12Str = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', hourCycle: 'h12' }).format(date).replace(/\s?[AaPp][Mm]\.?$/, '');
  const ampm = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', hourCycle: 'h12' }).format(date).match(/[AaPp][Mm]/)?.[0] ?? '';
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
