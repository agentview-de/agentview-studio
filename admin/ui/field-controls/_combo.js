// Searchable combobox — shared by timezone and currency pickers. Pure DOM,
// no business logic; takes options + value + callbacks.

import { t } from '../../i18n.js';
import { h, esc } from './_shared.js';

// options: [{ value, label, hint? }]. Returns { el }.
export function searchableSelect({ options, value, placeholder, onChange }) {
  const wrap = h('div', 'bb-combo');
  const input = h('input');
  input.type = 'text';
  input.placeholder = placeholder ?? '';
  input.setAttribute('role', 'combobox');
  const menu = h('div', 'bb-combo-menu');
  menu.hidden = true;
  wrap.append(input, menu);

  const byValue = new Map(options.map(o => [o.value, o]));
  const labelFor = v => byValue.get(v)?.label ?? v ?? '';
  let current = value;
  input.value = labelFor(current);

  const renderMenu = (filter = '') => {
    const q = filter.trim().toLowerCase();
    const matches = options.filter(o =>
      !q || o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q));
    menu.innerHTML = matches.slice(0, 60).map(o =>
      `<div class="bb-combo-opt${o.value === current ? ' bb-sel' : ''}" data-v="${esc(o.value)}">
         <span>${esc(o.label)}</span>${o.hint ? `<span class="bb-combo-hint">${esc(o.hint)}</span>` : ''}
       </div>`).join('') || `<div class="bb-combo-empty">${esc(t('field.noMatch'))}</div>`;
  };
  const open = () => { renderMenu(''); menu.hidden = false; input.select(); };
  const close = () => { menu.hidden = true; input.value = labelFor(current); };

  input.addEventListener('focus', open);
  input.addEventListener('input', () => renderMenu(input.value));
  input.addEventListener('blur', () => setTimeout(close, 150));
  menu.addEventListener('mousedown', e => {
    const opt = e.target.closest('.bb-combo-opt');
    if (!opt) return;
    e.preventDefault();
    current = opt.dataset.v;
    input.value = labelFor(current);
    menu.hidden = true;
    onChange(current);
  });
  return { el: wrap };
}
