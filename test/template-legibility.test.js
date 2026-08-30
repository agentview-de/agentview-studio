// Every template slide, rendered at its true design size, in both languages.
//
// The catalog is shipped design, and design regresses silently: someone adds a
// menu row, someone translates "Hours" as "Öffnungszeiten", someone bumps a
// theme's type scale — and a slide that used to fit now clips its last line on
// a wall nobody is standing in front of. None of that shows up in a schema
// check, and it is invisible in the editor at 40 % zoom.
//
// So this measures what actually lands on the glass:
//
//   FITS       no widget's content is taller or wider than the box it was
//              given. Checked in EN and DE, because German runs 10-30 % longer
//              and calibrating on English alone left eleven slides clipping.
//   READABLE   the largest piece of type on a slide is at least 4 % of the
//              slide height. Signage is read from across a room; 2 % is a
//              laptop size and was where most of the catalog started.
//
// Both numbers come from getComputedStyle and getBoundingClientRect on a real
// render, so this suite only runs in the browser, on its own page — the app's
// real stylesheets have to be loaded for any of it to mean anything.

import { test, describe } from './runner.js';
import '../shared/plugins/all.js';
import '../shared/templates/all.js';
import { listTemplates, buildSlides } from '../shared/templates/registry.js';
import { renderSlideThumb } from '../admin/ui/slide-thumb.js';

// The floor, not the target. The calibration aims far higher (the catalog's
// median hero is around 7 %); 4 % is the line below which a slide is not doing
// its job, and the densest legitimate content — a five-day canteen menu — sits
// just above it.
const MIN_HERO_PCT = 4;

// Widgets that render a stand-in rather than their content when offline. Their
// "hero" is the placeholder label, so measuring them measures nothing.
const NETWORK_TYPES = new Set(['weather', 'rss', 'news-photos', 'currency', 'image-gallery', 'audio-viz']);
// A chart draws its labels into SVG, which the leaf-text walk below does not see.
const UNMEASURABLE = new Set(['chart']);

let rig = null;
function rigHost() {
  if (!rig) {
    rig = document.createElement('div');
    // Off-screen but LAID OUT: display:none would collapse every box to zero
    // and the whole suite would pass without measuring anything.
    rig.style.cssText = 'position:fixed;left:-20000px;top:0;';
    document.body.appendChild(rig);
  }
  return rig;
}

// Elements that carry visible text and have no text-bearing element child.
function textLeaves(root) {
  const out = [];
  for (const el of root.querySelectorAll('*')) {
    if (!el.textContent || !el.textContent.trim()) continue;
    if ([...el.children].some(c => c.textContent && c.textContent.trim())) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 1 && r.height >= 1) out.push(el);
  }
  return out;
}

function measureSlide(tpl, slide) {
  const W = tpl.canvas?.w ?? 1920;
  const H = tpl.canvas?.h ?? 1080;
  const box = document.createElement('div');
  rigHost().appendChild(box);
  // width === the design width, so the stage renders at scale 1 and every
  // measurement below is in design pixels.
  const dispose = renderSlideThumb(box, slide, { canvas: tpl.canvas, defaults: tpl.defaults }, { width: W });
  const overflows = [];
  let hero = 0;
  for (const slot of box.querySelectorAll('.avs-thumb-slot')) {
    const inner = slot.querySelector('.bb-slide') ?? slot;
    const oy = inner.scrollHeight - inner.clientHeight;
    const ox = inner.scrollWidth - inner.clientWidth;
    // 2 px of slack: sub-pixel layout rounding, not a clipped line. The widget
    // ROOT only — scanning descendants flags every ellipsised label and every
    // marquee. A child that shrinks while its content does not is prevented at
    // the source instead (see opening-hours' `flex: 0 0 auto`), which surfaces
    // here as an ordinary root overflow.
    if (oy > 2 || ox > 2) overflows.push({ oy, ox, box: `${slot.offsetWidth}×${slot.offsetHeight}` });
    for (const el of textLeaves(slot)) {
      const fs = parseFloat(getComputedStyle(el).fontSize) || 0;
      if (fs > hero) hero = fs;
    }
  }
  dispose();
  box.remove();
  return { overflows, heroPct: (hero / H) * 100 };
}

const templates = listTemplates().filter(t => t.category !== 'blank');

