import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { textScaleField } from '../text-scale.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { sanitizeHtml } from '../sanitize-html.js';
import { escapeHtml } from '../utils/escape.js';

// marked.js is loaded as a CDN script in both host shells; we read it from
// window. marked 5+ dropped its built-in sanitizer, so we MUST pipe the
// rendered HTML through our whitelist sanitiser, otherwise an authored
// markdown body containing raw <script>, <iframe>, or <img onerror=…> would
// execute on the player.
function md(src) {
  if (typeof window !== 'undefined' && window.marked?.parse) {
    const raw = window.marked.parse(src ?? '', { breaks: true, gfm: true });
    return sanitizeHtml(raw);
  }
  return `<pre>${escapeHtml(src ?? '')}</pre>`;
}

export default register({
  type: 'markdown',
  label: 'Markdown',
  group: 'basic',
  icon: '✍️',
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(),
    body: '# Sprint highlights\n\n- **Atlas** went live in production\n- Network maintenance Friday 18:00–19:00\n- Cake in the kitchen at 15:00\n\n> Report display issues in #it-support.',
    theme: 'dark-minimal',
    textScale: 100,
    align: 'left',
  }),
  schema: () => ({
    fields: [
      { key: 'body', type: 'markdown', label: 'Markdown Content' },
      textScaleField(),
      { key: 'align', type: 'select', label: 'Alignment', options: [
        { value: 'left',   label: 'Left' },
        { value: 'center', label: 'Center' },
        { value: 'right',  label: 'Right' },
      ] },
      themeField('Color theme (text)'),
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-markdown bb-theme-${c.theme ?? 'dark-minimal'}`;
    // textScale is a percent (80–400). Legacy decks stored a 0.6–2.0 multiplier;
    // values ≤ 5 are still that old form, so scale them to percent before use.
    let ts = Number(c.textScale) || 100;
    if (ts <= 5) ts *= 100;
    const scale = Math.max(0.8, Math.min(4, ts / 100));
    const align = ['left', 'center', 'right'].includes(c.align) ? c.align : 'left';
    const inner = (c.body ?? '').trim()
      ? md(c.body)
      : '<p style="opacity:.6;">Write Markdown in the inspector, headings, lists, <strong>bold</strong>, links and quotes are supported.</p>';
    // The base font-size lives in CSS as a cqmin clamp so the text tracks the
    // WIDGET box (a full-slide widget gets big type, a tablet card stays small).
    // We only feed the user's multiplier in here, via a CSS variable — setting
    // an `em` font-size inline would resolve against the inherited 16px and pin
    // the text to a fixed size that never grows with the widget.
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <article class="bb-md" style="--bb-md-text-scale:${scale};text-align:${align};">${inner}</article>
    `;
    container.appendChild(root);
    return composeDispose(() => root.remove());
  },
});

