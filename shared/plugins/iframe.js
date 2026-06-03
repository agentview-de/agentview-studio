import { register } from './registry.js';
import { composeDispose } from '../plugin-contract.js';
import { isSafeImgUrl } from '../safe-url.js';

export default register({
  type: 'iframe',
  label: 'Web Page',
  group: 'media',
  icon: '🌐',
  network: true,
  schemaVersion: 1,
  defaults: () => ({ url: '', sandbox: true, reloadSec: 0, scale: 100 }),
  schema: () => ({
    fields: [
      { key: 'url', type: 'url', label: 'Web URL', test: 'embed', placeholder: 'https://…',
        help: 'Many sites block iframe embedding (X-Frame-Options/CSP). Use sandboxed iframes for unknown sources.' },
      { key: 'reloadSec', type: 'duration', label: 'Reload every (0 = never)', min: 0, default: 0,
        help: 'Refresh the page on a timer so embedded dashboards / status pages stay live.' },
      { key: 'scale', type: 'number', label: 'Zoom (%)', min: 25, max: 400, step: 5, slider: true,
        help: 'Scale the embedded page to fit the widget, useful for desktop-sized pages on portrait screens.' },
      { key: 'sandbox', type: 'toggle', label: 'Sandbox (allow-scripts only)' },
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    // Block at render-time too, the inspector's "Test" button is advisory, not
    // a guard. Only http(s) / relative URLs reach the iframe; `javascript:`,
    // `data:text/html`, `file:` etc. are rejected to the empty-state.
    if (!c.url || !isSafeImgUrl(c.url)) {
      const empty = document.createElement('div');
      empty.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#0a0a10;color:rgba(255,255,255,.5);text-align:center;padding:24px;font-family:var(--bb-font, Inter, sans-serif);';
      empty.innerHTML = c.url
        ? '<div><div style="font-size:48px;opacity:.5;margin-bottom:8px;">🌐</div><div>That URL can’t be embedded, use an <strong>https://</strong> address.</div></div>'
        : '<div><div style="font-size:48px;opacity:.5;margin-bottom:8px;">🌐</div><div>Paste a web URL, the page will be embedded.</div></div>';
      container.appendChild(empty);
      return composeDispose(() => empty.remove());
    }
    const f = document.createElement('iframe');
    f.src = c.url;
    const scale = Math.max(25, Math.min(400, Number(c.scale) || 100)) / 100;
    // Zoom via CSS transform, the iframe renders at logical px, then scales
    // back to fit the widget box. width:height inversely sized so the content
    // believes it has more (or less) room than the box.
    if (scale !== 1) {
      f.style.cssText = `width:${100/scale}%;height:${100/scale}%;border:0;background:#0a0a10;transform:scale(${scale});transform-origin:top left;`;
    } else {
      f.style.cssText = 'width:100%;height:100%;border:0;background:#0a0a10;';
    }
    f.referrerPolicy = 'no-referrer';
    // allow-scripts WITHOUT allow-same-origin: the framed page runs scripts but
    // in an opaque origin, so it can't reach the parent's storage/DOM or strip
    // its own sandbox (the allow-scripts + allow-same-origin combo is the classic
    // sandbox-escape, see embed.js). Matches this field's "allow-scripts only" label.
    if (c.sandbox !== false) f.setAttribute('sandbox', 'allow-scripts');
    container.appendChild(f);
    // Auto-reload, useful for status pages and read-only dashboards that
    // don't refresh themselves. Setting src to the same value re-fetches.
    let reloadTimer = null;
    const reloadMs = Math.max(0, Number(c.reloadSec) || 0) * 1000;
    if (reloadMs >= 5000) {
      reloadTimer = setInterval(() => { f.src = c.url; }, reloadMs);
    }
    return composeDispose(() => {
      if (reloadTimer) clearInterval(reloadTimer);
      f.removeAttribute('src');
      f.remove();
    });
  },
});
