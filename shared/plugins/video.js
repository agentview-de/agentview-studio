import { register } from './registry.js';
import { mediaFitField, objectFitValue } from '../media-fit.js';
import { composeDispose } from '../plugin-contract.js';

export default register({
  type: 'video',
  label: 'Video',
  group: 'media',
  icon: '🎬',
  network: true,
  schemaVersion: 2,
  defaults: () => ({
    url: '', loop: true, autoDuration: true, muted: true,
    fit: 'cover', volume: 1, startSec: 0, endSec: 0, poster: '',
    controls: false,
    captionsUrl: '', captionsLang: 'en', showCaptions: false,
    preventDownload: true,
    hidePictureInPicture: true,
  }),
  schema: () => ({
    fields: [
      { type: 'section', label: 'Source' },
      { key: 'url',    type: 'asset', label: 'Video URL', accept: 'video/mp4,video/webm' },
      { key: 'poster', type: 'asset', label: 'Poster image (shown before play)', accept: 'image/*',
        help: 'Falls back to a black frame. Helps when autoplay is blocked.' },

      { type: 'section', label: 'Clip' },
      { type: 'row', children: [
        { key: 'startSec', type: 'duration', label: 'Start at', min: 0, default: 0 },
        { key: 'endSec',   type: 'duration', label: 'End at',   min: 0, default: 0 },
      ] },

      { type: 'section', label: 'Playback' },
      { type: 'row', children: [
        { key: 'loop',         type: 'toggle', label: 'Loop' },
        { key: 'autoDuration', type: 'toggle', label: 'Match length' },
        { key: 'muted',        type: 'toggle', label: 'Muted' },
      ] },
      { key: 'volume', type: 'number', label: 'Volume', min: 0, max: 1, step: 0.05, slider: true,
        showIf: c => c.muted === false,
        help: 'Browsers usually block sound until the user interacts with the page.' },

      { type: 'section', label: 'Captions / subtitles', collapsed: true },
      { key: 'captionsUrl', type: 'asset', label: 'Caption file (.vtt)', accept: 'text/vtt,.vtt',
        help: 'WebVTT subtitle file. Same-origin or a URL with CORS headers, browsers refuse cross-origin tracks without them.' },
      { type: 'row', children: [
        { key: 'showCaptions', type: 'toggle', label: 'Show by default',
          showIf: c => !!c.captionsUrl },
        { key: 'captionsLang', type: 'text', label: 'Language', placeholder: 'en',
          showIf: c => !!c.captionsUrl },
      ] },

      { type: 'section', label: 'Controls', collapsed: true },
      { key: 'controls', type: 'toggle', label: 'Show controls',
        help: 'Native browser playback controls. Off (default) for signage, on for kiosk demos where viewers may pause/scrub.' },
      { type: 'row', children: [
        { key: 'preventDownload', type: 'toggle', label: 'Disable download menu',
          showIf: c => c.controls },
        { key: 'hidePictureInPicture', type: 'toggle', label: 'Hide PIP button',
          showIf: c => c.controls },
      ] },

      { type: 'section', label: 'Layout' },
      mediaFitField(),
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    if (!c.url) {
      const empty = document.createElement('div');
      empty.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#000;color:rgba(255,255,255,.5);text-align:center;padding:24px;font-family:var(--bb-font, Inter, sans-serif);';
      empty.innerHTML = '<div><div style="font-size:48px;opacity:.5;margin-bottom:8px;">🎬</div><div>Add a video URL, MP4 or WebM.</div></div>';
      container.appendChild(empty);
      return composeDispose(() => empty.remove());
    }
    const v = document.createElement('video');
    // Append start-time fragment via the media-fragments URI spec, natively
    // supported by Chromium/Firefox/Safari, no JS seek needed at load time.
    const startSec = Math.max(0, Number(c.startSec) || 0);
    const endSec   = Math.max(0, Number(c.endSec)   || 0);
    v.src = startSec || endSec
      ? `${c.url}#t=${startSec}${endSec > startSec ? ',' + endSec : ''}`
      : c.url;
    if (c.poster) v.poster = c.poster;
    v.autoplay = true;
    v.playsInline = true;
    v.muted = c.muted !== false;
    if (!v.muted && typeof c.volume === 'number') {
      v.volume = Math.max(0, Math.min(1, c.volume));
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
    v.style.background = '#000';

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
      // re-renders the whole widget, so this stays consistent.
      if (c.showCaptions) {
        v.addEventListener('loadedmetadata', () => {
          for (const t of v.textTracks) if (t.kind === 'subtitles') t.mode = 'showing';
        }, { once: true });
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
    // Surface load failures (404, blocked codec, expired CDN URL) instead of
    // leaving a permanently black video, fires the on-error fallback if one
    // is configured, otherwise shows a visible message.
    v.addEventListener('error', () => {
      if (ctx?.onError?.()) return;
      const err = document.createElement('div');
      err.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000;color:rgba(255,255,255,.55);font:14px/1.5 var(--bb-font, Inter, sans-serif);text-align:center;padding:24px;';
      err.innerHTML = '<div>📵 Video could not be loaded.</div>';
      container.style.position = 'relative';
      container.appendChild(err);
    });
    container.appendChild(v);
    v.play?.().catch(() => {});
    return composeDispose(() => {
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch {}
      v.remove();
    });
  },
});
