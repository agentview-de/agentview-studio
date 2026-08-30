// Shape picker — a grouped visual grid over shared/data/shapes.js.
//
// Deliberately NOT the icon picker with a different data source: the shape set
// is small enough to eyeball but splits into meaningful families (basic ·
// arrows · stars · callouts · lines), and a flat 40-tile grid buries the lines
// under the stars. Group headings keep the whole catalog on screen with no
// search box to type into.

import { SHAPES, SHAPE_GROUPS, shapePreviewSvg, resolveShape } from '../../../shared/data/shapes.js';
import { tx } from '../../i18n.js';
import { h } from './_shared.js';

export function renderShape(f, v, set) {
  const wrap = h('div', 'bb-shape-field');
  let current = resolveShape(v);

  const draw = () => {
    wrap.innerHTML = '';
    for (const g of SHAPE_GROUPS) {
      const ids = Object.keys(SHAPES).filter(id => SHAPES[id].group === g.id);
      if (!ids.length) continue;
      wrap.append(h('div', 'bb-shape-group-label', tx(g.label)));
      const grid = h('div', 'bb-shape-grid');
      for (const id of ids) {
        const def = SHAPES[id];
        const btn = h('button', 'bb-shape-sw' + (id === current ? ' bb-sel' : ''));
        btn.type = 'button';
        btn.title = tx(def.label);
        btn.setAttribute('aria-label', tx(def.label));
        btn.setAttribute('aria-pressed', String(id === current));
        btn.innerHTML = `<span class="bb-shape-glyph">${shapePreviewSvg(id, 22)}</span>`;
        btn.addEventListener('click', () => { current = id; set(id); draw(); });
        grid.append(btn);
      }
      wrap.append(grid);
    }
  };
  draw();
  return { el: wrap };
}
