import { register } from './registry.js';
import { themeColorSection, colorOverrideDefaults, applyColorOverrides } from '../widget-color.js';
import { textScaleField } from '../text-scale.js';
import { STATUS_COLORS } from '../status-colors.js';
import { composeDispose } from '../plugin-contract.js';
import { sanitizeHtml, plainToHtml, looksLikeHtml } from '../sanitize-html.js';

// Announcement / free-text widget. Body is rich-text (B/I/U + color + align
// inline via the WYSIWYG editor). Widget-level Font + default Color act as
// fall-backs the WYSIWYG can override per selection.

const FONTS = [
  { value: 'sans',    label: 'Sans (Inter)' },
  { value: 'serif',   label: 'Serif (Playfair)' },
  { value: 'mono',    label: 'Mono (JetBrains)' },
  { value: 'display', label: 'Display (Inter Tight)' },
];
const FONT_STACK = {
  sans:    'Inter, system-ui, sans-serif',
  serif:   '"Playfair Display", Georgia, serif',
  mono:    '"JetBrains Mono", ui-monospace, monospace',
  display: '"Inter Tight", Inter, sans-serif',
};

// Priority styling — edge stripe + icon + accent tint. 'info' rides the theme
// accent so it matches whatever theme / brand kit is active; warning / urgent
// use the shared traffic-light hexes so "red means urgent" is the SAME red as
// in kpi-cards / progress. tint:'' = leave --bb-st-accent alone.
const PRIORITY_STYLES = {
  info:    { icon: 'ℹ️', color: 'var(--bb-st-accent, #8b5cf6)', tint: '' },
  warning: { icon: '⚠️', color: STATUS_COLORS.warn, tint: STATUS_COLORS.warn },
  urgent:  { icon: '⛔', color: STATUS_COLORS.bad,  tint: STATUS_COLORS.bad },
};
const PRIORITY_LABELS = { normal: 'Normal', info: 'Info', warning: 'Warning', urgent: 'Urgent' };

// Reading-column presets — ch tracks the body font, so the cap scales with the
// type size instead of pinning a pixel width.
const MAX_WIDTHS = { comfortable: '60ch', narrow: '40ch' };
const VALIGNS = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

// Slow attention pulse for urgent announcements, injected once per document
// (admin preview, fullscreen preview iframe, live player) — same id-guard
// pattern as stream-cam's LIVE-badge keyframes.
function ensurePulseKeyframes() {
  if (document.getElementById('bb-text-priority-kf')) return;
  const style = document.createElement('style');
  style.id = 'bb-text-priority-kf';
  style.textContent = '@keyframes bb-text-priority-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }';
  document.head.appendChild(style);
}

