import { register } from './registry.js';
import { mediaFitField, backgroundSizeValue } from '../media-fit.js';
import { composeDispose } from '../plugin-contract.js';
import { cssUrl } from '../safe-url.js';
import { mediaPlaceholder } from '../media-placeholder.js';
import { refreshSecField } from '../refresh-field.js';
import { mixedContentWarning } from '../web-embed-fields.js';

// Ken Burns keyframes — same id + frames as image-gallery.js injects, so
// whichever widget renders first defines them once and both reuse the sheet.
function ensureKenBurnsKeyframes() {
  if (document.getElementById('bb-kenburns-kf')) return;
  const style = document.createElement('style');
  style.id = 'bb-kenburns-kf';
  style.textContent = `
    @keyframes bb-kenburns {
      0% { transform: scale(1.0) translate(0,0); }
      100% { transform: scale(1.12) translate(-2%, -1%); }
    }
  `;
  document.head.appendChild(style);
}

// Cache-buster for auto-refresh: only http(s) sources can change server-side
// under the same URL; data:/blob:/asset references are immutable snapshots.
function cacheBust(url) {
  if (!/^https?:/i.test(url)) return url;
  return url + (url.includes('?') ? '&' : '?') + 'bb-bust=' + Date.now();
}

export default register({
  type: 'image',
  label: 'Image',
  group: 'media',
  icon: '🖼️',
  // Marked network: so the inspector exposes the "On error" fallback section —
  // we probe the image and fire ctx.onError when the URL fails to load.
  network: true,
  // v2: `overlay` changed from a 0–1 fraction to a 0–100 percentage so the
  // slider reads like textScale and the focal sliders ("35%" not "0.35").
  schemaVersion: 2,
  migrate(content, fromVersion) {
    const next = { ...content };
    if (fromVersion < 2) {
      const raw = Number(next.overlay);
      const frac = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
      next.overlay = Math.round(frac * 100);
    }
    return next;
  },
  defaults: () => ({
    url: '', alt: '',
    fit: 'cover', focusX: 50, focusY: 50, letterboxColor: '',
    overlay: 0, overlayStyle: 'solid', kenBurns: false, cornerRadius: 0,
    refreshSec: 0,
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'url',  type: 'asset', label: 'Image URL or uploaded asset', accept: 'image/*',
        test: 'image',
        validate: v => mixedContentWarning(v) },
      { key: 'alt',  type: 'text', label: 'Alt text',
        help: 'Describes the image for screen readers and kiosk overlays. Leave blank for purely decorative images.' },

      { type: 'section', key: 'layout', label: 'Layout' },
      mediaFitField(),
      { type: 'row', children: [
        { key: 'focusX', type: 'number', label: 'Focal X', min: 0, max: 100, step: 5, slider: true, suffix: '%', tier: 'advanced',
          help: 'Which part of the photo stays visible when Cover crops it — e.g. keep a face or logo centred.' },
        { key: 'focusY', type: 'number', label: 'Focal Y', min: 0, max: 100, step: 5, slider: true, suffix: '%', tier: 'advanced' },
      ], showIf: c => (c.fit ?? 'cover') === 'cover' },
      { key: 'letterboxColor', type: 'color', label: 'Letterbox colour', clearable: true, tier: 'advanced',
        showIf: c => c.fit === 'contain',
        help: 'Fills the bars beside or above the photo when Contain letterboxes it. Empty = transparent, the slide background shows through.' },

      { type: 'section', key: 'appearance', label: 'Appearance' },
      { key: 'overlay', type: 'number', label: 'Dark overlay', min: 0, max: 100, step: 5, slider: true, suffix: '%',
        help: 'Darkens the image so overlaid text stays readable.' },
      { key: 'overlayStyle', type: 'select', label: 'Overlay style', buttons: true, tier: 'advanced',
        options: [
          { value: 'solid',  label: 'Solid' },
          { value: 'bottom', label: 'Bottom gradient' },
          { value: 'top',    label: 'Top gradient' },
        ],
        showIf: c => (Number(c.overlay) || 0) > 0,
        help: 'Gradients darken only one edge — keeps a title readable without dimming the whole photo.' },
      { key: 'kenBurns', type: 'toggle', label: 'Ken Burns zoom', tier: 'advanced',
        help: 'Slow continuous zoom that gives a static photo some life — nice for lobby and ambience slides.' },
      { key: 'cornerRadius', type: 'number', label: 'Corner radius', min: 0, max: 48, step: 4, slider: true, suffix: 'px', tier: 'advanced',
        help: 'Rounds the photo corners to match card-style layouts.' },

      { type: 'section', key: 'behavior', label: 'Behavior', collapsed: true,
        summary: c => (Number(c.refreshSec) || 0) > 0 ? `↻ ${Number(c.refreshSec)}s` : 'off' },
      { ...refreshSecField({
        help: 'Reloads the image on a timer with a cache-buster — for webcam stills, exported dashboard PNGs or menu images regenerated server-side under the same URL. Positive values below 5 seconds are raised to the 5-second player minimum.',
      }), tier: 'advanced' },
    ],
  }),
  looks: () => [
    { id: 'cover', name: 'Cover', patch: {
      fit: 'cover', overlay: 0, kenBurns: false, cornerRadius: 0 } },
    { id: 'contain', name: 'Contain', patch: {
      fit: 'contain', overlay: 0, kenBurns: false, cornerRadius: 0 } },
    { id: 'ken-burns', name: 'Ken Burns', patch: {
      fit: 'cover', kenBurns: true, cornerRadius: 0 } },
    { id: 'with-overlay', name: 'With overlay', patch: {
      fit: 'cover', overlay: 45, overlayStyle: 'bottom' } },
    { id: 'rounded-card', name: 'Rounded card', patch: {
      fit: 'cover', cornerRadius: 24, overlay: 20, overlayStyle: 'solid' } },
  ],
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    root.className = 'bb-slide bb-slide-image';
    root.style.position = 'relative';
    root.style.width = '100%';
    root.style.height = '100%';
    // Clips the Ken Burns over-zoom and makes cornerRadius actually crop.
    root.style.overflow = 'hidden';
    const radius = Math.max(0, Number(c.cornerRadius) || 0);
    if (radius > 0) root.style.borderRadius = `${radius}px`;
    // Accessible name up front (not only after a successful probe) so the
    // empty and error states keep the role/label too.
    root.setAttribute('role', 'img');
    if (c.alt) root.setAttribute('aria-label', c.alt);

    let timer = 0;
    let disposed = false;
    const gone = () => disposed || !!ctx?.signal?.aborted;

    if (c.url) {
      // The image is painted on its own absolute layer (not on root) so the
      // Ken Burns transform can't scale the overlay/title stacked above it.
      const layer = document.createElement('div');
      layer.dataset.field = 'url fit focusX focusY letterboxColor kenBurns cornerRadius refreshSec';
      layer.style.position = 'absolute';
      layer.style.inset = '0';
      layer.style.backgroundRepeat = 'no-repeat';
      layer.style.backgroundSize = backgroundSizeValue(c.fit);
      // Focal-point cropping: with fit=cover, background-position controls
      // which part of the image stays visible when the slot crops it.
      const fx = Math.max(0, Math.min(100, Number(c.focusX ?? 50)));
      const fy = Math.max(0, Math.min(100, Number(c.focusY ?? 50)));
      layer.style.backgroundPosition = `${fx}% ${fy}%`;
      // Default transparent so PNG transparency / contain-letterboxing reveals
      // the widget background; letterboxColor opts into a brand-coloured box.
      layer.style.backgroundColor = c.letterboxColor || 'transparent';
      if (c.kenBurns) {
        ensureKenBurnsKeyframes();
        layer.style.animation = 'bb-kenburns 24s ease-in-out infinite alternate';
      }
      root.appendChild(layer);

      let painted = false;
      let errorEl = null;
      // Probe the URL before painting it as a CSS background: CSS background
      // failures are silent — without this a 404 renders as a blank widget
      // and never fires the on-error fallback chain. Auto-refresh reuses the
      // same probe-then-paint path so a failed reload never flashes a broken
      // frame: the last good image simply stays up.
      const load = (src) => {
        if (gone()) return;
        const probe = new Image();
        probe.onload = () => {
          if (gone()) return;
          // cssUrl() canonically quotes + scheme-validates the URL so a stray
          // `)` or quote can't break out of the CSS url() and inject rules.
          const bg = cssUrl(src);
          if (!bg) { probe.onerror(); return; }
          if (errorEl) { errorEl.remove(); errorEl = null; }
          layer.style.backgroundImage = bg;
          painted = true;
        };
        probe.onerror = () => {
          // Refresh failures keep the last good frame instead of erroring out.
          if (gone() || painted) return;
          if (ctx?.onError?.()) return;
          if (!errorEl) {
            errorEl = mediaPlaceholder({ icon: '🖼️', message: '⚠️ Image could not be loaded.' });
            root.appendChild(errorEl);
          }
        };
        probe.src = src;
      };
      load(c.url);

      const refreshSec = Math.max(0, Number(c.refreshSec) || 0);
      if (refreshSec > 0) {
        // 5-second player floor (see refreshSecField contract).
        timer = setInterval(() => load(cacheBust(c.url)), Math.max(5000, refreshSec * 1000));
      }
    } else {
      root.appendChild(mediaPlaceholder({
        icon: '🖼️',
        message: 'Pick an image from the library or paste a URL into the form.',
      }));
    }

    // Overlay stored as 0–100 % since schemaVersion 2 (migrate handles v1).
    const alpha = Math.max(0, Math.min(100, Number(c.overlay) || 0)) / 100;
    if (alpha > 0) {
      const ov = document.createElement('div');
      ov.dataset.field = 'overlay overlayStyle';
      ov.style.position = 'absolute';
      ov.style.inset = '0';
      ov.style.pointerEvents = 'none';
      const style = c.overlayStyle || 'solid';
      ov.style.background =
        style === 'bottom' ? `linear-gradient(to top, rgba(0,0,0,${alpha}), rgba(0,0,0,0) 60%)`
        : style === 'top'  ? `linear-gradient(to bottom, rgba(0,0,0,${alpha}), rgba(0,0,0,0) 60%)`
        :                    `rgba(0,0,0,${alpha})`;
      root.appendChild(ov);
    }
    if (slide.title) {
      const t = document.createElement('div');
      t.className = 'bb-image-title';
      t.textContent = slide.title;
      root.appendChild(t);
    }
    container.appendChild(root);
    return composeDispose(() => { disposed = true; clearInterval(timer); root.remove(); });
  },
});
