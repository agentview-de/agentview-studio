// Alignment picker — a 3-button segmented row instead of a dropdown, because
// alignment is a one-glance, one-click choice. Stores plain strings
// ('left'|'center'|'right', or 'top'|'middle'|'bottom' with `vertical: true`),
// so it is drop-in compatible with existing select-based align fields.

import { tx } from '../../i18n.js';
import { h } from './_shared.js';

// Three bars aligned to one side — the classic text-align glyph, drawn as an
// inline SVG so it follows currentColor (theme-safe, no emoji rendering drift).
function barsSvg(pos, vertical) {
  // Bar lengths long/short/medium; x (or y) offset per alignment.
  const bars = vertical
    ? { top: [2, 5, 8], middle: [7, 10, 13], bottom: [12, 15, 18] }[pos]
        .map((y, i) => `<rect x="${[2, 5, 3.5][i]}" y="${y}" width="${[16, 10, 13][i]}" height="2" rx="1"/>`)
    : [2, 7, 12].map((y, i) => {
      const w = [16, 10, 13][i];
      const x = pos === 'left' ? 2 : pos === 'right' ? 18 - w : (20 - w) / 2;
      return `<rect x="${x}" y="${y + 2}" width="${w}" height="2" rx="1"/>`;
    });
  return `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">${bars.join('')}</svg>`;
}

export function renderAlign(f, v, set) {
  const vertical = !!f.vertical;
  const opts = vertical
    ? [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']]
    : [['left', 'Left'], ['center', 'Center'], ['right', 'Right']];
  const wrap = h('div', 'bb-seg bb-align-field');
  let current = v ?? (vertical ? 'middle' : 'center');
  const paint = () => {
    for (const b of wrap.children) {
      const on = b.dataset.v === current;
      b.classList.toggle('bb-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };
  for (const [val, label] of opts) {
    const btn = h('button', 'bb-seg-btn');
    btn.type = 'button';
    btn.dataset.v = val;
    btn.title = tx(label);
    btn.setAttribute('aria-label', tx(label));
    btn.innerHTML = barsSvg(val, vertical);
    btn.addEventListener('click', () => { current = val; paint(); set(val); });
    wrap.appendChild(btn);
  }
  paint();
  return { el: wrap };
}
