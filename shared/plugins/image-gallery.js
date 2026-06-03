import { register } from './registry.js';
import { mediaFitField, backgroundSizeValue } from '../media-fit.js';
import { composeDispose } from '../plugin-contract.js';
import { isSafeImgUrl, cssUrl } from '../safe-url.js';

export default register({
  type: 'image-gallery',
  label: 'Image Gallery (Ken Burns)',
  group: 'media',
  icon: '🖼️',
  network: true,
  schemaVersion: 2,
  defaults: () => ({
    urls: [], perImageSec: 5, fit: 'cover', kenBurns: true,
    transition: 'fade', shuffle: false, showCaptions: true,
  }),
  schema: () => ({
    fields: [
      { type: 'section', label: 'Images' },
      { key: 'urls', type: 'list', label: 'Images', bulkAsset: 'image/*',
        itemShape: [
          { key: 'url',     type: 'asset', label: 'Image', accept: 'image/*' },
          { key: 'caption', type: 'text',  label: 'Caption (optional)' },
        ] },

      { type: 'section', label: 'Playback' },
      { type: 'row', children: [
        { key: 'perImageSec', type: 'duration', label: 'Time per image', min: 1, default: 5 },
        { key: 'transition',  type: 'select',   label: 'Transition', options: [
          { value: 'fade',  label: 'Fade' },
          { value: 'slide', label: 'Slide' },
          { value: 'cut',   label: 'Cut' },
        ] },
      ] },
      { type: 'row', children: [
        { key: 'kenBurns',     type: 'toggle', label: 'Ken Burns' },
        { key: 'shuffle',      type: 'toggle', label: 'Shuffle' },
        { key: 'showCaptions', type: 'toggle', label: 'Captions' },
      ] },
      mediaFitField(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    root.className = 'bb-slide bb-slide-gallery';
    root.style.cssText = 'position:relative;width:100%;height:100%;background:#000;overflow:hidden;';
    container.appendChild(root);

    // Normalise to {url, caption} pairs; tolerate legacy string entries.
    // Filter to safe URL schemes only, URLs could come from a pasted CDN
    // link or an asset library, but we still validate.
    let items = (Array.isArray(c.urls) ? c.urls : [])
      .map(x => typeof x === 'string' ? { url: x, caption: '' } : { url: x?.url, caption: x?.caption || '' })
      .filter(it => isSafeImgUrl(it.url));
    if (items.length === 0) {
      root.innerHTML = '<div style="color:currentColor;opacity:.55;padding:40px;font:14px/1.5 var(--bb-font, Inter, sans-serif);text-align:center;"><div style="font-size:48px;opacity:.5;margin-bottom:8px;">🖼️</div><div>Add images in the inspector.</div></div>';
      return composeDispose(() => root.remove());
    }
    if (c.shuffle) {
      // Fisher-Yates, keeps the originals' caption pairing intact.
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
    }
    const transition = ['fade', 'slide', 'cut'].includes(c.transition) ? c.transition : 'fade';
    const showCaptions = c.showCaptions !== false;
    let idx = 0;
    let timer = null;
    const show = () => {
      const it = items[idx % items.length];
      const layer = document.createElement('div');
      // Initial position depends on transition: cut starts visible, slide
      // starts off the right edge, fade starts invisible.
      const initOpacity = transition === 'cut' ? '1' : '0';
      const initTransform = transition === 'slide' ? 'translateX(100%)' : 'none';
      layer.style.cssText = `
        position:absolute;inset:0;
        opacity:${initOpacity};
        transform:${initTransform};
        transition:opacity 800ms ease, transform 800ms ease;
        ${c.kenBurns !== false && transition !== 'slide' ? 'animation: bb-kenburns 7s ease-in-out forwards;' : ''}
      `;
      // Setting the background via the CSSStyleDeclaration API is safer than
      // string interpolation: the browser handles quoting and rejects any
      // attempt at CSS property injection.
      layer.style.background = `#000 ${cssUrl(it.url)} center / ${backgroundSizeValue(c.fit)} no-repeat`;
      // Captions carry the slide's accessible name; mirror onto the layer so
      // screen readers / kiosk overlays have something to announce for a
      // CSS-background image (which has no implicit alt).
      if (it.caption) layer.setAttribute('aria-label', it.caption);
      layer.setAttribute('role', 'img');
      if (showCaptions && it.caption) {
        const cap = document.createElement('div');
        cap.className = 'bb-gallery-caption';
        cap.style.cssText = 'position:absolute;left:0;right:0;bottom:0;padding:1em 1.4em;background:linear-gradient(180deg, transparent, rgba(0,0,0,0.6));color:#fff;font:600 clamp(14px, 2.4cqmin, 22px) var(--bb-font, Inter, sans-serif);text-shadow:0 1px 2px rgba(0,0,0,0.5);';
        cap.textContent = it.caption;
        layer.appendChild(cap);
      }
      root.appendChild(layer);
      requestAnimationFrame(() => { layer.style.opacity = '1'; layer.style.transform = 'translateX(0)'; });
      const prev = layer.previousElementSibling;
      if (prev) {
        if (transition === 'cut') prev.remove();
        else {
          if (transition === 'slide') prev.style.transform = 'translateX(-100%)';
          else prev.style.opacity = '0';
          setTimeout(() => prev?.remove(), 1000);
        }
      }
      idx++;
      timer = setTimeout(show, (c.perImageSec ?? 5) * 1000);
    };
    show();
    // Inject Ken Burns keyframes once
    if (!document.getElementById('bb-kenburns-kf')) {
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
    return composeDispose(() => { clearTimeout(timer); root.remove(); });
  },
});
