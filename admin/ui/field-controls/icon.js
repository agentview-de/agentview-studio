// Icon SVG picker — visual variant of a select for inline SVG keys.

import { ICON_IDS, iconSvg, iconLabel } from '../../../shared/data/icons.js';
import { h } from './_shared.js';

export function renderIcon(f, v, set) {
  const ids = (Array.isArray(f.options) && f.options.length ? f.options : ICON_IDS);
  const grid = h('div', 'bb-icon-grid');
  let current = v ?? ids[0];
  const draw = () => {
    grid.innerHTML = '';
    ids.forEach(id => {
      const btn = h('button', 'bb-icon-sw' + (id === current ? ' bb-sel' : ''));
      btn.type = 'button';
      btn.title = iconLabel(id);
      btn.innerHTML = `<span class="bb-icon-glyph">${iconSvg(id)}</span>`;
      btn.addEventListener('click', () => { current = id; set(id); draw(); });
      grid.append(btn);
    });
  };
  draw();
  return { el: grid };
}
