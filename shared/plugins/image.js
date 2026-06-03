import { register } from './registry.js';
import { mediaFitField, backgroundSizeValue } from '../media-fit.js';
import { composeDispose } from '../plugin-contract.js';
import { cssUrl } from '../safe-url.js';

export default register({
  type: 'image',
  label: 'Image',
  group: 'media',
  icon: '🖼️',
  // Marked network: so the inspector exposes the "On error" fallback section —
  // we now probe the image and fire ctx.onError when the URL fails to load.
  network: true,
  schemaVersion: 1,
  defaults: () => ({ url: '', alt: '', fit: 'cover', overlay: 0.0, focusX: 50, focusY: 50 }),
  schema: () => ({
    fields: [
      { key: 'url',  type: 'asset', label: 'Image URL or uploaded asset', accept: 'image/*' },
      { key: 'alt',  type: 'text', label: 'Alt text',
        help: 'Describes the image for screen readers and kiosk overlays. Leave blank for purely decorative images.' },
      mediaFitField('Fit Mode'),
      { type: 'row', children: [
        { key: 'focusX', type: 'number', label: 'Focal X (%)', min: 0, max: 100, step: 5, slider: true },
        { key: 'focusY', type: 'number', label: 'Focal Y (%)', min: 0, max: 100, step: 5, slider: true },
      ], showIf: c => (c.fit ?? 'cover') === 'cover' },
      { key: 'overlay', type: 'number', label: 'Dark overlay', min: 0, max: 1, step: 0.05, slider: true },
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    root.className = 'bb-slide bb-slide-image';
    root.style.position = 'relative';
    root.style.width = '100%';
    root.style.height = '100%';
    if (c.url) {
      // Probe the URL before painting it as a CSS background: CSS background
      // failures are silent, without this a 404 or unreachable URL renders
      // as a blank widget and never fires the on-error fallback chain.
      const probe = new Image();
      probe.onload = () => {
        // cssUrl() canonically quotes + scheme-validates the URL so a stray
        // `)` or quote can't break out of the CSS url() and inject rules.
        const bg = cssUrl(c.url);
        if (!bg) { probe.onerror(); return; }
        root.style.backgroundImage = bg;
        root.style.backgroundSize = backgroundSizeValue(c.fit);
        // Focal-point cropping: with fit=cover, background-position controls
        // which part of the image stays visible when the slot crops it.
        // Useful when a face or logo sits off-centre.
        const fx = Math.max(0, Math.min(100, Number(c.focusX ?? 50)));
        const fy = Math.max(0, Math.min(100, Number(c.focusY ?? 50)));
        root.style.backgroundPosition = `${fx}% ${fy}%`;
        root.style.backgroundRepeat = 'no-repeat';
        // Transparent so PNG transparency / contain-letterboxing reveals the
        // widget background (general background tool).
        root.style.backgroundColor = 'transparent';
        // Surface the alt text as an aria-label for screen readers / kiosk
        // overlays, CSS backgrounds normally have no accessible name.
        if (c.alt) root.setAttribute('aria-label', c.alt);
        root.setAttribute('role', 'img');
      };
      probe.onerror = () => {
        if (ctx?.onError?.()) return;
        root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:rgba(255,255,255,.55);font:14px/1.5 var(--bb-font, Inter, sans-serif);text-align:center;padding:24px;background:#0a0a10;"><div><div style="font-size:48px;opacity:.5;margin-bottom:8px;">🖼️</div><div>⚠️ Image could not be loaded.</div></div></div>`;
      };
      probe.src = c.url;
    } else {
      root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:rgba(255,255,255,.5);font:14px/1.5 var(--bb-font, Inter, sans-serif);text-align:center;padding:24px;background:linear-gradient(135deg,#1a1a2e,#0a0a10);">
        <div>
          <div style="font-size:48px;opacity:.5;margin-bottom:8px;">🖼️</div>
          <div>Pick an image from the library<br>or paste a URL into the form.</div>
        </div>
      </div>`;
    }
    if ((c.overlay ?? 0) > 0) {
      const ov = document.createElement('div');
      ov.style.position = 'absolute';
      ov.style.inset = '0';
      ov.style.background = `rgba(0,0,0,${c.overlay})`;
      root.appendChild(ov);
    }
    if (slide.title) {
      const t = document.createElement('div');
      t.className = 'bb-image-title';
      t.textContent = slide.title;
      root.appendChild(t);
    }
    container.appendChild(root);
    return composeDispose(() => root.remove());
  },
});