// Runs FIRST, because every number below it is meaningless if this one is
// wrong. Text metrics are the measurement, and the measurement is only about
// the templates if the face is the one that ships.
//
// The trap is that `await document.fonts.ready` looks like it covers this and
// does not: the font set only tracks faces some laid-out text has already
// asked for, so on an empty page it is idle and the promise resolves at once.
// Everything then renders in the system fallback (`font-display: swap` paints
// in it first) and gets measured before the swap. That passed on a machine
// whose fallback happens to resemble Inter and reported five slides clipped on
// CI's Linux runner, every one of them horizontally, because DejaVu Sans is
// wider. fontsLoaded() in the page bootstrap loads the faces up front; this
// fails loudly if that ever stops working, instead of quietly measuring a
// different font than the displays will use.
describe('templates · the measurement uses the shipped faces', () => {
  test('Inter and Inter Tight are loaded, not swapped in later', () => {
    const missing = ['400 48px "Inter"', '800 48px "Inter Tight"']
      .filter(spec => !document.fonts.check(spec));
    if (missing.length) {
      throw new Error(
        `web font not loaded: ${missing.join(', ')} — every size below would be `
        + 'the system fallback\'s, not the shipped face\'s');
    }
  });
});

describe('templates · nothing is clipped, in either language', () => {
  for (const lang of ['en', 'de']) {
    test(`every slide fits its widgets (${lang})`, () => {
      const bad = [];
      for (const tpl of templates) {
        buildSlides(tpl, { lang }).forEach((slide, i) => {
          for (const o of measureSlide(tpl, slide).overflows) {
            bad.push(`${tpl.id}#${i + 1} "${slide.name ?? ''}" overflows by ${Math.round(o.oy)}×${Math.round(o.ox)} px in a ${o.box} box`);
          }
        });
      }
      if (bad.length) throw new Error(`${bad.length} clipped widget(s):\n  ` + bad.join('\n  '));
    });
  }
});

describe('templates · the ticker fits its own bar', () => {
  // A ticker cannot be caught by the overflow check above: both its root and
  // its bar are overflow:hidden, so text too large for the strip is CLIPPED
  // and scrollHeight never exceeds clientHeight. The catalog spent a while in
  // exactly that state — every ticker at textScale 270, sliced top and bottom,
  // and nothing measuring it. Compare the type against the bar instead.
  test('no ticker sets type taller than the strip it runs in', () => {
    const bad = [];
    for (const tpl of templates) {
      for (const lang of ['en', 'de']) {
        buildSlides(tpl, { lang }).forEach((slide, i) => {
          if (!(slide.widgets ?? []).some(w => w.type === 'ticker')) return;
          const box = document.createElement('div');
          rigHost().appendChild(box);
          const dispose = renderSlideThumb(box, slide, { canvas: tpl.canvas, defaults: tpl.defaults },
            { width: tpl.canvas?.w ?? 1920 });
          for (const root of box.querySelectorAll('.bb-slide-ticker')) {
            const bar = root.firstElementChild;
            const line = bar && bar.querySelector('span');
            if (!bar || !line) continue;
            const fs = parseFloat(getComputedStyle(line).fontSize) || 0;
            // line-height is 1, so the glyph box IS the font size. 80 % leaves
            // room for descenders and the strip's own padding.
            const pct = (fs / Math.max(1, bar.offsetHeight)) * 100;
            if (pct > 80) bad.push(`${tpl.id}#${i + 1} (${lang}): type is ${pct.toFixed(0)}% of a ${bar.offsetHeight}px bar`);
          }
          dispose();
          box.remove();
        });
      }
    }
    if (bad.length) throw new Error(`${bad.length} clipped ticker(s):\n  ` + bad.join('\n  '));
  });
});

describe('templates · readable from across the room', () => {
  test(`the largest type on every slide is at least ${MIN_HERO_PCT}% of the slide height`, () => {
    const bad = [];
    for (const tpl of templates) {
      // BOTH languages, like the clipping check above. This ran English-only
      // and that was a hole rather than a saving: several widgets fit their
      // type to their content (a menu drops a size when a dish name wraps, a
      // table when a cell does), so the rendered size is language-dependent
      // even though textScale is not. German runs 10-30 % longer, so German is
      // where a slide goes quiet first.
      for (const lang of ['en', 'de']) {
        buildSlides(tpl, { lang }).forEach((slide, i) => {
          const types = (slide.widgets ?? []).map(w => w.type);
          // A slide made only of offline stand-ins has nothing of its own to measure.
          if (types.every(t => NETWORK_TYPES.has(t) || UNMEASURABLE.has(t))) return;
          const { heroPct } = measureSlide(tpl, slide);
          if (heroPct < MIN_HERO_PCT) {
            bad.push(`${tpl.id}#${i + 1} (${lang}) "${slide.name ?? ''}" tops out at ${heroPct.toFixed(2)}% [${types.join('+')}]`);
          }
        });
      }
    }
    if (bad.length) throw new Error(`${bad.length} slide(s) too timid:\n  ` + bad.join('\n  '));
  });
});
