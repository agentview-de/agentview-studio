// Editor data-minimisation (DSGVO): the set of network widgets the user has
// opted to preview LIVE this session. Empty by default — nothing is fetched
// until asked, so building slides never transmits the device IP to third-party
// APIs. Extracted from canvas.js: this is a self-contained concern (a Set + its
// opt-in API + the click-to-load placeholder), coupled to the canvas only by the
// re-render it triggers — which is INJECTED (configureLivePreview) so this module
// doesn't depend back on canvas.js. The state is in-memory only (a reload resets
// it). canvas.js re-exports the opt-in API, so callers import it unchanged.

import { t } from '../i18n.js';
import { escapeHtml } from '../../shared/utils/escape.js';

const _ids = new Set();
// Canvas re-render hooks, wired once by mountCanvas via configureLivePreview.
let _refreshWidget = () => {};
let _renderSlide = () => {};

// Wire the canvas re-render callbacks (called from mountCanvas). Kept out of the
// import graph so live-preview.js and canvas.js don't form a cycle.
export function configureLivePreview({ refreshWidget, renderSlide } = {}) {
  if (refreshWidget) _refreshWidget = refreshWidget;
  if (renderSlide) _renderSlide = renderSlide;
}

// Opt-in API (DSGVO): the user grants/withdraws permission for a network widget
// to fetch live in the editor — which transmits the device IP. Each setter
// re-renders the affected frame(s) so the canvas reflects it.
export function isLivePreview(id) { return _ids.has(id); }
export function enableLivePreview(id) { _ids.add(id); _refreshWidget(id); }
export function disableLivePreview(id) { if (_ids.delete(id)) _refreshWidget(id); }

// Withdraw ALL granted live previews at once. Returns how many were active.
export function resetLivePreviews() {
  const n = _ids.size;
  if (n) { _ids.clear(); _renderSlide(); }
  return n;
}

// Click-to-load placeholder shown instead of a live network-widget render in the
// editor. Returns a dispose() like mountWidget does. The live fetch (and the
// device-IP transmission it implies) only happens after an explicit click.
export function mountPrivacyPlaceholder(content, widget, plugin) {
  const provider = plugin?.usage?.attribution || t('privacy.providerGeneric');
  const el = document.createElement('div');
  el.className = 'avs-live-preview-ph';
  el.innerHTML = `
    <div class="avs-lpp-icon">${escapeHtml(plugin?.icon ?? '◻')}</div>
    <div class="avs-lpp-title">${escapeHtml(plugin?.label ?? widget.type)} · ${escapeHtml(t('privacy.livePreviewTitle'))}</div>
    <div class="avs-lpp-body">${escapeHtml(t('privacy.livePreviewBody', { provider }))}</div>
    <button type="button" class="bb-btn bb-btn-secondary avs-lpp-btn">${escapeHtml(t('privacy.loadPreview'))}</button>`;
  const btn = el.querySelector('.avs-lpp-btn');
  // Stop the frame's drag/select gesture from swallowing the button click.
  btn.addEventListener('pointerdown', e => e.stopPropagation());
  btn.addEventListener('click', e => {
    e.stopPropagation();
    enableLivePreview(widget.id); // re-renders this single frame, now live
  });
  content.appendChild(el);
  return () => el.remove();
}
