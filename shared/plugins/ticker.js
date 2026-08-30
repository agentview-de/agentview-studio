import { register } from './registry.js';
import { colorOverrideDefaults, themeColorSection, applyColorOverrides } from '../widget-color.js';
import { textScaleField } from '../text-scale.js';
import { ensureTickerKeyframes } from '../ticker-keyframes.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';
import { readableOn } from '../background.js';
import { prefersReducedMotion } from '../animations.js';

// How long a tap keeps the ticker paused before it resumes on its own —
// long enough to read a full headline, short enough that a forgotten tap on a
// kiosk doesn't freeze the strip for the next viewer.
const TOUCH_RESUME_MS = 15000;

// Reduced-motion fallback: how long each message is held before the next one
// fades in. A scrolling strip is exactly the thing a motion-sensitive viewer
// asked not to see, but the messages still have to be readable — so the strip
// stops moving and pages instead.
const STILL_HOLD_MS = 6000;
const STILL_FADE_MS = 260;

// Text-design vocabulary, mirroring the Announcement (text.js) font list so the
// same four faces read the same everywhere. 'theme' = follow the slide theme /
// brand-kit font (the previous hard-coded behaviour, kept as the default so
// existing tickers don't change face).
const FONTS = [
  { value: 'theme',   label: 'Theme default' },
  { value: 'sans',    label: 'Sans (Inter)' },
  { value: 'serif',   label: 'Serif (Playfair)' },
  { value: 'mono',    label: 'Mono (JetBrains)' },
  { value: 'display', label: 'Display (Inter Tight)' },
];
const FONT_STACK = {
  theme:   'var(--bb-st-font, Inter, system-ui, sans-serif)',
  sans:    'Inter, system-ui, sans-serif',
  serif:   '"Playfair Display", Georgia, serif',
  mono:    '"JetBrains Mono", ui-monospace, monospace',
  display: '"Inter Tight", Inter, sans-serif',
};
const WEIGHTS = { regular: '400', medium: '500', semibold: '600', bold: '700' };
const TRACKING = { normal: '0', wide: '0.06em', wider: '0.12em' };
// Vertical placement of the strip inside the widget box (only relevant when the
// bar doesn't fill the whole box). `.bb-slide` is a flex COLUMN, so vertical
// placement is justify-content (the main axis) — NOT align-items, which would
// only move the strip horizontally. Same gotcha text.js documents.
const VPOS = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
// Strip thickness. 'full' (default) fills the box exactly like before; the
// others make an intrinsic-height strip whose padding sets the thickness and
// which `barPosition` can move within the box.
const BAR_PAD = { slim: '0.15em', normal: '0.55em', tall: '1.1em' };

// TYPE SIZE — a share of the widget's own height, which for a ticker IS the bar.
//
// This used to be `clamp(18px, 4cqh, 56px)`, and 4cqh only clears the 18 px
// floor once the box is over 450 px tall. A ticker band is 100-200 px. So the
// widget's responsive sizing never fired: every ticker rendered at exactly
// 18 px — 13 % of a normal bar, where a news strip wants around 45 % — and the
// only way out was `textScale`, which every template in the catalog had been
// cranked to 270 % to compensate. These coefficients make the DEFAULT right.
//
// In strip mode the padding is expressed in em, so the strip's height is
// text × (1 + 2 × pad): 1.3× slim, 2.1× normal, 3.2× tall. One coefficient of
// 28cqh therefore lands the strip at roughly 36 % / 59 % / 90 % of the box —
// a sensible progression from one number.
const TEXT_CQH_FULL = 46;
const TEXT_CQH_STRIP = 28;

