// Theme swatch picker — visual variant of a select for theme keys.

import { THEME_SWATCHES, ALL_THEMES, themeLabel } from '../../../shared/data/themes.js';
import { h, esc } from './_shared.js';

export function renderTheme(f, v, set) {
  const ids = (Array.isArray(f.options) && f.options.length ? f.options : ALL_THEMES)
    .map(o => (typeof o === 'string' ? o : o.value));
  const grid = h('div', 'bb-theme-grid');
  let current = v ?? ids[0];
  const draw = () => {
    grid.innerHTML = '';
    ids.forEach(id => {
      const sw = THEME_SWATCHES[id] ?? { bg: '#222', accent: '#888' };
      const btn = h('button', 'bb-theme-sw' + (id === current ? ' bb-sel' : ''));
      btn.type = 'button';
      btn.title = themeLabel(id);
      btn.innerHTML = `<span class="bb-theme-chip" style="background:${sw.bg};">
          <span class="bb-theme-dot" style="background:${sw.accent};"></span>
        </span><span class="bb-theme-name">${esc(themeLabel(id))}</span>`;
      btn.addEventListener('click', () => { current = id; set(id); draw(); });
      grid.append(btn);
    });
  };
  draw();
  return { el: grid };
}
