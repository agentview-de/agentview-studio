import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
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

export default register({
  type: 'text',
  label: 'Announcement',
  group: 'basic',
  icon: '📢',
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(),
    body: 'Type your announcement here. Use the toolbar above the text to bold, colour, or align.',
    font: 'sans',
    theme: 'minimal-dark',
  }),
  schema: () => ({
    fields: [
      { key: 'body', type: 'rich-text', label: 'Announcement Message',
        help: 'Use the toolbar to bold, colour, align, and add lists, links or tables. Colours you set here override the theme.' },
      { key: 'font', type: 'select',    label: 'Default font', options: FONTS },
      themeField('Color theme (text/accent)'),
      ...colorOverrideFields(),
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
    // Note: don't set text-align / align-items here, the WYSIWYG already
    // wraps right/left-aligned text in <div style="text-align: ...">. A flex
    // align-items: center on the root would shrink-wrap the body so inline
    // text-align inside has nothing to align against. Defaults come from
    // .bb-slide-text in slide-themes.css.
    if (slide.title) {
      const h1 = document.createElement('h1');
      h1.className = 'bb-h1';
      h1.style.fontFamily = fam;
      h1.textContent = slide.title;
      root.appendChild(h1);
    }
    const body = document.createElement('div');
    body.className = 'bb-body';
    body.style.fontFamily = fam;
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