export default register({
  type: 'ticker',
  label: 'News Ticker',
  group: 'basic',
  icon: '📜',
  schemaVersion: 3,
  defaults: () => ({ ...colorOverrideDefaults(),
    items: [
      { text: 'Welcome to agentView Studio' },
      { text: 'Edit these messages in the inspector' },
      { text: 'Drag to reorder · paste from a spreadsheet' },
    ],
    leadLabel: '',
    speed: 80,
    separator: '•',
    direction: 'ltr',
    pauseOnHover: false,
    solidBackground: false,
    edgeFade: true,
    textScale: 100,
    font: 'theme',
    fontWeight: 'bold',
    uppercase: false,
    letterSpacing: 'normal',
    barHeight: 'full',
    barPosition: 'middle',
    theme: 'minimal-dark',
  }),
  // v2 → v3: the base type size was wrong at every realistic bar height (see
  // TEXT_CQH_FULL above), so a stored `textScale` above 100 is almost always
  // compensation for that bug rather than a design decision — carrying it
  // forward would multiply the fix and hand the user a ticker three times too
  // big. Values BELOW 100 are kept: "smaller than normal" is the one intent the
  // old scale could express that the fix does not grant for free.
  migrate(content, from) {
    const c = { ...content };
    if (from < 3 && (Number(c.textScale) || 100) > 100) c.textScale = 100;
    return c;
  },
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'items', type: 'table', label: 'Ticker messages',
        columns: [
          { key: 'text', label: 'Message' },
          { key: 'accent', label: 'Highlight', type: 'toggle' },
        ] },
      { key: 'leadLabel', type: 'text', label: 'Leading label', placeholder: '+++ BREAKING +++',
        help: 'Pinned badge at the start of the ticker — messages scroll past behind it. Leave empty for none.' },
      { key: 'separator', type: 'text', label: 'Separator', placeholder: '•', tier: 'advanced' },

      // The bar's shape is a layout decision, not a fine-tuning one: it is the
      // first thing anyone changes after typing the messages, so it is not
      // buried under "advanced" with the letter-spacing.
      { type: 'section', key: 'appearance', label: 'Appearance',
        summary: c => `${c.barHeight ?? 'full'}${c.solidBackground ? ' · solid' : ''}` },
      { key: 'barHeight', type: 'select', label: 'Bar height', buttons: true, options: [
        { value: 'full',   label: 'Full' },
        { value: 'slim',   label: 'Slim' },
        { value: 'normal', label: 'Normal' },
        { value: 'tall',   label: 'Tall' },
      ], help: 'Full fills the whole widget box. Slim / Normal / Tall make a strip you can place inside it.' },
      { key: 'barPosition', type: 'align', vertical: true, label: 'Position in box',
        showIf: c => (c.barHeight ?? 'full') !== 'full',
        help: 'Where the strip sits when it doesn’t fill the whole box.' },
      { key: 'solidBackground', type: 'toggle', label: 'Solid background',
        help: 'Fills the bar with the theme background colour, turning the strip into a self-contained bar. Leave off to overlay the ticker transparently on the content behind it.' },
      { key: 'font', type: 'select', label: 'Font', options: FONTS, tier: 'advanced',
        help: 'Theme default follows the slide theme / brand-kit font.' },
      { ...textScaleField(), tier: 'advanced' },
      { key: 'fontWeight', type: 'select', label: 'Weight', buttons: true, tier: 'advanced', options: [
        { value: 'regular',  label: 'Regular' },
        { value: 'medium',   label: 'Medium' },
        { value: 'semibold', label: 'Semibold' },
        { value: 'bold',     label: 'Bold' },
      ] },
      { type: 'row', children: [
        { key: 'uppercase', type: 'toggle', label: 'Uppercase', tier: 'advanced' },
        { key: 'letterSpacing', type: 'select', label: 'Letter spacing', buttons: true, tier: 'advanced', options: [
          { value: 'normal', label: 'Normal' },
          { value: 'wide',   label: 'Wide' },
          { value: 'wider',  label: 'Wider' },
        ] },
      ] },
      { key: 'edgeFade', type: 'toggle', label: 'Fade at the edges', tier: 'advanced',
        help: 'Messages dissolve in and out at the ends of the strip instead of being cut off mid-letter.' },

      { type: 'section', key: 'behavior', label: 'Behavior',
        summary: c => `${c.speed ?? 80} px/s` },
      { key: 'speed', type: 'number', label: 'Speed', min: 20, max: 300, step: 10, slider: true, suffix: ' px/s',
        help: 'How far the text travels each second, measured on the rendered strip — 80 px/s is a comfortable reading pace. Ignored when the display prefers reduced motion: the strip then holds each message still instead of scrolling.' },
      // ltr (default) scrolls the text right→left; rtl scrolls left→right —
      // the natural direction for Arabic / Hebrew content and a popular flip.
      { key: 'direction', type: 'select', label: 'Direction', buttons: true, tier: 'advanced', options: [
        { value: 'ltr', label: '← Right to left' },
        { value: 'rtl', label: '→ Left to right' },
      ], help: 'Right to left is the classic news-ticker direction; left to right suits Arabic and Hebrew content.' },
      { key: 'pauseOnHover', type: 'toggle', label: 'Pause on hover / tap', tier: 'advanced',
        help: 'Useful for interactive kiosks — hovering or tapping pauses the ticker so a message can be read in full; it resumes on its own.' },

      ...themeColorSection(),
    ],
  }),
  looks: () => [
    { id: 'breaking',  name: 'Breaking',  patch: { leadLabel: 'BREAKING', uppercase: true, fontWeight: 'bold', solidBackground: true, speed: 110 } },
    { id: 'fast',      name: 'Fast',      patch: { speed: 200 } },
    { id: 'bold-caps', name: 'Bold caps', patch: { uppercase: true, fontWeight: 'bold', letterSpacing: 'wide' } },
    { id: 'top-bar',   name: 'Top bar',   patch: { barHeight: 'normal', barPosition: 'top', solidBackground: true } },
    { id: 'calm',      name: 'Calm',      patch: { speed: 40, fontWeight: 'regular', uppercase: false } },
  ],
  render(slide, container, ctx) {
    ensureTickerKeyframes();
    const c = slide.content ?? {};
    // A list of lines is the shape a person writes by hand, and the ticker
    // accepted only an array — so an imported or hand-edited playlist carrying
    // "Line one\nLine two" rendered an EMPTY bar with nothing to say about it.
    // The array already tolerates plain-string entries; this extends the same
    // tolerance one level up, exactly as kpi-cards does for its sparkline
    // history. Splitting on newlines only: a message may well contain a comma.
    const rawItems = typeof c.items === 'string'
      ? c.items.split(/\r?\n/).map(s => s.trim())
      : (Array.isArray(c.items) ? c.items : []);
    const items = rawItems
      .map(i => (typeof i === 'string' ? { text: i } : { text: i?.text, accent: !!i?.accent }))
      .filter(i => i.text);
    const sep = c.separator ?? '•';
    const dir = c.direction === 'rtl' ? 'rtl' : 'ltr';
    // Text-size multiplier consumed by the font clamps below. Floor guards
    // against a stored 0/NaN freezing the font at zero.
    const scale = Math.max(0.2, (Number(c.textScale) || 100) / 100);
    const speed = Math.max(10, Number(c.speed) || 80);
    const reduced = prefersReducedMotion();

    // Text-design knobs (all default to the previous hard-coded values, so a
    // stored ticker renders byte-identically until the user touches them).
    const fam = FONT_STACK[c.font] ?? FONT_STACK.theme;
    const weight = WEIGHTS[c.fontWeight] ?? '700';
    const tracking = TRACKING[c.letterSpacing] ?? '0';
    const transform = c.uppercase ? 'text-transform:uppercase;' : '';
    const barHeight = BAR_PAD[c.barHeight] ? c.barHeight : 'full';
    const fullHeight = barHeight === 'full';
    const solid = !!c.solidBackground;
    const edgeFade = c.edgeFade !== false;

    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-ticker bb-theme-${c.theme ?? 'minimal-dark'}`;
    // The strip is placed inside the box via the root's justify-content (the
    // root is an explicit flex COLUMN). solidBackground paints the theme
    // background colour so the strip reads as a self-contained bar; without it
    // the ticker is transparent and overlays whatever sits behind it. The theme
    // classes only define --bb-st-bg as a variable (they don't paint it), so we
    // apply it here — in 'full' mode on the whole root, in strip modes on the
    // bar (below) so only the strip is filled.
    //
    // padding:0 is load-bearing. `.bb-slide` pads itself with clamp(12px, 3%,
    // 64px) for reading text on a page, and a percentage padding resolves
    // against the INLINE size — so a full-width ticker spent ~115 px of a
    // 140 px band on padding and rendered a 25 px bar inside it. A ticker is a
    // bar, not a page; the track and the lead badge carry their own insets.
    // (rss.js's ticker mode already overrides the same padding in CSS.)
    root.style.cssText += 'width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;padding:0;'
      + 'justify-content:' + (VPOS[c.barPosition] ?? 'center') + ';'
      + ((fullHeight && solid) ? 'background:var(--bb-st-bg,#0a0a10);' : 'background:transparent;')
      + 'color:var(--bb-st-fg,#f1f1f4);';
    root.style.containerType = 'size';
    root.style.setProperty('--bb-ticker-text-scale', String(scale));

    if (!items.length) {
      // Editor-facing hint (a configured player never shows this). ctx.t is
      // identity in the player; the admin overlay may translate the key.
      const t = ctx?.t ?? (s => s);
      root.innerHTML = `<div style="opacity:.55;padding:0 24px;font-family:var(--bb-font,Inter,sans-serif);">${escapeHtml(t('Add ticker messages in the inspector.'))}</div>`;
      container.appendChild(root);
      return composeDispose(() => root.remove());
    }

    // Base text style shared by the scrolling track and the lead badge.
    const cqh = fullHeight ? TEXT_CQH_FULL : TEXT_CQH_STRIP;
    const baseCss = `font-family:${fam};font-size:calc(clamp(12px,${cqh}cqh,160px) * var(--bb-ticker-text-scale,1));`
      + `line-height:1;font-weight:${weight};letter-spacing:${tracking};${transform}`;

    // The bar — a full-width strip holding the lead badge + scrolling track.
    // 'full' fills the box; the others are intrinsic-height strips (padding
    // sets the thickness) that the root's align-items positions.
    const bar = document.createElement('div');
    // The strip paddings are in `em` so the thickness tracks the type — which
    // only works if the BAR carries the type size. It did not: `em` resolved
    // against the inherited 16 px, so "Slim" and "Tall" differed by a couple of
    // pixels and every strip hugged its text. baseCss (font-size included) goes
    // on the bar; the copies restate it because they are what the marquee moves.
    bar.style.cssText = `display:flex;align-items:center;overflow:hidden;width:100%;${baseCss}`
      + (fullHeight ? 'height:100%;' : `padding-block:${BAR_PAD[barHeight]};`)
      + ((!fullHeight && solid) ? 'background:var(--bb-st-bg,#0a0a10);' : '');

    // Optional pinned badge — a sibling flex item OUTSIDE the animated track
    // (the two-copy -50% loop must not include static content), so messages
    // scroll past behind its edge.
    const leadLabel = typeof c.leadLabel === 'string' ? c.leadLabel.trim() : '';
    let lead = null;
    if (leadLabel) {
      lead = document.createElement('div');
      lead.style.cssText = 'flex:none;display:flex;align-items:center;align-self:stretch;padding:0 0.9em;white-space:nowrap;'
        + 'background:var(--bb-st-accent,#8b5cf6);'
        + baseCss + 'font-weight:800;';
      lead.textContent = leadLabel;
      // rtl tickers read from the right — anchor the badge on that side.
      if (dir === 'rtl') lead.style.order = '2';
    }

    // Clipping wrapper for the animated track, so the track loops within the
    // space remaining next to the badge instead of the whole bar.
    const clip = document.createElement('div');
    clip.style.cssText = 'flex:1 1 auto;min-width:0;overflow:hidden;display:flex;align-items:center;';
    if (edgeFade && !reduced) {
      // Letters dissolve at the ends instead of being sliced by the clip edge.
      // A mask, not a gradient overlay: an overlay would have to guess the
      // colour behind a transparent ticker, and get it wrong on every slide.
      const fade = 'linear-gradient(to right, transparent 0, #000 2.2em, #000 calc(100% - 2.2em), transparent 100%)';
      clip.style.webkitMaskImage = fade;
      clip.style.maskImage = fade;
    }

    const viewport = document.createElement('div');
    viewport.style.cssText = 'white-space:nowrap;will-change:transform;display:inline-flex;';
    const spanFor = it => (it.accent
      ? `<span style="font-weight:800;color:var(--bb-st-accent,#8b5cf6);">${escapeHtml(it.text)}</span>`
      : escapeHtml(it.text));
    const oneCopy = items.map(spanFor).join(`<span style="opacity:.5;margin:0 1.2em;color:var(--bb-st-accent,#8b5cf6);">${escapeHtml(sep)}</span>`);
    // Build each copy as a real element and set baseCss via .style.cssText —
    // font stacks contain double quotes ("Playfair Display") that would close
    // an inline style="…" attribute early if injected as an HTML string.
    const makeBlock = (repeat = 1) => {
      const s = document.createElement('span');
      s.style.cssText = `padding:0 1.2em;${baseCss}`;
      s.innerHTML = Array.from({ length: repeat }, () => oneCopy)
        .join(`<span style="opacity:.5;margin:0 1.2em;color:var(--bb-st-accent,#8b5cf6);">${escapeHtml(sep)}</span>`);
      return s;
    };

    clip.appendChild(viewport);
    if (lead) bar.appendChild(lead);
    bar.appendChild(clip);
    root.appendChild(bar);
    container.appendChild(root);

    // The lead badge is painted with the theme accent, and the accent can be
    // anything — a light lilac on gradient-purple, a light amber on
    // bistro-warm. Its ink is derived from that colour's luminance rather than
    // assumed: the previous `color: var(--bb-st-bg)` is a GRADIENT string on
    // most themes, an invalid colour, so the declaration was dropped and the
    // badge inherited the theme's light text — light on light, unreadable on
    // three of the five gradient themes. Read after the root is in the document
    // so a brand-kit accent or a per-widget override is what we measure.
    if (lead) {
      const accent = getComputedStyle(root).getPropertyValue('--bb-st-accent').trim();
      lead.style.color = readableOn(accent) ?? 'var(--bb-st-bg,#0a0a10)';
    }

    // ---- Reduced motion: hold each message still instead of scrolling -------
    if (reduced) {
      viewport.style.display = 'block';
      viewport.style.transition = `opacity ${STILL_FADE_MS}ms linear`;
      clip.style.justifyContent = 'center';
      let idx = 0;
      const paint = () => {
        const s = document.createElement('span');
        s.style.cssText = `padding:0 1.2em;${baseCss}`;
        s.innerHTML = spanFor(items[idx % items.length]);
        viewport.replaceChildren(s);
      };
      paint();
      let fadeTimer = 0;
      const step = () => {
        if (items.length < 2) return;
        viewport.style.opacity = '0';
        fadeTimer = setTimeout(() => { idx++; paint(); viewport.style.opacity = '1'; }, STILL_FADE_MS);
      };
      const cycle = items.length > 1 ? setInterval(step, STILL_HOLD_MS) : 0;
      return composeDispose(() => { clearInterval(cycle); clearTimeout(fadeTimer); root.remove(); });
    }

    // ---- Marquee ------------------------------------------------------------
    // Duration is derived from the MEASURED track, not from a character count.
    // The old estimate (~16 px per character) was written against a font size
    // that turned out to be pinned at 18 px, so "80 px/s" actually travelled at
    // 44 — the one number in this widget a user can reason about, and it was
    // wrong by nearly half. A synchronous estimate still starts the animation
    // on the first frame; the measurement corrects it as soon as there is a
    // layout to measure.
    const kf = dir === 'rtl' ? 'bb-ticker-scroll-rtl' : 'bb-ticker-scroll';
    const setLoop = (halfWidthPx) => {
      const dur = Math.max(4, halfWidthPx / speed);
      viewport.style.animation = `${kf} ${dur.toFixed(2)}s linear infinite`;
    };
    const oneCopyText = items.map(i => i.text).join('   ' + sep + '   ');
    viewport.append(makeBlock(), makeBlock());
    setLoop(Math.max(240, oneCopyText.length * 16 * scale));

    let raf = 0;
    const fit = () => {
      const clipW = clip.clientWidth;
      const block = viewport.firstElementChild;
      if (!block || !clipW) return false;
      const copyW = block.getBoundingClientRect().width;
      if (!copyW) return false;
      // A track shorter than its window leaves a hole: two copies of a single
      // short message scroll past and then nothing follows for the rest of the
      // strip. Repeat the content until one block covers the window, then keep
      // the two-block, translateX(-50%) loop that makes the seam invisible.
      const repeat = Math.max(1, Math.ceil(clipW / copyW));
      if (repeat > 1) {
        viewport.replaceChildren(makeBlock(repeat), makeBlock(repeat));
      }
      setLoop(viewport.getBoundingClientRect().width / 2);
      return true;
    };
    // Two attempts: the first covers the common case, the second covers a mount
    // into a container that has not been laid out yet (a fresh canvas frame).
    raf = requestAnimationFrame(() => { if (!fit()) raf = requestAnimationFrame(fit); });
    // Webfonts land after the first paint and change every width on the strip.
    let fontsDone = false;
    document.fonts?.ready?.then(() => { if (!fontsDone) fit(); }).catch(() => {});

    let resumeTimer = 0;
    if (c.pauseOnHover) {
      // Play-state toggle, common on news tickers and kiosks where viewers
      // want to read a longer message without it scrolling out. Mouse pauses
      // while hovering; touch (no hover state) toggles per tap with an
      // auto-resume so a stray tap can't freeze the strip forever.
      const pause = () => { viewport.style.animationPlayState = 'paused'; };
      const resume = () => { viewport.style.animationPlayState = 'running'; };
      // Browsers fire synthetic mouseenter/leave after a tap — ignore mouse
      // events right after a touch so the tap toggle isn't overridden.
      let touchedAt = 0;
      root.addEventListener('touchstart', () => {
        touchedAt = Date.now();
        clearTimeout(resumeTimer);
        if (viewport.style.animationPlayState === 'paused') resume();
        else { pause(); resumeTimer = setTimeout(resume, TOUCH_RESUME_MS); }
      }, { passive: true });
      root.addEventListener('mouseenter', () => { if (Date.now() - touchedAt > 800) pause(); });
      root.addEventListener('mouseleave', () => { if (Date.now() - touchedAt > 800) resume(); });
    }

    return composeDispose(() => {
      fontsDone = true;
      cancelAnimationFrame(raf);
      clearTimeout(resumeTimer);
      root.remove();
    });
  },
});
