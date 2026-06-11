import { register } from './registry.js';
import { mediaFitField, objectFitValue } from '../media-fit.js';
import { composeDispose } from '../plugin-contract.js';
import { isSafeImgUrl } from '../safe-url.js';
import { inlinedVendorUrl } from '../inline-vendor.js';
import { mediaPlaceholder } from '../media-placeholder.js';
import { mixedContentWarning } from '../web-embed-fields.js';
import { STATUS_COLORS } from '../status-colors.js';

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

// URL auto-detection, shared between render() and the schema's showIf gates so
// the inspector hides exactly the knobs the player would ignore (e.g. Muted on
// a silent MJPEG image stream).
const HLS_RE = /\.m3u8(\?|$)/i;
const MJPEG_RE = /mjpe?g|mjpg/i;
function detectKind(c) {
  const url = c?.url ?? '';
  if (HLS_RE.test(url)) return 'hls';
  if (MJPEG_RE.test(url)) return 'mjpeg';
  return c?.kind ?? 'hls';
}

// Pulse keyframes for the LIVE badge dot, injected once per document (admin
// preview, fullscreen preview iframe, live player) — same pattern as
// ensureTickerKeyframes().
function ensureLivePulseKeyframes() {
  if (document.getElementById('bb-stream-cam-kf')) return;
  const style = document.createElement('style');
  style.id = 'bb-stream-cam-kf';
  style.textContent = '@keyframes bb-stream-live-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }';
  document.head.appendChild(style);
}

