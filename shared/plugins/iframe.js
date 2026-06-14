import { register } from './registry.js';
import { composeDispose } from '../plugin-contract.js';
import { isSafeImgUrl } from '../safe-url.js';
import { webEmbedFields, webEmbedDefaults, sandboxTokens } from '../web-embed-fields.js';
import { mediaPlaceholder } from '../media-placeholder.js';

export default register({
  type: 'iframe',
  label: 'Web Page',
  group: 'media',
  icon: '🌐',
  network: true,
  schemaVersion: 2,
  // v2: lockInteraction was introduced defaulting ON (signage-safe — kiosk
  // visitors can't click the embedded page away). Pre-v2 slides were fully
  // interactive, so stored content is stamped to `false` to keep deliberate
  // touch-kiosk setups working; only NEW slides get the locked default.
  migrate(content, fromVersion) {
    const c = { ...content };
    if (fromVersion < 2 && c.lockInteraction === undefined) c.lockInteraction = false;
    return c;
  },
  defaults: () => ({
    ...webEmbedDefaults(), // url:'', reloadSec:0, sandbox:true, allowForms:false, allowPopups:false
    scale: 100, offsetX: 0, offsetY: 0, background: '',
    cacheBust: false, lockInteraction: true,
  }),
  schema: () => {
    // Shared url / reloadSec / sandbox / permission fields (one source of
    // truth with embed.js so the security wording can't drift) — picked by
    // key so they can be distributed across this widget's sections.
    const shared = Object.fromEntries(webEmbedFields().map(f => [f.key, f]));
    return {
      fields: [
        { type: 'section', label: 'Content', key: 'content' },
        shared.url,

        { type: 'section', label: 'Layout', key: 'layout' },
        { key: 'scale', type: 'number', label: 'Zoom', min: 25, max: 400, step: 5, slider: true, suffix: '%',
          help: 'Scale the embedded page to fit the widget, useful for desktop-sized pages on portrait screens.' },
        { type: 'row', children: [
          { key: 'offsetX', type: 'number', label: 'Pan X', min: 0, step: 10, suffix: 'px',
            help: 'Crops this many page pixels off the left edge — zoom into the region of a desktop-sized dashboard that matters.' },
          { key: 'offsetY', type: 'number', label: 'Pan Y', min: 0, step: 10, suffix: 'px',
            help: 'Crops this many page pixels off the top edge.' },
        ] },
        { key: 'background', type: 'color', clearable: true, label: 'Background',
          help: 'Shown behind transparent pages and while loading. Empty = theme background.' },

        { type: 'section', label: 'Behavior', key: 'behavior' },
        shared.reloadSec,
        { key: 'cacheBust', type: 'toggle', label: 'Bypass cache on reload',
          showIf: c => (Number(c.reloadSec) || 0) > 0,
          help: 'Appends a unique timestamp parameter to the URL on every reload so aggressively cached status pages actually refresh.' },

        { type: 'section', label: 'Advanced', key: 'advanced', collapsed: true,
          summary: c => `${c.sandbox === false ? 'sandbox off' : 'sandboxed'} · ${c.lockInteraction !== false ? 'locked' : 'touch-enabled'}` },
        shared.sandbox,
        shared.allowForms,
        shared.allowPopups,
        { key: 'lockInteraction', type: 'toggle', label: 'Lock interaction',
          help: 'Blocks clicks and touches on the embedded page so kiosk visitors can’t click links and navigate it away. Turn off only for interactive touch displays.' },
      ],
    };
  },
  render(slide, container) {
    const c = slide.content ?? {};
    // '' / unset = theme-derived background (render side must use || so the
    // cleared color field falls through, never ??).
    const bg = c.background || '';
    // Block at render-time too, the inspector's "Test" button is advisory, not
    // a guard. Only http(s) / relative URLs reach the iframe; `javascript:`,
    // `data:text/html`, `file:` etc. are rejected to the empty-state.
    if (!c.url || !isSafeImgUrl(c.url)) {
      const empty = c.url
        ? mediaPlaceholder({ icon: '🌐', messageHtml: 'That URL can’t be embedded, use an <strong>https://</strong> address.' })
        : mediaPlaceholder({ icon: '🌐', message: 'Paste a web URL, the page will be embedded.' });
      if (bg) empty.style.background = bg;
      container.appendChild(empty);
      return composeDispose(() => empty.remove());
    }
    // Wrapper clips the panned/zoomed iframe and carries the background that
    // shows behind transparent pages (was a hardcoded #0a0a10 — now themable).
    const wrap = document.createElement('div');
    wrap.className = 'bb-slide bb-slide-iframe';
    wrap.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;';
    wrap.style.background = bg || 'var(--bb-st-bg, #0a0a10)';

    const f = document.createElement('iframe');
    f.dataset.field = 'url scale offsetX offsetY background reloadSec cacheBust';
    f.src = c.url;
    const scale = Math.max(25, Math.min(400, Number(c.scale) || 100)) / 100;
    const offX = Math.max(0, Number(c.offsetX) || 0);
    const offY = Math.max(0, Number(c.offsetY) || 0);
    // Zoom via CSS transform, the iframe renders at logical px, then scales
    // back to fit the widget box. width/height inversely sized so the content
    // believes it has more (or less) room than the box; the pan offsets add
    // extra page-pixels so the cropped region still fills the box edge-to-edge.
    f.style.cssText = 'border:0;display:block;transform-origin:top left;';
    f.style.background = bg || 'var(--bb-st-bg, #0a0a10)';
    f.style.width = offX ? `calc(${100 / scale}% + ${offX}px)` : `${100 / scale}%`;
    f.style.height = offY ? `calc(${100 / scale}% + ${offY}px)` : `${100 / scale}%`;
    if (scale !== 1 || offX || offY) {
      // translate applies FIRST (rightmost), in unscaled page pixels — "pan
      // the page by N px", independent of the zoom factor.
      f.style.transform = `scale(${scale}) translate(${-offX}px, ${-offY}px)`;
    }
    f.referrerPolicy = 'no-referrer';
    // sandboxTokens() is the single place the token string is assembled
    // (allow-scripts + optional allow-forms/allow-popups; NEVER
    // allow-same-origin — see the invariant note in web-embed-fields.js).
    // null = user explicitly disabled sandboxing, attribute omitted entirely.
    const tokens = sandboxTokens(c);
    if (tokens) f.setAttribute('sandbox', tokens);
    wrap.appendChild(f);

    // Interaction lock: transparent shield above the iframe so touch-screen
    // kiosks can't click links and navigate the embedded dashboard away.
    if (c.lockInteraction !== false) {
      const shield = document.createElement('div');
      shield.style.cssText = 'position:absolute;inset:0;pointer-events:auto;background:transparent;';
      wrap.appendChild(shield);
    }
    if (slide.title) {
      const t = document.createElement('div');
      t.className = 'bb-image-title';
      t.textContent = slide.title;
      wrap.appendChild(t);
    }
    container.appendChild(wrap);

    // Auto-reload, useful for status pages and read-only dashboards that
    // don't refresh themselves. Setting src to the same value re-fetches.
    // 5-second floor (documented in the field's help + validate) protects the
    // player from accidental hammering.
    let reloadTimer = null;
    const reloadMs = Math.max(0, Number(c.reloadSec) || 0) * 1000;
    if (reloadMs >= 5000) {
      // cacheBust: a fresh `_av` timestamp per reload defeats aggressively
      // cached status pages that would otherwise replay the cached document.
      const nextSrc = () => {
        if (!c.cacheBust) return c.url;
        try {
          const u = new URL(c.url, location.href);
          u.searchParams.set('_av', Date.now().toString(36));
          return u.toString();
        } catch { return c.url; }
      };
      reloadTimer = setInterval(() => { f.src = nextSrc(); }, reloadMs);
    }
    return composeDispose(() => {
      if (reloadTimer) clearInterval(reloadTimer);
      f.removeAttribute('src');
      wrap.remove();
    });
  },
});
