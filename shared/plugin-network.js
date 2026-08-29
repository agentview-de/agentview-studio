// Does THIS widget, as configured, reach the network?
//
// The editor holds network widgets behind a click-to-load placeholder so that
// building a slide never sends the device's IP to a third party unasked
// (admin/canvas/live-preview.js). The gate reads one flag on the plugin —
// `network: true` — and a plain boolean gets it wrong in both directions:
//
//   TOO LOOSE.  Five widgets fetch and never said so. `calendar` calls
//               fetch(icsUrl) against a user-supplied calendar server;
//               `markdown` polls a remote sourceUrl through liveSource; and
//               `menu`, `quote` and `qr-code` each load a remote <img> — a
//               dish photo, a portrait, a logo — which hands the host the IP,
//               the user agent and the referrer just the same. The gate's own
//               comment promises "nothing is fetched until asked".
//
//   TOO TIGHT.  A chart with INLINE data makes no request at all, and was
//               gated anyway: you could not see your own numbers while editing
//               without granting a "live preview" that was never live. The
//               same for kpi-cards, data-table, progress and live-json.
//
// So `network` may also be a predicate over the widget's content. A boolean
// still means what it always did, so nothing that already declared one has to
// change unless it wants to.

/** Remote = leaves this machine. A data: URI or a relative path does not. */
export function isRemoteUrl(v) {
  const s = String(v ?? '').trim();
  if (!s) return false;
  return /^(https?:)?\/\//i.test(s);
}

/** True when any of the given content values is a remote URL. */
export function anyRemote(...values) {
  return values.some(v => (Array.isArray(v) ? v.some(isRemoteUrl) : isRemoteUrl(v)));
}

/**
 * Would mounting this widget with this content touch the network?
 *
 * @param {object} plugin   the registered plugin
 * @param {object} content  widget.content
 * @returns {boolean}
 */
export function usesNetwork(plugin, content) {
  const n = plugin?.network;
  if (typeof n === 'function') {
    // A predicate that throws must not decide "no" by accident: the safe
    // answer for a privacy gate is always "yes, ask first".
    try { return !!n(content ?? {}); } catch { return true; }
  }
  return !!n;
}

/**
 * The shape the remote-JSON widgets share: inline data never leaves the
 * machine, a URL source does, and provided-offline data is read from a slot
 * the Studio filled earlier — no live call from the canvas.
 */
export const remoteJsonNetwork = (c) => c?.source === 'url' && isRemoteUrl(c?.dataUrl);

/** The same question for the widgets that use `dataMode` instead of `source`. */
export const dataModeNetwork = (c) => (c?.dataMode ?? 'live') === 'live';
