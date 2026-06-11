import { register } from './registry.js';
import { mediaFitField, objectFitValue } from '../media-fit.js';
import { composeDispose } from '../plugin-contract.js';
import { mediaPlaceholder } from '../media-placeholder.js';

// Retry ladder for the stall/error auto-recovery: 24/7 unattended displays
// used to show a permanently black video after one transient network blip
// until the next slide rotation. Backoff resets on 'playing'.
const RETRY_DELAYS = [5000, 15000, 60000];

export default register({
  type: 'video',
  label: 'Video',
  group: 'media',
  icon: '🎬',
  network: true,
  schemaVersion: 3,
  // v3: volume changed from a 0–1 decimal to a 0–100 percent slider (matching
  // the textScale/overlay percent convention). Stored decimals scale up once.
  migrate(content, fromVersion) {
    const c = { ...content };
    if (fromVersion < 3 && typeof c.volume === 'number' && c.volume <= 1) {
      c.volume = Math.round(Math.max(0, Math.min(1, c.volume)) * 100);
    }
    return c;
  },
  defaults: () => ({
    url: '', poster: '',
    startSec: 0, endSec: 0,
    loop: true, autoDuration: true, muted: true, volume: 100,
    playbackRate: '1',
    captionsUrl: '', captionsLang: 'en', showCaptions: false,
    controls: false, preventDownload: true, hidePictureInPicture: true,
    fit: 'cover', focusX: 50, focusY: 50, letterboxColor: '',
    fallbackUrl: '', autoRecover: true,
  }),
  schema: () => ({
    fields: [
      { type: 'section', label: 'Source', key: 'source' },
      { key: 'url',    type: 'asset', label: 'Video URL', accept: 'video/mp4,video/webm', test: true },
      { key: 'poster', type: 'asset', label: 'Poster image (shown before play)', accept: 'image/*',
        help: 'Falls back to a black frame. Helps when autoplay is blocked.' },

      { type: 'section', label: 'Clip', key: 'clip',
        help: 'Play only a part of the video. 0 = full length.' },
      { type: 'row', children: [
        { key: 'startSec', type: 'duration', label: 'Start at', min: 0 },
        { key: 'endSec',   type: 'duration', label: 'End at',   min: 0,
          // Render silently ignores endSec <= startSec (both the media-fragment
          // and the manual-loop path) — surface that instead of doing nothing.
          validate: (val, c) => {
            const end = Number(val) || 0;
            const start = Number(c.startSec) || 0;
            return end > 0 && end <= start
              ? { level: 'warn', message: 'End must be after Start — the clip range is ignored.' }
              : null;
          } },
      ] },

      { type: 'section', label: 'Playback', key: 'playback' },
      { type: 'row', children: [
        { key: 'loop',         type: 'toggle', label: 'Loop' },
        // autoDuration is consumed by the player host (slide-advance contract),
        // never inside render() — the help text describes that host behavior.
        { key: 'autoDuration', type: 'toggle', label: 'Match length',
          help: 'Advances to the next slide when the video ends, instead of after the slide’s fixed duration.' },
        { key: 'muted',        type: 'toggle', label: 'Muted' },
      ] },
      { key: 'volume', type: 'number', label: 'Volume', min: 0, max: 100, step: 5, slider: true, suffix: '%',
        showIf: c => c.muted === false,
        help: 'Browsers usually block sound until the user interacts with the page.' },
      { key: 'playbackRate', type: 'select', label: 'Playback speed', options: [
        { value: '0.25', label: '0.25× (slow motion)' },
        { value: '0.5',  label: '0.5×' },
        { value: '0.75', label: '0.75×' },
        { value: '1',    label: '1× (normal)' },
        { value: '1.25', label: '1.25×' },
        { value: '1.5',  label: '1.5×' },
        { value: '2',    label: '2× (time-lapse)' },
      ], help: 'Slow-motion ambience loops or sped-up time-lapses.' },

      { type: 'section', label: 'Captions / subtitles', key: 'captions', collapsed: true,
        summary: c => c.captionsUrl ? (String(c.captionsLang || 'en').trim() || 'en') : '—' },
      { key: 'captionsUrl', type: 'asset', label: 'Caption file (.vtt)', accept: 'text/vtt,.vtt', test: true,
        help: 'WebVTT subtitle file. Same-origin or a URL with CORS headers, browsers refuse cross-origin tracks without them.' },
      { type: 'row', children: [
        { key: 'showCaptions', type: 'toggle', label: 'Show by default',
          showIf: c => !!c.captionsUrl },
        { key: 'captionsLang', type: 'text', label: 'Language', placeholder: 'en',
          showIf: c => !!c.captionsUrl,
          // Soft check: a non-BCP47 string silently produces a wrong track label.
          validate: val => val && !/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(String(val).trim())
            ? { level: 'warn', message: 'Not a valid language code — use BCP 47 like "en", "de" or "pt-BR".' }
            : null },
      ] },

      { type: 'section', label: 'Controls', key: 'controlsUi', collapsed: true,
        summary: c => c.controls ? '✓' : '—' },
      { key: 'controls', type: 'toggle', label: 'Show controls',
        help: 'Native browser playback controls. Off (default) for signage, on for kiosk demos where viewers may pause/scrub.' },
      { type: 'row', children: [
        { key: 'preventDownload', type: 'toggle', label: 'Disable download menu',
          showIf: c => c.controls },
        { key: 'hidePictureInPicture', type: 'toggle', label: 'Hide PIP button',
          showIf: c => c.controls },
      ] },

      { type: 'section', label: 'Layout', key: 'layout' },
      mediaFitField(),
      // Focal-point row mirrors image.js exactly (same keys, same labels) so
      // the cover-crop muscle memory transfers between the two widgets.
      { type: 'row', children: [
        { key: 'focusX', type: 'number', label: 'Focal X (%)', min: 0, max: 100, step: 5, slider: true },
        { key: 'focusY', type: 'number', label: 'Focal Y (%)', min: 0, max: 100, step: 5, slider: true },
      ], showIf: c => (c.fit ?? 'cover') === 'cover' },
      { key: 'letterboxColor', type: 'color', clearable: true, label: 'Letterbox colour',
        showIf: c => c.fit === 'contain',
        help: 'Fills the bars around the video. Empty = black.' },

      { type: 'section', label: 'Reliability', key: 'reliability', collapsed: true,
        summary: c => (c.autoRecover !== false || c.fallbackUrl) ? '✓' : '—' },
      { key: 'fallbackUrl', type: 'asset', label: 'Fallback video', accept: 'video/mp4,video/webm', test: true,
        help: 'Second source the browser switches to when the main video fails to load or its codec is unsupported (e.g. an MP4 backup for a WebM).' },
      { key: 'autoRecover', type: 'toggle', label: 'Auto-recover from stalls',
        help: 'Retries playback with increasing delays (5 s, 15 s, 60 s) after a network error or stall, instead of staying black until the next slide change.' },
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    if (!c.url) {
      const empty = mediaPlaceholder({ icon: '🎬', message: 'Add a video URL, MP4 or WebM.' });
      container.appendChild(empty);
      return composeDispose(() => empty.remove());
    }
    const root = document.createElement('div');
    root.className = 'bb-slide bb-slide-video';
    root.style.cssText = 'position:relative;width:100%;height:100%;';

    const v = document.createElement('video');
    // Append start-time fragment via the media-fragments URI spec, natively
    // supported by Chromium/Firefox/Safari, no JS seek needed at load time.
    const startSec = Math.max(0, Number(c.startSec) || 0);
    const endSec   = Math.max(0, Number(c.endSec)   || 0);
    const frag = startSec || endSec
      ? `#t=${startSec}${endSec > startSec ? ',' + endSec : ''}`
      : '';
    // With a fallback source the browser runs its resource-selection algorithm
    // over <source> children and falls through on 404 / unsupported codec
    // (e.g. WebM primary + MP4 backup). The media fragment must be appended to
    // EACH source URL. Total failure then fires 'error' on the LAST <source>,
    // not on the media element itself — we listen on both below.
    let lastSource = null;
    if (c.fallbackUrl) {
      for (const u of [c.url, c.fallbackUrl]) {
        const s = document.createElement('source');
        s.src = u + frag;
        v.appendChild(s);
        lastSource = s;
      }
    } else {
      v.src = c.url + frag;
    }
    if (c.poster) v.poster = c.poster;
    v.autoplay = true;
    v.playsInline = true;
    v.muted = c.muted !== false;
    if (!v.muted && typeof c.volume === 'number') {
      // Stored as 0–100 percent since schemaVersion 3 (migrate scales old 0–1).
      v.volume = Math.max(0, Math.min(100, c.volume)) / 100;
    }
    // defaultPlaybackRate too, so the rate survives loop restarts and load().
    const rate = Number(c.playbackRate) || 1;
    if (rate !== 1) {
      v.defaultPlaybackRate = rate;
      v.playbackRate = rate;
    }
    v.loop = c.loop !== false;
    // Controls + UI suppression. Native `<video>` controls only render when
    // .controls is true; the suppression flags below are then layered on top
    // to remove the download menu and PIP button, sensible defaults for
    // signage kiosks where the source URL must not be exposable.
    if (c.controls) {
      v.controls = true;
      const listFlags = [];
      if (c.preventDownload !== false) listFlags.push('nodownload');
      if (listFlags.length) v.setAttribute('controlsList', listFlags.join(' '));
      if (c.hidePictureInPicture !== false) v.disablePictureInPicture = true;
    }
    v.style.width = '100%';
    v.style.height = '100%';
    v.style.objectFit = objectFitValue(c.fit);
    // Focal-point cropping: with fit=cover, object-position controls which
    // part of the frame stays visible when the slot crops it (same as image).
    if ((c.fit ?? 'cover') === 'cover') {
      const fx = Math.max(0, Math.min(100, Number(c.focusX ?? 50)));
      const fy = Math.max(0, Math.min(100, Number(c.focusY ?? 50)));
      v.style.objectPosition = `${fx}% ${fy}%`;
    }
    // Letterbox bars for fit=contain; '' falls through to the classic black.
    v.style.background = c.letterboxColor || '#000';

    // Captions / subtitles via a <track> element. The browser refuses cross-
    // origin tracks unless the source serves CORS headers, same restriction
    // YouTube's cc_load_policy doesn't have because YT serves the captions
    // from its own origin. We surface this in the help text on the field.
    if (c.captionsUrl) {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.src = c.captionsUrl;
      track.srclang = (c.captionsLang ?? 'en').trim() || 'en';
      track.label = track.srclang.toUpperCase();
      if (c.showCaptions) track.default = true;
      v.appendChild(track);
      // The `default` attribute on track only takes effect on initial DOM
      // attach; if the user toggles "Show captions" later, the inspector
      // re-renders the whole widget, so this stays consistent. Not {once}:
      // loadedmetadata fires again after an auto-recovery load().
      if (c.showCaptions) {
        v.addEventListener('loadedmetadata', () => {
          for (const t of v.textTracks) if (t.kind === 'subtitles') t.mode = 'showing';
        });
      }
    }
    // Manual loop with end-clip: <video loop> + media-fragment endSec resets
    // playback to 0 instead of startSec, so we hand-seek when endSec is set.
    if ((c.loop !== false) && endSec > startSec) {
      v.loop = false;
      v.addEventListener('timeupdate', () => {
        if (v.currentTime >= endSec - 0.05) {
          try { v.currentTime = startSec; v.play?.(); } catch {}
        }
      });
      v.addEventListener('ended', () => {
        try { v.currentTime = startSec; v.play?.(); } catch {}
      });
    }

    // Failure surface + stall/error auto-recovery. Load failures (404, blocked
    // codec, expired CDN URL) show a themed message instead of a permanently
    // black box; with autoRecover on (default) we additionally retry with
    // exponential backoff so a transient network blip heals itself.
    let errOverlay = null;
    let retryIdx = 0;
    let retryTimer = 0;
    const showError = () => {
      if (errOverlay) return;
      errOverlay = mediaPlaceholder({ icon: '📵', message: 'Video could not be loaded.' });
      errOverlay.style.position = 'absolute';
      errOverlay.style.inset = '0';
      root.appendChild(errOverlay);
    };
    const clearError = () => {
      if (errOverlay) { errOverlay.remove(); errOverlay = null; }
    };
    const recover = checkStuck => {
      if (c.autoRecover === false || retryTimer) return;
      const delay = RETRY_DELAYS[Math.min(retryIdx, RETRY_DELAYS.length - 1)];
      retryIdx += 1;
      retryTimer = setTimeout(() => {
        retryTimer = 0;
        // 'stalled' can fire while playback continues fine from buffer — only
        // reload when the element is actually stuck by the time we check.
        if (checkStuck && !v.paused && v.readyState >= 3) { retryIdx = 0; return; }
        try { v.load(); v.play?.().catch(() => {}); } catch {}
      }, delay);
    };
    const onFatal = () => {
      if (ctx?.onError?.()) return; // host-level on-error fallback took over
      showError();
      recover(false);
    };
    v.addEventListener('error', onFatal);
    if (lastSource) lastSource.addEventListener('error', onFatal);
    v.addEventListener('stalled', () => recover(true));
    v.addEventListener('playing', () => { retryIdx = 0; clearError(); });

    root.appendChild(v);
    if (slide.title) {
      const t = document.createElement('div');
      t.className = 'bb-image-title';
      t.textContent = slide.title;
      root.appendChild(t);
    }
    container.appendChild(root);
    v.play?.().catch(() => {});
    return composeDispose(() => {
      clearTimeout(retryTimer);
      try {
        v.pause();
        v.removeAttribute('src');
        for (const s of [...v.querySelectorAll('source')]) s.remove();
        v.load();
      } catch {}
      root.remove();
    });
  },
});
