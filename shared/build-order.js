// Build order — the sequence a slide's entrance animations play in.
//
// The schema already carries everything needed: each widget's `anim.delay` says
// when its build starts. What was missing is the ability to SEE that as an order
// and change it, which on a slide with six builds means reading six delays out
// of six separate inspectors and doing the arithmetic yourself.
//
// So this file owns the two pure operations an animation pane needs — read the
// order out of the delays, and write a new order back into them — and nothing
// else. The panel is DOM; this is the part worth testing.

import { BUILD_DEFAULT_MS } from './animations.js';

// The default gap between one build starting and the next. 200 ms is long
// enough that two builds read as sequential rather than simultaneous, and short
// enough that six of them still finish inside a typical slide duration.
export const BUILD_STEP_MS = 200;
export const BUILD_STEP_MIN = 0;
export const BUILD_STEP_MAX = 5000;

const delayOf = w => {
  const d = Number(w?.anim?.delay);
  return Number.isFinite(d) && d >= 0 ? d : 0;
};

export const hasBuild = w => !!w?.anim?.type && w.anim.type !== 'none';

/**
 * The widgets in the order their builds actually play.
 *
 * Sorted by delay, then by z, then by the array order. The tie-breakers matter:
 * the common case is that NOTHING has a delay yet (every build fires at 0), and
 * an order that came back arbitrary would make the pane look broken before the
 * user had done anything wrong. Falling back to z means the list opens in the
 * order the widgets are stacked, which is at least a reason.
 */
export function buildOrder(widgets) {
  return (widgets ?? []).map((w, i) => ({ w, i }))
    .sort((a, b) =>
      delayOf(a.w) - delayOf(b.w)
      || (a.w.z ?? 0) - (b.w.z ?? 0)
      || a.i - b.i)
    .map(x => x.w);
}

/**
 * The delay each id should carry to play in the given order.
 *
 * Returns a Map so the caller can apply it to whichever widgets it holds. Only
 * widgets that HAVE a build get a delay: stamping one onto a widget with no
 * animation would write a field that does nothing, and the next reader would
 * reasonably think it did.
 */
export function restampDelays(orderedWidgets, step = BUILD_STEP_MS) {
  // `null` and `''` coerce to 0, and 0 is a LEGITIMATE step ("play them all at
  // once") — so a plain `+step` guard cannot tell "no value given" from "the
  // user asked for simultaneous", and silently turned the first into the
  // second. They are separated before the number is read.
  const given = step === null || step === undefined || step === '' ? NaN : Number(step);
  const s = Number.isFinite(given) && given >= BUILD_STEP_MIN
    ? Math.min(BUILD_STEP_MAX, given)
    : BUILD_STEP_MS;
  const out = new Map();
  let n = 0;
  for (const w of orderedWidgets ?? []) {
    if (!w || !hasBuild(w)) continue;
    out.set(w.id, Math.round(n * s));
    n += 1;
  }
  return out;
}

/**
 * When the last build has finished, in ms. What the pane shows so somebody can
 * tell at a glance that a six-step sequence outlasts a 5-second slide.
 */
export function sequenceEndMs(widgets) {
  let end = 0;
  for (const w of widgets ?? []) {
    if (!hasBuild(w)) continue;
    const dur = Number(w.anim.duration);
    end = Math.max(end, delayOf(w) + (Number.isFinite(dur) && dur > 0 ? dur : BUILD_DEFAULT_MS));
  }
  return end;
}
