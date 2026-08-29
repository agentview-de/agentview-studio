// Colours that a <canvas> will actually accept.
//
// `ctx.fillStyle = 'blau'` is silently ignored — the previous colour stays. But
// `gradient.addColorStop(0, 'blau')` THROWS a DOMException, and the two widgets
// that paint gradients (audio-viz, chart) hand it operator input straight from
// a config field:
//
//     const colorA = c.colorA || '#8b5cf6';        // guards empty, not invalid
//     grad.addColorStop(0, colorA);                // ← throws for '#12345'
//
// The throw lands inside an animation frame, i.e. outside the plugin's own
// try/catch and outside mountWidget's: the draw loop dies and the widget stays
// blank for the rest of the day. It does not take an attacker — `FF00FF`
// (Office's hex, no '#'), a half-typed `#12`, a German colour name, or a
// whitespace-only field all do it, and an importer can produce the first.
//
// The ground truth is the browser's own parser, so we ASK it rather than
// maintaining a syntax list: a throwaway gradient accepts exactly what the real
// one will. Two caveats it settles that a regex would get wrong — `currentColor`
// works on a canvas, and `var(--x)` does NOT (there is no element for the custom
// property to resolve against) even though CSS.supports() says yes.

// Fallback for environments with no DOM (the headless test run). Deliberately
// conservative: it accepts the forms the widgets actually store, and rejects
// everything it is unsure about, which is the safe direction — a wrong "no"
// costs a fallback colour, a wrong "yes" costs the draw loop.
const NAMED = new Set([
  'transparent', 'currentcolor', 'black', 'silver', 'gray', 'grey', 'white', 'maroon',
  'red', 'purple', 'fuchsia', 'green', 'lime', 'olive', 'yellow', 'navy', 'blue',
  'teal', 'aqua', 'cyan', 'magenta', 'orange',
]);
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(([^;]*)\)$/i;
// rgb()/hsl() and friends need three components; `rgb(12,34)` is the shape a
// half-finished field or a sloppy import produces, and the browser rejects it —
// so the fallback has to as well, or the headless run disagrees with reality.
const TRIPLE = /^(?:rgba?|hsla?|hwb)\(/i;

function looksLikeColor(value) {
  const v = value.trim();
  if (HEX.test(v) || NAMED.has(v.toLowerCase())) return true;
  const fn = FUNCTIONAL.exec(v);
  if (!fn) return false;
  if (!TRIPLE.test(v)) return true;         // lab/oklch/color-mix — not second-guessed here
  return fn[1].split(/[,/\s]+/).filter(Boolean).length >= 3;
}

let _ctx;
function canvasAccepts(value) {
  try {
    if (_ctx === undefined) {
      _ctx = (typeof document !== 'undefined' && document.createElement('canvas').getContext('2d')) || null;
    }
    if (!_ctx) return looksLikeColor(value);
    // A fresh gradient per call: a shared one would accumulate every colour
    // ever tested as a real stop.
    _ctx.createLinearGradient(0, 0, 1, 1).addColorStop(0, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {unknown} value      a colour from widget config, brand kit or an import
 * @param {string}  fallback   a literal the caller knows is good (its default)
 * @returns {string} `value` when a canvas can paint with it, `fallback` otherwise.
 */
export function canvasColor(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  // A canvas has no element to resolve custom properties against, so var() is
  // a throw waiting to happen — and CSS.supports() would wave it through.
  if (/var\(/i.test(value)) return fallback;
  return canvasAccepts(value) ? value : fallback;
}

/**
 * The transparent end of a fade.
 *
 * Appending '00' to a colour only works for a 6-digit hex — the trick audio-viz
 * used, with a comment admitting the assumption. `'red' + '00'` throws, and so
 * does any functional notation. Everything else fades to `transparent`, which
 * is what the gradient meant in the first place.
 */
export function fadeToTransparent(color) {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color.trim())
    ? color.trim() + '00'
    : 'transparent';
}
