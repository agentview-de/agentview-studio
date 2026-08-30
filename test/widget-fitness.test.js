// Every registered widget, mounted with its OWN defaults, at the box sizes a
// user actually drops it into.
//
// The bar is deliberately low and absolute: a widget you have just dragged onto
// a slide, before typing a single character, must not already be broken. Two
// ways it was:
//
//   FITS      kpi-cards overflowed its box by 139 px in a quarter tile, menu by
//             108 and world-clock by 49 — and `.bb-slide` is overflow:hidden, so
//             the last card was simply gone with nothing to say it had been
//             there. The QR code claimed 90 % of the height for itself and
//             pushed its own caption out of the bottom.
//   READABLE  a widget that paints its own badge owns that badge's contrast.
//             The menu's dietary tags were white on mid-green and mid-amber —
//             3.3:1 and 2.1:1, i.e. allergen information nobody can read.
//
// Both are measured on a real render (this suite is browser-only, on a page
// that loads the app's stylesheets — the type sizes only exist there).

import { test, describe } from './runner.js';
import '../shared/plugins/all.js';
import { list as listPlugins } from '../shared/plugins/registry.js';
import { createSlide, createWidget } from '../shared/slide-schema.js';
import { renderSlideThumb } from '../admin/ui/slide-thumb.js';

const W = 1920, H = 1080;
// A quarter tile and a half slide. Anything smaller than the quarter is a
// deliberately tiny composition; anything bigger only has more room.
const BOXES = [
  { name: 'quarter tile', rect: { x: 4, y: 4, w: 30, h: 22 } },
  { name: 'half slide',   rect: { x: 4, y: 4, w: 60, h: 45 } },
];
const MIN_CONTRAST = 4.5;   // WCAG AA for body text

let rig = null;
function rigHost() {
  if (!rig) {
    rig = document.createElement('div');
    // Off-screen but LAID OUT — display:none collapses every box to zero and
    // the whole suite would pass without measuring anything.
    rig.style.cssText = 'position:fixed;left:-20000px;top:0;';
    document.body.appendChild(rig);
  }
  return rig;
}

const luminance = (hex) => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const ch = i => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
};
// Only fully opaque colours are a reliable ground to measure against.
const toHex = (rgb) => {
  const m = String(rgb).match(/[\d.]+/g);
  if (!m || m.length < 3) return null;
  if (m.length > 3 && Number(m[3]) < 0.95) return null;
  return '#' + m.slice(0, 3).map(n => Math.round(+n).toString(16).padStart(2, '0')).join('');
};
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

function textLeaves(root) {
  const out = [];
  for (const el of root.querySelectorAll('*')) {
    if (!el.textContent || !el.textContent.trim()) continue;
    if ([...el.children].some(c => c.textContent && c.textContent.trim())) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 2 && r.height >= 2) out.push(el);
  }
  return out;
}

function mount(plugin, rect) {
  const w = createWidget(plugin.type, { rect });
  // What dropping the widget on the canvas actually produces.
  w.content = plugin.defaults();
  const box = document.createElement('div');
  rigHost().appendChild(box);
  const dispose = renderSlideThumb(box, createSlide({ theme: 'minimal-dark', widgets: [w] }),
    { canvas: { w: W, h: H } }, { width: W });
  return { box, dispose, slot: box.querySelector('.avs-thumb-slot') };
}

const plugins = listPlugins();

describe('widgets · a freshly dropped widget fits its box', () => {
  for (const b of BOXES) {
    test(`no widget overflows a ${b.name} on its own defaults`, () => {
      const bad = [];
      for (const plugin of plugins) {
        const m = mount(plugin, b.rect);
        const inner = m.slot.querySelector('.bb-slide') ?? m.slot;
        const oy = inner.scrollHeight - inner.clientHeight;
        const ox = inner.scrollWidth - inner.clientWidth;
        // 2 px of slack for sub-pixel layout rounding.
        if (oy > 2 || ox > 2) {
          bad.push(`${plugin.type} overflows by ${Math.round(oy)}×${Math.round(ox)} px in ${m.slot.offsetWidth}×${m.slot.offsetHeight}`);
        }
        m.dispose();
        m.box.remove();
      }
      if (bad.length) throw new Error(`${bad.length} widget(s) do not fit:\n  ` + bad.join('\n  '));
    });
  }
});

describe('widgets · text on a widget’s own background is readable', () => {
  test(`every self-painted ground clears ${MIN_CONTRAST}:1`, () => {
    const bad = [];
    for (const plugin of plugins) {
      const m = mount(plugin, BOXES[1].rect);
      for (const el of textLeaves(m.slot)) {
        // The nearest ancestor that paints an opaque colour. A gradient or an
        // image is unknowable from here, and a transparent chain means the
        // SLIDE is the ground — the slide's business, not the widget's.
        let ground = null;
        for (let p = el; p && p !== m.slot.parentElement; p = p.parentElement) {
          const cs = getComputedStyle(p);
          const hex = toHex(cs.backgroundColor);
          if (hex) { ground = hex; break; }
          if (cs.backgroundImage !== 'none') break;
        }
        if (!ground) continue;
        const lf = luminance(toHex(getComputedStyle(el).color));
        const lb = luminance(ground);
        if (lf == null || lb == null) continue;
        const c = ratio(lf, lb);
        if (c < MIN_CONTRAST) {
          bad.push(`${plugin.type}: "${el.textContent.trim().slice(0, 20)}" is ${c.toFixed(2)}:1 on ${ground}`);
        }
      }
      m.dispose();
      m.box.remove();
    }
    if (bad.length) throw new Error(`${bad.length} unreadable element(s):\n  ` + bad.join('\n  '));
  });
});
