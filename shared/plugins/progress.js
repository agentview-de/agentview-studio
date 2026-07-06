import { register } from './registry.js';
import { themeColorSection, colorOverrideDefaults, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { liveSource } from '../live-source.js';
import { offlineLiveOpts } from '../offline-data.js';
import { remoteJsonFields } from '../remote-json-fields.js';
import { STATUS_COLORS } from '../status-colors.js';
import { textScaleField } from '../text-scale.js';
import { localeField } from '../locale-field.js';
import { escapeHtml } from '../utils/escape.js';

const C = 2 * Math.PI * 42; // ring circumference (r=42 in a 100×100 viewBox)
// Gauge: a 220° arc with the 140° gap centred at the bottom — the classic
// dashboard speedometer. Same stroke-dasharray technique as the ring, just a
// shorter arc and a different start rotation (160° puts the gap symmetric
// around 6 o'clock: 160° + 220° sweep ends at 20°).
const GAUGE_SWEEP = 220 / 360;
const GAUGE_ROT = 160;

// Threshold-based fill: classic KPI traffic light. The three colour fields are
// STATUS colours (bad / warn / good); which percentage band maps to which
// status flips with "Lower is better" (capacity, error budgets, queue length).
// Defaults (warn=70%, good=90%) match common dashboard conventions. When
// thresholds are off, the single `color` field wins — empty = theme accent
// (`||`, never `??`, so '' falls through).
function fillFor(c, pct) {
  if (!c.useThresholds) return c.color || 'var(--bb-st-accent, #8b5cf6)';
  const warn = Number(c.thresholdWarn ?? 70);
  const good = Number(c.thresholdGood ?? 90);
  const band = pct >= good ? 'high' : pct >= warn ? 'mid' : 'low';
  const status = c.invertThresholds
    ? (band === 'high' ? 'bad' : band === 'mid' ? 'warn' : 'good')
    : (band === 'high' ? 'good' : band === 'mid' ? 'warn' : 'bad');
  return status === 'good' ? (c.colorHigh || STATUS_COLORS.good)
       : status === 'warn' ? (c.colorMid  || STATUS_COLORS.warn)
       :                     (c.colorLow  || STATUS_COLORS.bad);
}

// Live JSON → { value, target, label?, unit? }. Accepts a bare number (or a
// numeric string) as well as an object; target/label/unit fall back to the
// inline fields, so a feed only has to deliver the one number that changes.
// Throws on a non-numeric value — liveSource routes that to onError like any
// fetch failure.
function parseLive(data, c) {
  const d = (typeof data === 'object' && data !== null) ? data : { value: data };
  const value = Number(d.value);
  if (!Number.isFinite(value)) throw new Error('JSON has no numeric "value" field');
  const t = Number(d.target);
  return {
    value,
    target: Number.isFinite(t) && t > 0 ? t : (+c.target || 0),
    label: typeof d.label === 'string' && d.label ? d.label : undefined,
    unit: typeof d.unit === 'string' ? d.unit : undefined,
  };
}

export default register({
  type: 'progress',
  label: 'Progress / Goal',
  group: 'data',
  icon: '🎯',
  // Live mode (source:'url') makes this a fetching widget — the flag opts it
  // into the same DSGVO machinery as kpi-cards/chart/data-table (editor
  // click-to-load placeholder, IP note, on-error fallback, offline slots).
  network: true,
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(),
    label: 'Fundraising goal',
    value: 6800, target: 10000, unit: '€',
    source: 'inline', dataUrl: '', refreshSec: 60,
    style: 'bar', showValue: true, animate: true,
    align: 'center', labelPos: 'above', labelEmphasis: false,
    color: STATUS_COLORS.good,
    locale: '', textScale: 100, labelScale: 100, valueScale: 100,
    useThresholds: false, invertThresholds: false,
    thresholdWarn: 70, thresholdGood: 90,
    colorLow: STATUS_COLORS.bad, colorMid: STATUS_COLORS.warn, colorHigh: STATUS_COLORS.good,
    theme: 'minimal-dark',
  }),
  schema: () => {
    // Shared source/dataUrl/refreshSec trio (same keys as kpi-cards/chart) —
    // turns the widget into a self-updating donation/sales/production counter.
    const [sourceField, dataUrlField, refreshField] = remoteJsonFields({
      placeholder: 'https://api.example.com/progress.json',
      urlHelp: 'Accepts {"value": 12345} with optional "target", "label" and "unit" — or a bare number. Must allow CORS for whichever side fetches it (display in Live mode, Studio in Offline mode).',
    });
    return { fields: [
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'label', type: 'text', label: 'Label' },
      { type: 'row', children: [
        // In live mode the fetched value replaces 'Current'; 'Target' stays
        // visible as the fallback denominator when the JSON carries none.
        { key: 'value',  type: 'number', label: 'Current',
          showIf: c => (c.source ?? 'inline') === 'inline' },
        { key: 'target', type: 'number', label: 'Target' },
      ] },
      { key: 'unit', type: 'text', label: 'Unit / suffix', placeholder: '€, %, sign-ups…' },

      { type: 'section', key: 'data', label: 'Data' },
      sourceField,
      dataUrlField,
      refreshField,

      { type: 'section', key: 'appearance', label: 'Appearance' },
      { key: 'style', type: 'select', label: 'Style', buttons: true, options: [
        { value: 'bar',   label: 'Bar' },
        { value: 'ring',  label: 'Ring' },
        { value: 'gauge', label: 'Gauge' },
      ] },
      { key: 'showValue', type: 'toggle', label: 'Show value' },
      // tier:'advanced' — these fine-tuning controls live in the Widget Designer,
      // not the quick inline inspector.
      { type: 'row', children: [
        { key: 'align', type: 'select', label: 'Vertical position', buttons: true, tier: 'advanced', options: [
          { value: 'top',    label: 'Top' },
          { value: 'center', label: 'Center' },
          { value: 'bottom', label: 'Bottom' },
        ] },
        { key: 'labelPos', type: 'select', label: 'Label position', buttons: true, tier: 'advanced', options: [
          { value: 'above', label: 'Above' },
          { value: 'below', label: 'Below' },
        ] },
      ] },
      { key: 'labelEmphasis', type: 'toggle', label: 'Emphasise label', tier: 'advanced',
        help: 'Uppercase, full opacity and bolder — makes the label read as the headline instead of a caption.' },
      { key: 'animate', type: 'toggle', label: 'Animate', tier: 'advanced',
        help: 'Fills the bar or ring with a sweep and counts the value up when the slide appears or the value changes.' },
      { key: 'color', type: 'color', label: 'Fill colour', clearable: true,
        showIf: c => !c.useThresholds,
        help: 'Leave empty to follow the theme accent; click × to reset.' },
      { ...localeField(), tier: 'advanced' },
      { ...textScaleField(), tier: 'advanced' },
      { type: 'row', children: [
        { key: 'labelScale', type: 'number', label: 'Label size', min: 50, max: 300, step: 10, slider: true, suffix: '%', tier: 'advanced',
          help: 'Scales the label on top of the overall text size — independent of the value.' },
        { key: 'valueScale', type: 'number', label: 'Value size', min: 50, max: 300, step: 10, slider: true, suffix: '%', tier: 'advanced',
          help: 'Scales the value / percentage on top of the overall text size — independent of the label.' },
      ] },

      { type: 'section', key: 'thresholds', label: 'Threshold colours', collapsed: true,
        summary: c => c.useThresholds
          ? `${c.thresholdWarn ?? 70}% · ${c.thresholdGood ?? 90}%${c.invertThresholds ? ' ↓' : ''}`
          : 'Off' },
      { key: 'useThresholds', type: 'toggle', label: 'Use threshold colours', tier: 'advanced',
        help: 'Fill colour switches between good / warn / bad based on the percentage — a KPI-style traffic light.' },
      { key: 'invertThresholds', type: 'toggle', label: 'Lower is better', tier: 'advanced',
        showIf: c => !!c.useThresholds,
        help: 'Flips the bands so a LOW percentage is good — for capacity, error budgets or queue lengths.' },
      { type: 'row', children: [
        { key: 'colorLow',  type: 'color', label: 'Bad',  tier: 'advanced' },
        { key: 'colorMid',  type: 'color', label: 'Warn', tier: 'advanced' },
        { key: 'colorHigh', type: 'color', label: 'Good', tier: 'advanced' },
      ], showIf: c => !!c.useThresholds },
      { type: 'row', children: [
        { key: 'thresholdWarn', type: 'number', label: 'Warn at %', min: 0, max: 100, step: 5, slider: true, tier: 'advanced',
          validate: (v, c) => (c?.useThresholds && Number(v) >= Number(c?.thresholdGood ?? 90))
            ? { level: 'warn', message: 'Warn threshold should be below the Good threshold.' } : null },
        { key: 'thresholdGood', type: 'number', label: 'Good at %', min: 0, max: 100, step: 5, slider: true, tier: 'advanced',
          validate: (v, c) => (c?.useThresholds && Number(v) <= Number(c?.thresholdWarn ?? 70))
            ? { level: 'warn', message: 'Good threshold should be above the Warn threshold.' } : null },
      ], showIf: c => !!c.useThresholds },

      ...themeColorSection(),
    ] };
  },
  // Curated "design ideas" for the Widget Designer's Looks gallery. Each patch
  // is merged onto the current content, so colours/label/value are preserved.
  looks: () => [
    { id: 'headline', name: 'Big headline',  patch: { style: 'bar', labelScale: 180, valueScale: 70, labelEmphasis: true, align: 'top', labelPos: 'above' } },
    { id: 'minimal',  name: 'Minimal ring',  patch: { style: 'ring', showValue: false, labelScale: 110, align: 'center' } },
    { id: 'ring-sub', name: 'Ring + value',  patch: { style: 'ring', showValue: true, valueScale: 80, labelScale: 120, labelEmphasis: true, labelPos: 'below' } },
    { id: 'gauge',    name: 'KPI gauge',     patch: { style: 'gauge', showValue: true, valueScale: 80, useThresholds: true, align: 'bottom' } },
    { id: 'compact',  name: 'Compact bar',   patch: { style: 'bar', labelScale: 90, valueScale: 90, labelEmphasis: false, align: 'center', animate: true } },
  ],
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const style = c.style ?? 'bar';
    const source = c.source ?? 'inline';
    const showValue = c.showValue !== false;
    const animate = c.animate !== false
      && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const ARC = style === 'gauge' ? C * GAUGE_SWEEP : C;
    const ROT = style === 'gauge' ? GAUGE_ROT : -90;
    // Audience language, not player OS ('' falls through to the device default).
    const fmtNum = n => Number(n).toLocaleString(c.locale || undefined);

    const align = c.align ?? 'center';
    const justify = align === 'top' ? 'flex-start' : align === 'bottom' ? 'flex-end' : 'center';
    const labelBelow = (c.labelPos ?? 'above') === 'below';

    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-progress bb-prog-${style} bb-theme-${c.theme ?? 'minimal-dark'}`;
    // container-type:size gives the cq* font clamps their container context.
    root.style.cssText += `container-type:size;width:100%;height:100%;background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:${justify};gap:0.5em;`;
    // Text-size multipliers — the .bb-prog-* font clamps in slide-themes.css
    // consume these vars (see the calc(... * var()) wrappers). label/value scale
    // independently so the label can headline while the value stays subordinate.
    root.style.setProperty('--bb-prog-text-scale', String((Number(c.textScale) || 100) / 100));
    root.style.setProperty('--bb-prog-label-scale', String((Number(c.labelScale) || 100) / 100));
    root.style.setProperty('--bb-prog-value-scale', String((Number(c.valueScale) || 100) / 100));
    container.appendChild(root);

    const titleHtml = slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : '';

    // --- dynamic refs + painters -------------------------------------------
    let labelEl, barFill, arcFill, tgtEl, curEls = [], pctEls = [], unitEls = [];
    let shown = 0;   // last value the count-up displayed (animation start point)
    let built = false;
    let rafId = 0;
    const stopRaf = () => { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } };

    const setNums = (v, target) => {
      // pct intentionally unclamped: 120% over-achievement reads as 120% while
      // the bar/ring fill clamps at 100%.
      const p = Math.round((target > 0 ? v / target : 0) * 100);
      for (const el of curEls) el.textContent = fmtNum(v);
      for (const el of pctEls) el.textContent = String(p);
    };
    const setMeta = (label, unit) => {
      if (labelEl) {
        labelEl.textContent = label;
        labelEl.style.display = label ? '' : 'none';
      }
      for (const el of unitEls) el.textContent = unit;
    };

    // Build the markup once per render (or after an error note), with the fill
    // at `v` of `t`. Dynamic bits are spans updated via textContent, so the
    // JSON-sourced path needs no re-escaping.
    // data-field annotations let the Widget Designer bridge controls ↔ elements
    // (hover a control to glow the element, click the element to focus the
    // control). Each list names every field that drives the element; the first
    // is the primary one a click jumps to. Inert outside the designer.
    const labelHtml = `<div class="bb-prog-label${c.labelEmphasis ? ' bb-prog-label--em' : ''}" data-field="label labelScale labelEmphasis labelPos align locale"></div>`;
    const build = (v, t) => {
      const clamped = Math.max(0, Math.min(1, t > 0 ? v / t : 0));
      const fill = fillFor(c, Math.round((t > 0 ? v / t : 0) * 100));
      // currentColor track instead of hardcoded white — visible on the light
      // 'editorial-mono' theme too (stylesheet fallback keeps old browsers OK).
      if (style === 'bar') {
        const barHtml = `<div class="bb-prog-bar" data-field="value target style color useThresholds" style="background:color-mix(in srgb, currentColor 12%, transparent);"><div class="bb-prog-fill" style="width:${(clamped * 100).toFixed(1)}%;background:${escapeHtml(fill)};${animate ? '' : 'transition:none;'}"></div></div>
          ${showValue ? '<div class="bb-prog-value" data-field="value target unit showValue valueScale"><span data-cur></span><span data-unit></span> / <span data-tgt></span><span data-unit></span> · <span data-pct></span>%</div>' : ''}`;
        root.innerHTML = `${titleHtml}${labelBelow ? barHtml + labelHtml : labelHtml + barHtml}`;
      } else {
        const dash = style === 'gauge' ? `${ARC.toFixed(1)} ${C.toFixed(1)}` : C.toFixed(1);
        const ringHtml = `<div class="bb-prog-ringwrap" data-field="value target style color useThresholds">
            <svg class="bb-prog-ring" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-opacity=".15" stroke-width="9"${style === 'gauge' ? ` stroke-linecap="round" stroke-dasharray="${dash}" transform="rotate(${ROT} 50 50)"` : ''}/>
              <circle data-arc cx="50" cy="50" r="42" fill="none" stroke="${escapeHtml(fill)}" stroke-width="9" stroke-linecap="round"
                stroke-dasharray="${dash}" stroke-dashoffset="${(ARC * (1 - clamped)).toFixed(1)}" transform="rotate(${ROT} 50 50)"${animate ? ' style="transition:stroke-dashoffset .8s cubic-bezier(.22,1,.36,1),stroke .4s;"' : ''}/>
            </svg>
            <div class="bb-prog-ringtext"><div class="bb-prog-pct" data-field="value target valueScale"><span data-pct></span>%</div>${showValue ? '<div class="bb-prog-sub" data-field="value unit showValue valueScale"><span data-cur></span><span data-unit></span></div>' : ''}</div>
          </div>`;
        root.innerHTML = `${titleHtml}${labelBelow ? ringHtml + labelHtml : labelHtml + ringHtml}`;
      }
      labelEl = root.querySelector('.bb-prog-label');
      barFill = root.querySelector('.bb-prog-fill');
      arcFill = root.querySelector('[data-arc]');
      tgtEl = root.querySelector('[data-tgt]');
      curEls = [...root.querySelectorAll('[data-cur]')];
      pctEls = [...root.querySelectorAll('[data-pct]')];
      unitEls = [...root.querySelectorAll('[data-unit]')];
      setMeta(c.label ?? '', c.unit ?? '');
      if (tgtEl) tgtEl.textContent = fmtNum(t);
      setNums(v, t);
      shown = v;
      built = true;
    };

    // Move fill + numbers to (value, target). CSS transitions animate the bar
    // width / arc dashoffset; an eased rAF loop counts the value line up from
    // whatever was on screen. Idempotent per call — re-applies cleanly on
    // every live update.
    const apply = (value, target) => {
      const ratio = target > 0 ? value / target : 0;
      const clamped = Math.max(0, Math.min(1, ratio));
      const fill = fillFor(c, Math.round(ratio * 100));
      if (barFill) { barFill.style.width = (clamped * 100).toFixed(1) + '%'; barFill.style.background = fill; }
      if (arcFill) { arcFill.setAttribute('stroke-dashoffset', (ARC * (1 - clamped)).toFixed(1)); arcFill.setAttribute('stroke', fill); }
      if (tgtEl) tgtEl.textContent = fmtNum(target);
      const from = shown;
      shown = value;
      stopRaf();
      if (!animate || from === value) { setNums(value, target); return; }
      const t0 = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / 900);
        if (k >= 1) { setNums(value, target); rafId = 0; return; } // exact final value (no rounding drift)
        const eased = 1 - Math.pow(1 - k, 3);
        setNums(Math.round(from + (value - from) * eased), target);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    };

    // Editor hint / load-error note (player shows English; ctx.t is identity).
    const showNote = (msg) => {
      stopRaf();
      built = false;
      root.innerHTML = `${titleHtml}<div style="color:currentColor;opacity:.6;font-size:14px;padding:16px;text-align:center;">${escapeHtml(msg)}</div>`;
    };

    // --- data flow ----------------------------------------------------------
    const inlineValue = +c.value || 0;
    const inlineTarget = +c.target || 0;

    if (source === 'url' || source === 'stored') {
      const stored = source === 'stored';
      // Offline with nothing provisioned yet → neutral placeholder (the slide
      // re-renders once the bound slot is filled).
      if (stored && c._offline?.data === undefined) {
        showNote('Provided-offline — appears on the display after “Refresh data”.');
        return composeDispose(() => root.remove());
      }
      if (!stored && !String(c.dataUrl ?? '').trim()) {
        showNote('Add a JSON URL in the inspector.');
        return composeDispose(() => root.remove());
      }
      // Start empty; the first onData sweeps the fill in. 0 = fetch once; any
      // positive value polls, clamped UP to the 5 s player floor. maxErrors:0 +
      // backoff:false + stopOnCorsError:false = keep retrying on the fixed
      // interval and recover when the feed returns (same policy as kpi-cards).
      build(0, inlineTarget);
      const refreshSec = Math.max(0, Number(c.refreshSec) || 0);
      const stop = liveSource({
        url: c.dataUrl,
        signal: ctx?.signal,
        intervalMs: refreshSec > 0 ? Math.max(5000, refreshSec * 1000) : 0,
        fetchInit: { cache: 'no-store' },
        maxErrors: 0,
        backoff: false,
        stopOnCorsError: false,
        ...offlineLiveOpts(c),
        onData: (data) => {
          const d = parseLive(data, c); // throws → routed to onError
          if (!built) build(0, d.target); // recover the structure after an error note
          setMeta(d.label ?? c.label ?? '', d.unit ?? c.unit ?? '');
          apply(d.value, d.target);
        },
        onError: (e) => {
          if (ctx?.onError?.()) return;
          showNote('⚠️ ' + (e.message || 'Could not load progress data'));
        },
      });
      return composeDispose(() => { stop(); stopRaf(); root.remove(); });
    }

    // Inline: build at zero and sweep in (a committed initial style is needed
    // for the CSS transition to run — hence the forced reflow), or paint the
    // final state directly when animation is off.
    if (animate) {
      build(0, inlineTarget);
      root.getBoundingClientRect();
      apply(inlineValue, inlineTarget);
    } else {
      build(inlineValue, inlineTarget);
    }
    return composeDispose(() => { stopRaf(); root.remove(); });
  },
});
