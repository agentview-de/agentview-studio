import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';

const LANGS = ['javascript','typescript','python','rust','go','java','csharp','sql','json','xml','bash','yaml','html','css'];

export default register({
  type: 'code',
  label: 'Code Block',
  group: 'basic',
  icon: '⌨️',
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(), language: 'javascript', source: 'function hello() {\n  return "agentView";\n}\n', theme: 'dark-minimal' }),
  schema: () => ({
    fields: [
      { key: 'language', type: 'select', label: 'Language', options: LANGS },
      { key: 'source', type: 'code', label: 'Source code' },
      themeField(),
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-code bb-theme-${c.theme ?? 'dark-minimal'}`;
    const body = (c.source ?? '').trim()
      ? `<pre class="bb-code"><code class="language-${escapeHtml(c.language ?? 'javascript')}">${escapeHtml(c.source ?? '')}</code></pre>`
      : `<pre class="bb-code" style="opacity:.6;">Paste a code snippet in the inspector.</pre>`;
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      ${body}
    `;
    container.appendChild(root);
    // If Prism is available, highlight.
    if (typeof window !== 'undefined' && window.Prism?.highlightAllUnder) {
      try { window.Prism.highlightAllUnder(root); } catch {}
    }
    return composeDispose(() => root.remove());
  },
});

