import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';

const C = 2 * Math.PI * 42; // ring circumference (r=42 in a 100×100 viewBox)

export default register({
  type: 'progress',
  label: 'Progress / Goal',
  group: 'data',
  icon: '🎯',
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(),
    label: 'Fundraising goal',
    value: 6800, target: 10000, unit: '€',
    style: 'bar', showValue: true,
    color: '#10b981',
    useThresholds: false,
    thresholdWarn: 70, thresholdGood: 90,
    colorLow: '#ef4444', colorMid: '#f59e0b', colorHigh: '#10b981',
    theme: 'minimal-dark',
  }),
  schema: () => ({
    fields: [
      { type: 'section', label: 'Value' },
      { key: 'label', type: 'text', label: 'Label' },
      { type: 'row', children: [
        { key: 'value',  type: 'number', label: 'Current' },
        { key: 'target', type: 'number', label: 'Target' },
      ] },
      { key: 'unit', type: 'text', label: 'Unit / suffix', placeholder: '€, %, sign-ups…' },

      { type: 'section', label: 'Appearance' },
      { type: 'row', children: [
        { key: 'style', type: 'select', label: 'Style', options: ['bar', 'ring'] },
        { key: 'showValue', type: 'toggle', label: 'Show value' },
      ] },
      { key: 'color', type: 'color', label: 'Fill colour',
        showIf: c => !c.useThresholds },

      { type: 'section', label: 'Threshold colours' },
      { key: 'useThresholds', type: 'toggle', label: 'Use threshold colours',
        help: 'Fill colour switches between low / mid / high based on percentage, useful for KPI-style bars where colour signals status.' },
      { type: 'row', children: [
        { key: 'colorLow',  type: 'color', label: 'Low' },
        { key: 'colorMid',  type: 'color', label: 'Mid' },
        { key: 'colorHigh', type: 'color', label: 'High' },
      ], showIf: c => !!c.useThresholds },
      { type: 'row', children: [
        { key: 'thresholdWarn', type: 'number', label: 'Warn at %', min: 0, max: 100, step: 5, slider: true },
        { key: 'thresholdGood', type: 'number', label: 'Good at %', min: 0, max: 100, step: 5, slider: true },
      ], showIf: c => !!c.useThresholds },

      { type: 'section', label: 'Theme' },
      themeField(),
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const value = +c.value || 0;
    const target = +c.target || 0;
    const ratio = target > 0 ? value / target : 0;
    const clamped = Math.max(0, Math.min(1, ratio));
    const pct = Math.round(ratio * 100);
    const unit = c.unit ?? '';
    // Threshold-based fill: classic KPI traffic-light. Default thresholds
    // (warn=70%, good=90%) match common dashboard conventions; user can
    // override either edge. When disabled, the single `color` field wins.
    let fill;
    if (c.useThresholds) {
      const warn = Number(c.thresholdWarn ?? 70);
      const good = Number(c.thresholdGood ?? 90);
      const p = pct;
      fill = p >= good ? (c.colorHigh || '#10b981')
           : p >= warn ? (c.colorMid  || '#f59e0b')
           :             (c.colorLow  || '#ef4444');
    } else {
      fill = c.color || 'var(--bb-st-accent, #8b5cf6)';
    }
    const fmtNum = n => n.toLocaleString();
    const valueLine = c.showValue !== false
      ? `<div class="bb-prog-value">${escapeHtml(fmtNum(value) + unit)} / ${escapeHtml(fmtNum(target) + unit)} · ${pct}%</div>` : '';

    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-progress bb-prog-${c.style ?? 'bar'} bb-theme-${c.theme ?? 'minimal-dark'}`;
    root.style.cssText += 'container-type:size;width:100%;height:100%;background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.5em;';

    if ((c.style ?? 'bar') === 'ring') {
      root.innerHTML = `
        ${c.label ? `<div class="bb-prog-label">${escapeHtml(c.label)}</div>` : ''}
        <div class="bb-prog-ringwrap">
          <svg class="bb-prog-ring" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="9"/>
            <circle cx="50" cy="50" r="42" fill="none" stroke="${fill}" stroke-width="9" stroke-linecap="round"
              stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - clamped)).toFixed(1)}" transform="rotate(-90 50 50)"/>
          </svg>
          <div class="bb-prog-ringtext"><div class="bb-prog-pct">${pct}%</div>${c.showValue !== false ? `<div class="bb-prog-sub">${escapeHtml(fmtNum(value) + unit)}</div>` : ''}</div>
        </div>`;
    } else {
      root.innerHTML = `
        ${c.label ? `<div class="bb-prog-label">${escapeHtml(c.label)}</div>` : ''}
        <div class="bb-prog-bar"><div class="bb-prog-fill" style="width:${(clamped * 100).toFixed(1)}%;background:${fill};"></div></div>
        ${valueLine}`;
    }
    container.appendChild(root);
    return composeDispose(() => root.remove());
  },
});

