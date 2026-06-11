// Icon SVG picker — visual variant of a select for inline SVG keys.

import { ICON_IDS, iconSvg, iconLabel } from '../../../shared/data/icons.js';
import { tx } from '../../i18n.js';
import { h } from './_shared.js';

// Above this many icons the grid gets a search input. Smaller curated sets
// stay scannable at a glance and don't need the extra row.
const SEARCH_THRESHOLD = 24;

export function renderIcon(f, v, set) {
  const ids = (Array.isArray(f.options) && f.options.length ? f.options : ICON_IDS)
    .map(o => (typeof o === 'string' ? o : o.value));
  const wrap = h('div', 'bb-icon-field');
  const grid = h('div', 'bb-icon-grid');
  let current = v ?? ids[0];
  let query = '';
  const draw = () => {
    grid.innerHTML = '';
    const q = query.trim().toLowerCase();
    const shown = q
      ? ids.filter(id => id.toLowerCase().includes(q) || iconLabel(id).toLowerCase().includes(q))
      : ids;
    shown.forEach(id => {
      const btn = h('button', 'bb-icon-sw' + (id === current ? ' bb-sel' : ''));
      btn.type = 'button';
      btn.title = iconLabel(id);
      btn.innerHTML = `<span class="bb-icon-glyph">${iconSvg(id)}</span>`;
      btn.addEventListener('click', () => { current = id; set(id); draw(); });
      grid.append(btn);
    });
    if (!shown.length) {
      const empty = h('div', 'bb-combo-empty', tx('No icons match'));
      empty.style.gridColumn = '1 / -1';
      grid.append(empty);
    }
  };
  // Filter input — matches id and label, case-insensitive. Only rendered for
  // large icon sets where eyeballing the whole grid stops being practical.
  if (ids.length > SEARCH_THRESHOLD) {
    const search = h('input');
    search.type = 'search';
    search.placeholder = tx('Search icons…');
    search.setAttribute('aria-label', tx('Search icons…'));
    search.style.marginBottom = '6px';
    search.addEventListener('input', () => { query = search.value; draw(); });
    wrap.append(search);
  }
  wrap.append(grid);
  draw();
  return { el: wrap };
}
