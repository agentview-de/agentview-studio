// Duration field — stored as seconds, shown as s with m:ss hint above 60s.

import { t } from '../../i18n.js';
import { h } from './_shared.js';

export function renderDuration(f, v, set) {
  const wrap = h('div', 'bb-duration');
  const input = h('input');
  input.type = 'number';
  input.min = f.min ?? 1;
  if (f.max != null) input.max = f.max;
  input.value = v ?? f.default ?? 5;
  const unit = h('span', 'bb-duration-unit', t('field.seconds'));
  const hint = h('span', 'bb-duration-hint');
  const updateHint = () => {
    const s = +input.value || 0;
    hint.textContent = s >= 60 ? `≈ ${Math.floor(s / 60)}m ${s % 60}s` : '';
  };
  input.addEventListener('input', () => { updateHint(); set(input.value === '' ? null : +input.value); });
  updateHint();
  wrap.append(input, unit, hint);
  return { el: wrap };
}
