import { register } from './registry.js';
import { mediaFitField, backgroundSizeValue } from '../media-fit.js';
import { composeDispose } from '../plugin-contract.js';
import { prefersReducedMotion } from '../animations.js';
import { isSafeImgUrl, cssUrl } from '../safe-url.js';
import { mediaPlaceholder } from '../media-placeholder.js';

// Ken Burns zoom variants. Injected once per document under a versioned id so
// an older player bundle that already injected the single-keyframe 'bb-kenburns'
// style can't shadow the new names.
const KENBURNS_STYLE_ID = 'bb-kenburns-kf-v2';
const KENBURNS_SCALES = {
  subtle: { scale: 1.06, tx: '-1%', ty: '-0.5%' },
  medium: { scale: 1.12, tx: '-2%', ty: '-1%' },
  strong: { scale: 1.20, tx: '-3%', ty: '-1.5%' },
};

function ensureKenBurnsKeyframes() {
  if (document.getElementById(KENBURNS_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = KENBURNS_STYLE_ID;
  style.textContent = Object.entries(KENBURNS_SCALES).map(([name, k]) => `
    @keyframes bb-kenburns-${name} {
      0% { transform: scale(1.0) translate(0,0); }
      100% { transform: scale(${k.scale}) translate(${k.tx}, ${k.ty}); }
    }`).join('\n');
  document.head.appendChild(style);
}

export default register({
  type: 'image-gallery',
  label: 'Image Gallery (Ken Burns)',
  group: 'media',
  icon: '🖼️',
  network: true,
  schemaVersion: 2,
  defaults: () => ({
    urls: [], perImageSec: 5, fit: 'cover',
    kenBurns: true, kenBurnsIntensity: 'medium',
    transition: 'fade', transitionMs: 800,
    shuffle: false, reshuffleEachLoop: false,
    showCaptions: true, showProgress: 'off',
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Images' },
      { key: 'urls', type: 'list', label: 'Images', bulkAsset: 'image/*',
        itemShape: [
          { key: 'url',         type: 'asset',    label: 'Image', accept: 'image/*' },
          { key: 'caption',     type: 'text',     label: 'Caption (optional)' },
          { key: 'durationSec', type: 'duration', label: 'Time for this image (0 = default)', min: 0 },
        ],
        // Soft guidance only — never blocking. A one-image "gallery" renders
        // fine, but the Image widget is the better tool for a single photo.
        validate: v => {
          const n = Array.isArray(v) ? v.length : 0;
          if (n === 0) return { level: 'warn', message: 'Add at least one image — the gallery is empty.' };
          if (n === 1) return { level: 'info', message: 'One image never rotates — for a single photo the Image widget offers more options (focal point, overlay).' };
          return null;
        } },

      { type: 'section', key: 'playback', label: 'Playback' },
      { type: 'row', children: [
        { key: 'perImageSec', type: 'duration', label: 'Time per image', min: 1 },
        { key: 'transition',  type: 'select',   label: 'Transition', buttons: true, options: [
          { value: 'fade',  label: 'Fade' },
          { value: 'slide', label: 'Slide' },
          { value: 'cut',   label: 'Cut' },
        ] },
      ] },
      { key: 'transitionMs', type: 'number', label: 'Transition duration',
        min: 200, max: 3000, step: 100, slider: true, suffix: 'ms',
        help: 'How long the fade or slide between two photos takes.',
        showIf: c => (c.transition ?? 'fade') !== 'cut' },
      { type: 'row', children: [
        { key: 'shuffle', type: 'toggle', label: 'Shuffle',
          help: 'Randomizes the order each time the slide starts playing.' },
        { key: 'reshuffleEachLoop', type: 'toggle', label: 'Reshuffle every loop',
          help: 'Draws a new random order after each full pass instead of replaying the same one.',
          showIf: c => !!c.shuffle },
      ] },

      { type: 'section', key: 'appearance', label: 'Appearance' },
      mediaFitField(),
      { type: 'row', children: [
        { key: 'kenBurns', type: 'toggle', label: 'Ken Burns',
          help: 'Slow zoom-and-pan on each photo. Not applied with the Slide transition.' },
        { key: 'showCaptions', type: 'toggle', label: 'Captions' },
      ] },
      { key: 'kenBurnsIntensity', type: 'select', label: 'Ken Burns intensity', buttons: true,
        options: [
          { value: 'subtle', label: 'Subtle' },
          { value: 'medium', label: 'Medium' },
          { value: 'strong', label: 'Strong' },
        ],
        showIf: c => c.kenBurns !== false && (c.transition ?? 'fade') !== 'slide' },
      { key: 'showProgress', type: 'select', label: 'Progress indicator', buttons: true,
        options: [
          { value: 'off',     label: 'Off' },
          { value: 'dots',    label: 'Dots' },
          { value: 'counter', label: 'Counter' },
        ],
        help: 'Shows the position in the rotation in the bottom-right corner.' },
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    root.className = 'bb-slide bb-slide-gallery';
    // container-type:size pins the caption/progress cq units to THIS box, so
    // the clamp() sizes track the widget slot instead of whatever ancestor
    // happens to be a container.
    root.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;container-type:size;';
    container.appendChild(root);

    // Normalise to {url, caption, durationSec}; tolerate legacy string entries.
    // Filter to safe URL schemes only — URLs could come from a pasted CDN
    // link or an asset library, but we still validate.
    let items = (Array.isArray(c.urls) ? c.urls : [])
      .map(x => typeof x === 'string'
        ? { url: x, caption: '', durationSec: 0 }
        : { url: x?.url, caption: x?.caption || '', durationSec: Math.max(0, Number(x?.durationSec) || 0) })
      .filter(it => isSafeImgUrl(it.url));
    if (items.length === 0) {
      const empty = mediaPlaceholder({ icon: '🖼️', message: 'Add images in the inspector.' });
      root.appendChild(empty);
      return composeDispose(() => root.remove());
    }
    // Letterbox backing behind the photos (only once we actually paint photos —
    // the empty state above stays themed).
    root.style.background = '#000';

    // Fisher-Yates, keeps the originals' caption pairing intact.
    const shuffleItems = () => {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
    };
    if (c.shuffle) shuffleItems();

    const transition = ['fade', 'slide', 'cut'].includes(c.transition) ? c.transition : 'fade';
    const transMs = transition === 'cut' ? 0 : Math.max(100, Math.min(5000, Number(c.transitionMs) || 800));
    const showCaptions = c.showCaptions !== false;
    const perImageSec = Math.max(1, Number(c.perImageSec) || 5);
    // The Ken Burns pan/zoom is real movement and is dropped under
    // prefers-reduced-motion; the cross-fade between photos stays, because an
    // opacity change is not motion and a hard cut every few seconds is worse
    // for the same viewer.
    const kbActive = c.kenBurns !== false && transition !== 'slide' && !prefersReducedMotion();
    const kbIntensity = Object.hasOwn(KENBURNS_SCALES, c.kenBurnsIntensity ?? '') ? c.kenBurnsIntensity : 'medium';
    if (kbActive) ensureKenBurnsKeyframes();

    // Progress indicator (dots / counter), pinned bottom-right above the photo
    // layers. White-on-shadow like the caption — it overlays arbitrary photos,
    // not the slide theme, so theme variables would not guarantee contrast.
    const progressMode = ['dots', 'counter'].includes(c.showProgress) ? c.showProgress : 'off';
    // Dots stop being readable past a dozen images; degrade to the counter.
    const effectiveProgress = progressMode === 'dots' && items.length > 15 ? 'counter' : progressMode;
    let progress = null;
    if (effectiveProgress !== 'off' && items.length > 1) {
      progress = document.createElement('div');
      progress.className = 'bb-gallery-progress';
      progress.style.cssText = 'position:absolute;right:14px;bottom:12px;z-index:5;display:flex;gap:6px;align-items:center;'
        + 'font:600 clamp(11px, 1.8cqmin, 15px) var(--bb-font, Inter, sans-serif);'
        + 'color:rgba(255,255,255,.92);text-shadow:0 1px 2px rgba(0,0,0,.6);';
      root.appendChild(progress);
    }
    const updateProgress = pos => {
      if (!progress) return;
      if (effectiveProgress === 'counter') {
        progress.textContent = `${pos + 1} / ${items.length}`;
        return;
      }
      progress.replaceChildren(...items.map((_, i) => {
        const d = document.createElement('span');
        d.style.cssText = 'width:8px;height:8px;border-radius:50%;'
          + `background:rgba(255,255,255,${i === pos ? '.95' : '.4'});`
          + 'box-shadow:0 1px 2px rgba(0,0,0,.5);';
        return d;
      }));
    };

    let idx = 0;
    let timer = null;
    let current = null; // previous photo layer — tracked explicitly so the progress element is never mistaken for one
    const show = () => {
      // Optional fresh random order after every full pass, so long-running
      // displays don't replay the identical sequence forever.
      if (idx > 0 && idx % items.length === 0 && c.shuffle && c.reshuffleEachLoop) shuffleItems();
      const pos = idx % items.length;
      const it = items[pos];
      const holdSec = it.durationSec > 0 ? it.durationSec : perImageSec;
      const layer = document.createElement('div');
      // Initial position depends on transition: cut starts visible, slide
      // starts off the right edge, fade starts invisible.
      const initOpacity = transition === 'cut' ? '1' : '0';
      const initTransform = transition === 'slide' ? 'translateX(100%)' : 'none';
      // Ken Burns runs for the layer's full on-screen life (hold + outgoing
      // transition) so the motion never freezes mid-hold.
      layer.style.cssText = `
        position:absolute;inset:0;
        opacity:${initOpacity};
        transform:${initTransform};
        transition:opacity ${transMs}ms ease, transform ${transMs}ms ease;
        ${kbActive ? `animation: bb-kenburns-${kbIntensity} ${holdSec + transMs / 1000}s ease-in-out forwards;` : ''}
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
      const prev = current;
      current = layer;
      if (prev) {
        if (transition === 'cut') prev.remove();
        else {
          if (transition === 'slide') prev.style.transform = 'translateX(-100%)';
          else prev.style.opacity = '0';
          setTimeout(() => prev.remove(), transMs + 200);
        }
      }
      updateProgress(pos);
      idx++;
      // Single image: paint once and stop — no perpetual layer churn.
      if (items.length > 1) timer = setTimeout(show, holdSec * 1000);
    };
    show();
    const dispose = composeDispose(() => { clearTimeout(timer); root.remove(); });
    ctx?.signal?.addEventListener('abort', dispose, { once: true });
    return dispose;
  },
});