export default register({
  type: 'text',
  label: 'Announcement',
  group: 'basic',
  icon: '📢',
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(),
    body: 'Type your announcement here. Use the toolbar above the text to bold, colour, or align.',
    font: 'sans',
    textScale: 100,
    valign: 'middle',
    maxWidth: 'full',
    priority: 'normal',
    pulse: false,
    theme: 'minimal-dark',
  }),
  // NOTE: legacy slides may also carry a `color` content key (an old whole-widget
  // text colour). It is deliberately NOT in the schema — render() still honours
  // it (root.style.color) so existing decks keep their colour; new decks use the
  // Theme & colours overrides instead.
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'body', type: 'rich-text', label: 'Announcement Message',
        help: 'Use the toolbar to bold, colour, align, and add lists, links or tables. Colours you set here override the theme.' },

      { type: 'section', key: 'appearance', label: 'Appearance' },
      { key: 'font', type: 'select', label: 'Default font', options: FONTS,
        help: 'Default for the whole widget — the editor toolbar can override font styling per selection.' },
      textScaleField(),
      { key: 'valign', type: 'align', vertical: true, label: 'Vertical alignment' },
      { key: 'maxWidth', type: 'select', label: 'Content width', buttons: true, options: [
        { value: 'full',        label: 'Full' },
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'narrow',      label: 'Narrow' },
      ], help: 'Caps the line length so long announcements stay readable on wide screens.' },

      { type: 'section', key: 'behavior', label: 'Behavior',
        summary: c => {
          const label = PRIORITY_LABELS[c.priority] ?? 'Normal';
          return c.priority === 'urgent' && c.pulse ? `${label} · pulse` : label;
        } },
      { key: 'priority', type: 'select', label: 'Priority style', buttons: true, options: [
        { value: 'normal',  label: 'Normal' },
        { value: 'info',    label: 'Info' },
        { value: 'warning', label: 'Warning' },
        { value: 'urgent',  label: 'Urgent' },
      ], help: 'Info, Warning and Urgent paint an accent stripe and icon so important announcements stand out.' },
      { key: 'pulse', type: 'toggle', label: 'Attention pulse',
        showIf: c => c.priority === 'urgent',
        help: 'Slowly pulses the stripe and icon to draw eyes on status walls. Skipped when the display prefers reduced motion.' },

      ...themeColorSection('Color theme (text/accent)'),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const fam = FONT_STACK[c.font] ?? FONT_STACK.sans;
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-text bb-theme-${c.theme ?? 'minimal-dark'}`;
    // Legacy widgets stored a `color` default, honour it so existing slides
    // don't change colour. New widgets fall back to the theme's --bb-st-fg.
    if (c.color) root.style.color = c.color;
    // Text-size multiplier — the .bb-slide-text .bb-h1 / .bb-body font clamps
    // in slide-themes.css multiply by this var (1 = 100%).
    root.style.setProperty('--bb-text-text-scale', String((Number(c.textScale) || 100) / 100));
    // Vertical alignment. .bb-slide is already a flex COLUMN with
    // justify-content:center, so we steer the block axis via justify-content
    // ONLY — never align-items (see note below): 'middle' matches the old
    // behaviour exactly, so existing slides don't move.
    const valign = VALIGNS[c.valign];
    if (valign) root.style.justifyContent = valign;
    // Note: don't set text-align / align-items here, the WYSIWYG already
    // wraps right/left-aligned text in <div style="text-align: ...">. A flex
    // align-items: center on the root would shrink-wrap the body so inline
    // text-align inside has nothing to align against. Defaults come from
    // .bb-slide-text in slide-themes.css.

    // Priority dressing: edge stripe + icon, accent tinted to match — unless
    // the user pinned their own accent override (already inlined above, and an
    // inline --bb-st-accent from applyColorOverrides must keep winning).
    const pr = PRIORITY_STYLES[c.priority];
    if (pr) {
      const userAccent = typeof c.accentColor === 'string' && c.accentColor.trim();
      if (pr.tint && !userAccent) root.style.setProperty('--bb-st-accent', pr.tint);
      const pulsing = c.priority === 'urgent' && !!c.pulse
        && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      if (pulsing) ensurePulseKeyframes();
      const anim = pulsing ? 'animation:bb-text-priority-pulse 2.4s ease-in-out infinite;' : '';
      const stripe = document.createElement('div');
      stripe.setAttribute('aria-hidden', 'true');
      stripe.style.cssText = `position:absolute;left:0;top:0;bottom:0;width:clamp(6px,1.2cqmin,16px);background:${pr.color};${anim}`;
      root.appendChild(stripe);
      const badge = document.createElement('div');
      badge.className = 'bb-text-priority';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = pr.icon;
      badge.style.cssText = `font-size:calc(clamp(22px,5cqmin,64px) * var(--bb-text-text-scale, 1));line-height:1;color:${pr.color};text-align:center;margin:0 0 .3em;${anim}`;
      root.appendChild(badge);
    }

    // Content-width cap: max-width + auto side margins centre the reading
    // column; the WYSIWYG's inline text-align still works inside it.
    const maxW = MAX_WIDTHS[c.maxWidth] ?? '';
    const cap = (el) => {
      if (!maxW) return;
      el.style.maxWidth = maxW;
      el.style.marginLeft = 'auto';
      el.style.marginRight = 'auto';
      el.style.width = '100%';
    };
    if (slide.title) {
      const h1 = document.createElement('h1');
      h1.className = 'bb-h1';
      h1.style.fontFamily = fam;
      h1.textContent = slide.title;
      cap(h1);
      root.appendChild(h1);
    }
    const body = document.createElement('div');
    body.className = 'bb-body';
    body.style.fontFamily = fam;
    cap(body);
    // Legacy widgets stored body as plain text with \n; new widgets store HTML.
    // Detect and normalise, then sanitise either way.
    const src = c.body ?? '';
    body.innerHTML = src.trim()
      ? sanitizeHtml(looksLikeHtml(src) ? src : plainToHtml(src))
      : '<span style="opacity:.55;">Type your announcement in the inspector.</span>';
    root.appendChild(body);
    container.appendChild(root);
    return composeDispose(() => root.remove());
  },
});
