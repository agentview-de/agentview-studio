// Widget render host — the ONE per-widget lifecycle shared by the editor canvas
// (mode 'preview') and the live player (mode 'live').
//
// Both used to hand-roll the same spine: look up the plugin, render a "Unknown
// widget" box if it's missing, otherwise run plugin.render() under a fresh
// AbortController inside try/catch and hand back a dispose() that aborts the
// signal and runs the plugin's own teardown. The two copies had drifted (error
// policy, ctx shape). Routing both through mountWidget() makes the README's
// "admin previews and the live player call the SAME plugin render()" literally
// true and gives the lifecycle a single, testable home.
//
// NOTE on what this does NOT do: slide-level concerns — variant resolution, slot
// bindings, the slot/loop/build DOM, dispose collection (a Map in the canvas, an
// array in the player) — stay in each caller, because they legitimately differ.
// This seam is exactly the per-widget render lifecycle and nothing more.

import { get as getPlugin } from './plugins/registry.js';
import { widgetAsSlide } from './slide-schema.js';

// Mount one widget into `container`. ctx carries the caller-controlled fields the
// plugin contract defines — { mode, t?, onError? } — and mountWidget injects a
// fresh `signal`. onError is BOTH passed to the plugin (so a plugin can trigger
// the host's error fallback at runtime) AND called if render() throws
// synchronously, mirroring the player's previous behaviour. Returns dispose():
// idempotent, aborts the signal and runs the plugin's teardown once.
//
// `pluginLookup` is injectable purely so the lifecycle is unit-testable without
// the global registry (test/widget-host.test.js); callers never pass it.
export function mountWidget(widget, slide, container, ctx = {}, pluginLookup = getPlugin) {
  const plugin = pluginLookup(widget.type);
  if (!plugin) {
    container.innerHTML = `<div class="bb-missing">Unknown widget: ${widget.type}</div>`;
    return () => {};
  }
  const ctrl = new AbortController();
  let fn = () => {};
  try {
    fn = plugin.render(widgetAsSlide(widget, slide), container, { ...ctx, signal: ctrl.signal }) ?? (() => {});
  } catch (e) {
    console.warn('widget render failed', widget.type, e);
    ctx.onError?.();
  }
  return () => { ctrl.abort(); try { fn(); } catch {} };
}
