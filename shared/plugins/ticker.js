import { register } from './registry.js';
import { colorOverrideDefaults, themeColorSection, applyColorOverrides } from '../widget-color.js';
import { textScaleField } from '../text-scale.js';
import { ensureTickerKeyframes } from '../ticker-keyframes.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';

// How long a tap keeps the ticker paused before it resumes on its own —
// long enough to read a full headline, short enough that a forgotten tap on a
// kiosk doesn't freeze the strip for the next viewer.
const TOUCH_RESUME_MS = 15000;

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
// bar doesn't fill the whole box). Maps to the root's align-items.
const VPOS = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
// Strip thickness. 'full' (default) fills the box exactly like before; the
// others make an intrinsic-height strip whose padding sets the thickness and
// which `barPosition` can move within the box.
const BAR_PAD = { slim: '0.15em', normal: '0.55em', tall: '1.1em' };

export default register({
  type: 'ticker',
  label: 'News Ticker',
  group: 'basic',
  icon: '📜',
  schemaVersion: 2,
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
    textScale: 100,
    font: 'theme',
    fontWeight: 'bold',
    uppercase: false,
    letterSpacing: 'normal',
    barHeight: 'full',
    barPosition: 'middle',
    theme: 'minimal-dark',
  }),
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
      { key: 'separator', type: 'text', label: 'Separator', placeholder: '•' },

      { type: 'section', key: 'appearance', label: 'Appearance',
        summary: c => `${c.textScale ?? 100}%` },
      { key: 'font', type: 'select', label: 'Font', options: FONTS,
        help: 'Theme default follows the slide theme / brand-kit font.' },
      textScaleField(),
      { key: 'fontWeight', type: 'select', label: 'Weight', buttons: true, options: [
        { value: 'regular',  label: 'Regular' },
        { value: 'medium',   label: 'Medium' },
        { value: 'semibold', label: 'Semibold' },
        { value: 'bold',     label: 'Bold' },
      ] },
      { type: 'row', children: [
        { key: 'uppercase', type: 'toggle', label: 'Uppercase' },
        { key: 'letterSpacing', type: 'select', label: 'Letter spacing', buttons: true, options: [
          { value: 'normal', label: 'Normal' },
          { value: 'wide',   label: 'Wide' },
          { value: 'wider',  label: 'Wider' },
        ] },
      ] },
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

      { type: 'section', key: 'behavior', label: 'Behavior',
        summary: c => `${c.speed ?? 80} px/s` },
      { key: 'speed', type: 'number', label: 'Speed', min: 20, max: 300, step: 10, slider: true, suffix: ' px/s' },
      // ltr (default) scrolls the text right→left; rtl scrolls left→right —
      // the natural direction for Arabic / Hebrew content and a popular flip.
      { key: 'direction', type: 'select', label: 'Direction', buttons: true, options: [
        { value: 'ltr', label: '← Right to left' },
        { value: 'rtl', label: '→ Left to right' },
      ], help: 'Right to left is the classic news-ticker direction; left to right suits Arabic and Hebrew content.' },
      { key: 'pauseOnHover', type: 'toggle', label: 'Pause on hover / tap',
        help: 'Useful for interactive kiosks — hovering or tapping pauses the ticker so a message can be read in full; it resumes on its own.' },

      ...themeColorSection(),
    ],
  }),
  render(slide, container, ctx) {
    ensureTickerKeyframes();
    const c = slide.content ?? {};
    const items = (Array.isArray(c.items) ? c.items : [])
      .map(i => (typeof i === 'string' ? { text: i } : { text: i?.text, accent: !!i?.accent }))
      .filter(i => i.text);
    const sep = c.separator ?? '•';
    const dir = c.direction === 'rtl' ? 'rtl' : 'ltr';
    // Text-size multiplier consumed by the font clamps below. Floor guards
    // against a stored 0/NaN freezing the font at zero.
    const scale = Math.max(0.2, (Number(c.textScale) || 100) / 100);

    // Text-design knobs (all default to the previous hard-coded values, so a
    // stored ticker renders byte-identically until the user touches them).
    const fam = FONT_STACK[c.font] ?? FONT_STACK.theme;
    const weight = WEIGHTS[c.fontWeight] ?? '700';
    const tracking = TRACKING[c.letterSpacing] ?? '0';
    const transform = c.uppercase ? 'text-transform:uppercase;' : '';
    const barHeight = BAR_PAD[c.barHeight] ? c.barHeight : 'full';
    const fullHeight = barHeight === 'full';
    const solid = !!c.solidBackground;

    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-ticker bb-theme-${c.theme ?? 'minimal-dark'}`;
    // The strip is placed inside the box via the root's align-items. In the
    // legacy 'full' mode the bar fills the box and solidBackground lets the
    // bb-theme-* background paint the whole root (exactly as before); in the
    // strip modes the root stays clear and the bar itself carries the fill.
    root.style.cssText += 'width:100%;height:100%;display:flex;overflow:hidden;'
      + 'align-items:' + (VPOS[c.barPosition] ?? 'center') + ';'
      + ((fullHeight && solid) ? '' : 'background:transparent;')
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
    const baseCss = `font-family:${fam};font-size:calc(clamp(18px,4cqh,56px) * var(--bb-ticker-text-scale,1));`
      + `line-height:1;font-weight:${weight};letter-spacing:${tracking};${transform}`;

    // The bar — a full-width strip holding the lead badge + scrolling track.
    // 'full' fills the box; the others are intrinsic-height strips (padding
    // sets the thickness) that the root's align-items positions.
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;overflow:hidden;width:100%;'
      + (fullHeight ? 'height:100%;' : `padding-block:${BAR_PAD[barHeight]};`)
      + ((!fullHeight && solid) ? 'background:var(--bb-st-bg,#0a0a10);' : '');

    // Optional pinned badge — a sibling flex item OUTSIDE the animated track
    // (the two-copy -50% loop must not include static content), so messages
    // scroll past behind its edge. Theme bg as text colour gives contrast on
    // the accent fill for dark AND light themes.
    const leadLabel = typeof c.leadLabel === 'string' ? c.leadLabel.trim() : '';
    let lead = null;
    if (leadLabel) {
      lead = document.createElement('div');
      lead.style.cssText = 'flex:none;display:flex;align-items:center;height:100%;padding:0 0.9em;white-space:nowrap;'
        + 'background:var(--bb-st-accent,#8b5cf6);color:var(--bb-st-bg,#0a0a10);'
        + baseCss + 'font-weight:800;';
      lead.textContent = leadLabel;
      // rtl tickers read from the right — anchor the badge on that side.
      if (dir === 'rtl') lead.style.order = '2';
    }

    // Clipping wrapper for the animated track, so the track loops within the
    // space remaining next to the badge instead of the whole bar.
    const clip = document.createElement('div');
    clip.style.cssText = 'flex:1 1 auto;min-width:0;overflow:hidden;display:flex;align-items:center;';

    const viewport = document.createElement('div');
    viewport.style.cssText = 'white-space:nowrap;will-change:transform;display:inline-flex;';
    const spanFor = it => (it.accent
      ? `<span style="font-weight:800;color:var(--bb-st-accent,#8b5cf6);">${escapeHtml(it.text)}</span>`
      : escapeHtml(it.text));
    const oneCopy = items.map(spanFor).join(`<span style="opacity:.5;margin:0 1.2em;color:var(--bb-st-accent,#8b5cf6);">${escapeHtml(sep)}</span>`);
    // Build each copy as a real element and set baseCss via .style.cssText —
    // font stacks contain double quotes ("Playfair Display") that would close
    // an inline style="…" attribute early if injected as an HTML string.
    const makeBlock = () => {
      const s = document.createElement('span');
      s.style.cssText = `padding:0 1.2em;${baseCss}`;
      s.innerHTML = oneCopy;
      return s;
    };
    // Two identical copies → translateX(-50%) loops seamlessly.
    viewport.append(makeBlock(), makeBlock());

    // Duration derived synchronously from the text length (no layout read, so
    // it applies even before/without a layout pass). speed = px/s; ~16px per
    // char approximates the rendered width well enough for a ticker — scaled
    // by the same text-size multiplier so px/s stays accurate when resized.
    const oneCopyText = items.map(i => i.text).join('   ' + sep + '   ');
    const approxPx = Math.max(240, oneCopyText.length * 16 * scale);
    const dur = Math.max(6, approxPx / Math.max(10, c.speed ?? 80));
    const kf = dir === 'rtl' ? 'bb-ticker-scroll-rtl' : 'bb-ticker-scroll';
    viewport.style.animation = `${kf} ${dur.toFixed(1)}s linear infinite`;

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

    clip.appendChild(viewport);
    if (lead) bar.appendChild(lead);
    bar.appendChild(clip);
    root.appendChild(bar);
    container.appendChild(root);

    return composeDispose(() => { clearTimeout(resumeTimer); root.remove(); });
  },
});
