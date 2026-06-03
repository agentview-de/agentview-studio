import { register } from './registry.js';
import { mediaFitField, objectFitValue } from '../media-fit.js';
import { composeDispose } from '../plugin-contract.js';
import { isSafeImgUrl } from '../safe-url.js';
import { inlinedVendorUrl } from '../inline-vendor.js';

// HLS via hls.js, self-hosted (vendored under shared/vendor/), lazy-loaded the
// first time a stream widget renders. No third-party CDN call (DSGVO/GDPR). In a
// published player the relative vendor path 404s on the content host, so the
// bundler inlines hls.min.js (see shared/inline-vendor.js) and we load it from a
// blob: URL (`script-src blob:` is allowed); dev falls back to import.meta.url.
let _hlsPromise = null;
function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (_hlsPromise) return _hlsPromise;
  _hlsPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = inlinedVendorUrl('hls.min.js') || new URL('../vendor/hls.min.js', import.meta.url).href;
    s.onload = () => res(window.Hls);
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return _hlsPromise;
}

export default register({
  type: 'stream-cam',
  label: 'Live Stream / IP Camera',
  group: 'media',
  icon: '📹',
  network: true,
  schemaVersion: 1,
  defaults: () => ({ url: '', kind: 'hls', muted: true, title: '', fit: 'contain' }),
  schema: () => ({
    fields: [
      { key: 'url', type: 'url', label: 'Stream URL', test: 'stream', placeholder: 'https://…/playlist.m3u8 or http://camera/mjpeg' },
      { key: 'kind', type: 'select', label: 'Stream type', options: ['hls','mjpeg','rtsp-proxy'],
        help: 'Auto-detected from the URL when possible, set it for rtsp-proxy or ambiguous links.',
        showIf: c => !/\.m3u8(\?|$)/i.test(c.url ?? '') && !/mjpe?g|mjpg/i.test(c.url ?? '') },
      { key: 'title', type: 'text', label: 'Title badge', placeholder: 'Lobby cam',
        help: 'Overlay shown at the top-left, useful when several streams are tiled.' },
      mediaFitField(),
      { key: 'muted', type: 'toggle', label: 'Muted' },
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    root.className = 'bb-slide bb-slide-stream';
    root.style.cssText = 'width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center;position:relative;';
    // Optional title badge, top-left, used as a label for tiled camera walls.
    if (c.title) {
      const badge = document.createElement('div');
      badge.className = 'bb-stream-title';
      badge.textContent = c.title;
      badge.style.cssText = 'position:absolute;top:.6em;left:.6em;z-index:2;padding:.3em .7em;border-radius:999px;background:rgba(0,0,0,0.55);color:#fff;font:600 clamp(11px, 2cqmin, 28px) var(--bb-font, Inter, sans-serif);backdrop-filter: blur(4px);';
      root.appendChild(badge);
    }
    container.appendChild(root);
    let cleanup = () => {};
    const url = c.url ?? '';
    const safeUrl = isSafeImgUrl(url);
    // Auto-detect the stream type from the URL so a mismatched dropdown still plays.
    const kind = /\.m3u8(\?|$)/i.test(url) ? 'hls'
      : (/mjpe?g|mjpg/i.test(url) ? 'mjpeg' : (c.kind ?? 'hls'));
    if (!url || !safeUrl) {
      const msg = url
        ? 'That stream URL can’t be loaded, use an <strong>http(s)://</strong> address.'
        : 'Paste an HLS (.m3u8) or MJPEG stream URL.';
      root.innerHTML = `<div style="color:currentColor;opacity:.55;font:14px/1.5 var(--bb-font, Inter, sans-serif);text-align:center;padding:24px;"><div style="font-size:48px;opacity:.5;margin-bottom:8px;">📹</div><div>${msg}</div></div>`;
    } else if (kind === 'mjpeg') {
      const img = document.createElement('img');
      img.src = url;
      img.style.cssText = 'max-width:100%;max-height:100%;';
      root.appendChild(img);
      cleanup = () => { img.src = ''; img.remove(); };
    } else {
      const v = document.createElement('video');
      v.muted = c.muted !== false; v.autoplay = true; v.playsInline = true;
      v.style.cssText = `width:100%;height:100%;object-fit:${objectFitValue(c.fit)};background:#000;`;
      root.appendChild(v);
      // Surface playback failures (network drop, unsupported codec, expired
      // stream key, etc.) instead of showing a permanently black video.
      const showStreamError = (msg) => {
        const err = document.createElement('div');
        err.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000;color:rgba(255,255,255,.6);font:14px/1.5 var(--bb-font, Inter, sans-serif);text-align:center;padding:24px;';
        err.innerHTML = `<div>📵 ${msg}</div>`;
        root.appendChild(err);
      };
      v.addEventListener('error', () => showStreamError('Stream offline or unsupported in this browser'));
      let hls;
      if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = url; v.play?.().catch(() => showStreamError('Stream could not start'));
      } else {
        loadHls().then(Hls => {
          if (!Hls?.isSupported()) {
            // No HLS.js and no native HLS support, try direct src as a last
            // resort but the user is likely to see "Stream offline" if it's
            // an .m3u8 in a non-Safari browser.
            v.src = url;
            return;
          }
          hls = new Hls();
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data?.fatal) showStreamError('Stream offline or unsupported');
          });
          hls.loadSource(url); hls.attachMedia(v);
        }).catch(() => {
          // HLS.js failed to load (CDN issue), try direct src.
          v.src = url;
          showStreamError('Stream player failed to load');
        });
      }
      cleanup = () => { try { hls?.destroy(); v.pause(); v.removeAttribute('src'); v.load(); } catch {} v.remove(); };
    }
    return composeDispose(() => { cleanup(); root.remove(); });
  },
});