const BADGE_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export default register({
  type: 'stream-cam',
  label: 'Live Stream / IP Camera',
  group: 'media',
  icon: '📹',
  network: true,
  schemaVersion: 1,
  defaults: () => ({
    url: '', kind: 'hls', muted: true, title: '', fit: 'contain',
    liveBadge: false, badgePosition: 'top-left',
    retrySec: 30, fallbackImage: '',
  }),
  schema: () => ({
    fields: [
      { type: 'section', label: 'Stream source', key: 'source' },
      { key: 'url', type: 'url', label: 'Stream URL', test: 'stream',
        placeholder: 'https://…/playlist.m3u8 or http://camera/mjpeg',
        validate: v => mixedContentWarning(v) },
      { key: 'kind', type: 'select', label: 'Stream type', options: [
          { value: 'hls', label: 'HLS (.m3u8 playlist)' },
          { value: 'mjpeg', label: 'MJPEG (motion-JPEG camera)' },
          { value: 'rtsp-proxy', label: 'RTSP via proxy (HLS-restreamed)' },
        ],
        help: 'Auto-detected from the URL when possible. RTSP cameras can’t play directly in a browser — run a restreamer that outputs HLS and paste its playlist URL here.',
        showIf: c => !HLS_RE.test(c.url ?? '') && !MJPEG_RE.test(c.url ?? '') },

      { type: 'section', label: 'Overlay', key: 'overlay' },
      { key: 'title', type: 'text', label: 'Title badge', placeholder: 'Lobby cam',
        help: 'Overlay label on the stream, useful when several cameras are tiled.' },
      { key: 'liveBadge', type: 'toggle', label: 'LIVE badge',
        help: 'Pulsing red LIVE pill — marks the feed as live footage rather than a recorded loop.' },
      { key: 'badgePosition', type: 'select', buttons: true, label: 'Badge position',
        options: [
          { value: 'top-left', label: 'Top left' },
          { value: 'top-right', label: 'Top right' },
          { value: 'bottom-left', label: 'Bottom left' },
          { value: 'bottom-right', label: 'Bottom right' },
        ],
        showIf: c => !!c.title || !!c.liveBadge,
        help: 'Corner for the badges — pick one that doesn’t cover the camera’s own timestamp.' },

      { type: 'section', label: 'Playback', key: 'playback' },
      mediaFitField(),
      { key: 'muted', type: 'toggle', label: 'Muted',
        // MJPEG is a silent image stream — the toggle would be meaningless.
        showIf: c => detectKind(c) !== 'mjpeg',
        help: 'Browsers only autoplay muted video — turn off only on players configured to allow audio.' },

      { type: 'section', label: 'Reliability', key: 'reliability', collapsed: true,
        summary: c => {
          const r = Number(c.retrySec ?? 30) || 0;
          const bits = [];
          if (r > 0) bits.push(`↻ ${r}s`);
          if (c.fallbackImage) bits.push('🖼️');
          return bits.join(' · ') || '—';
        } },
      { key: 'retrySec', type: 'duration', label: 'Reconnect after (0 = off)', min: 0,
        help: 'Wait this long after a stream failure, then reconnect automatically — keeps 24/7 screens from staying on an offline card. Intervals under 5 seconds are raised to 5.' },
      { key: 'fallbackImage', type: 'asset', label: 'Fallback image', accept: 'image/*',
        help: 'Shown instead of the offline message while the stream is down — e.g. a branded “back soon” still.' },
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const url = (c.url ?? '').trim();

    // Empty / unloadable URL → themed placeholder (no forced black backdrop,
    // so it reads correctly on light themes too).
    if (!url || !isSafeImgUrl(url)) {
      const ph = mediaPlaceholder(url
        ? { icon: '📹', messageHtml: 'That stream URL can’t be loaded, use an <strong>http(s)://</strong> address.' }
        : { icon: '📹', message: 'Paste an HLS (.m3u8) or MJPEG stream URL.' });
      container.appendChild(ph);
      return composeDispose(() => ph.remove());
    }

    const root = document.createElement('div');
    root.className = 'bb-slide bb-slide-stream';
    root.style.cssText = 'width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;';

    // Badges (LIVE pill + title), in the configured corner so they can dodge
    // in-camera OSD timestamps when several streams are tiled. z-index 2 keeps
    // them above the offline overlay (z-index 1) — the label stays readable on
    // a camera wall even while one feed is down.
    if (c.title || c.liveBadge) {
      const corner = BADGE_CORNERS.includes(c.badgePosition) ? c.badgePosition : 'top-left';
      const [vSide, hSide] = corner.split('-');
      const wrap = document.createElement('div');
      wrap.style.cssText = `position:absolute;${vSide}:.6em;${hSide}:.6em;z-index:2;display:flex;gap:.5em;align-items:center;`;
      const pill = 'padding:.3em .7em;border-radius:999px;background:rgba(0,0,0,0.55);color:#fff;backdrop-filter:blur(4px);';
      if (c.liveBadge) {
        ensureLivePulseKeyframes();
        const live = document.createElement('div');
        live.className = 'bb-stream-live';
        live.style.cssText = pill + 'display:flex;align-items:center;gap:.4em;font:700 clamp(11px, 2cqmin, 28px) var(--bb-font, Inter, sans-serif);letter-spacing:.08em;';
        const dot = document.createElement('span');
        dot.style.cssText = `width:.55em;height:.55em;border-radius:50%;background:${STATUS_COLORS.bad};animation:bb-stream-live-pulse 1.6s ease-in-out infinite;`;
        live.append(dot, 'LIVE');
        wrap.appendChild(live);
      }
      if (c.title) {
        const badge = document.createElement('div');
        badge.className = 'bb-stream-title';
        badge.textContent = c.title;
        badge.style.cssText = pill + 'font:600 clamp(11px, 2cqmin, 28px) var(--bb-font, Inter, sans-serif);';
        wrap.appendChild(badge);
      }
      root.appendChild(wrap);
    }
    if (slide.title) {
      const t = document.createElement('div');
      t.className = 'bb-image-title';
      t.textContent = slide.title;
      root.appendChild(t);
    }
    container.appendChild(root);

    // Auto-detect the stream type from the URL so a mismatched dropdown still
    // plays. 'rtsp-proxy' deliberately falls through to the HLS path — the
    // restreamer must emit HLS (see the Stream type option label/help).
    const kind = detectKind(c);
    const fitCss = objectFitValue(c.fit);
    const retryRaw = Number(c.retrySec ?? 30) || 0;
    const retrySec = retryRaw > 0 ? Math.max(5, retryRaw) : 0;

    let disposed = false;
    let gen = 0;           // attach generation — retires handlers of replaced media elements
    let teardown = () => {};
    let offline = null;    // current offline overlay (placeholder card or fallback image)
    let retryTimer = 0;
    let tickTimer = 0;

    const clearOffline = () => {
      clearInterval(tickTimer); tickTimer = 0;
      if (offline) { offline.remove(); offline = null; }
    };

    const showOffline = (msg) => {
      clearOffline();
      const fallback = (c.fallbackImage ?? '').trim();
      if (fallback && isSafeImgUrl(fallback)) {
        // Branded still instead of an error card — lobby screens degrade
        // gracefully. Same object-fit as the stream so the framing matches.
        const img = document.createElement('img');
        img.src = fallback;
        img.alt = '';
        img.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:${fitCss};z-index:1;`;
        offline = img;
      } else {
        let remain = retrySec;
        const text = () => !retrySec ? msg
          : (remain > 0 ? `${msg} — reconnecting in ${remain}s` : `${msg} — reconnecting…`);
        const ph = mediaPlaceholder({ icon: '📵', message: text() });
        ph.style.position = 'absolute';
        ph.style.inset = '0';
        ph.style.zIndex = '1';
        // Opaque themed backdrop: the placeholder's fg-tinted text must sit on
        // the theme background, not on the black video backdrop (light themes).
        ph.style.background = 'var(--bb-st-bg, #000)';
        if (retrySec) {
          const msgEl = ph.firstChild?.lastChild;
          tickTimer = setInterval(() => {
            remain = Math.max(0, remain - 1);
            if (msgEl) msgEl.textContent = text();
          }, 1000);
        }
        offline = ph;
      }
      root.appendChild(offline);
    };

    // One overlay + one pending retry at a time: the old code stacked error
    // cards when both the <video> error event and a fatal hls.js error fired,
    // and never removed them again.
    const streamDown = (myGen, msg) => {
      if (disposed || myGen !== gen) return;
      if (ctx?.onError?.()) return; // host-level on-error fallback took over
      if (retryTimer) return;       // already showing + reconnect scheduled
      showOffline(msg);
      if (retrySec) {
        retryTimer = setTimeout(() => {
          retryTimer = 0;
          if (disposed) return;
          teardown();
          teardown = () => {};
          attach(true);
        }, retrySec * 1000);
      }
    };

    const attach = (retrying = false) => {
      const myGen = ++gen;
      if (kind === 'mjpeg') {
        const img = document.createElement('img');
        img.alt = '';
        // Cache-buster on reconnects so the browser opens a fresh connection
        // instead of reusing the dead response.
        img.src = retrying ? url + (url.includes('?') ? '&' : '?') + '_bb=' + Date.now() : url;
        // Honor the shared Fit field (cover/contain/fill) exactly like every
        // other media widget — the old max-width/max-height ignored it.
        img.style.cssText = `width:100%;height:100%;object-fit:${fitCss};`;
        img.addEventListener('load', () => { if (myGen === gen && !disposed) clearOffline(); });
        img.addEventListener('error', () => streamDown(myGen, 'Camera stream offline'));
        root.appendChild(img);
        // 'load' is unreliable for multipart MJPEG — optimistically drop the
        // overlay on reconnect; a failure brings it right back via 'error'.
        if (retrying) clearOffline();
        teardown = () => { img.src = ''; img.remove(); };
      } else {
        const v = document.createElement('video');
        v.muted = c.muted !== false; v.autoplay = true; v.playsInline = true;
        v.style.cssText = `width:100%;height:100%;object-fit:${fitCss};background:#000;`;
        root.appendChild(v);
        // Surface playback failures (network drop, unsupported codec, expired
        // stream key, …) instead of a permanently black video — and recover.
        v.addEventListener('playing', () => { if (myGen === gen && !disposed) clearOffline(); });
        v.addEventListener('error', () => streamDown(myGen, 'Stream offline or unsupported in this browser'));
        let hls;
        if (v.canPlayType('application/vnd.apple.mpegurl')) {
          v.src = url;
          v.play?.().catch(() => streamDown(myGen, 'Stream could not start'));
        } else {
          loadHls().then(Hls => {
            if (disposed || myGen !== gen) return;
            if (!Hls?.isSupported()) {
              // No HLS.js and no native HLS support, try direct src as a last
              // resort but the user is likely to see "Stream offline" if it's
              // an .m3u8 in a non-Safari browser.
              v.src = url;
              return;
            }
            hls = new Hls();
            hls.on(Hls.Events.ERROR, (_e, data) => {
              if (data?.fatal) streamDown(myGen, 'Stream offline or unsupported');
            });
            hls.loadSource(url); hls.attachMedia(v);
          }).catch(() => {
            // HLS.js failed to load (asset missing), try direct src.
            if (disposed || myGen !== gen) return;
            v.src = url;
            streamDown(myGen, 'Stream player failed to load');
          });
        }
        teardown = () => { try { hls?.destroy(); v.pause(); v.removeAttribute('src'); v.load(); } catch {} v.remove(); };
      }
    };
    attach();

    return composeDispose(() => {
      disposed = true;
      clearTimeout(retryTimer);
      clearInterval(tickTimer);
      teardown();
      root.remove();
    });
  },
});
