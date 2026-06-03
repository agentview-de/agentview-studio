import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { sanitizeHtml, plainToHtml, looksLikeHtml } from '../sanitize-html.js';
import { escapeHtml, escapeAttr } from '../utils/escape.js';
import { isSafeImgUrl } from '../safe-url.js';

export default register({
  type: 'quote',
  label: 'Quote',
  group: 'basic',
  icon: '❝',
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(), quote: 'Stay hungry. Stay foolish.', author: 'Steve Jobs', source: '', portrait: '', theme: 'minimal-dark' }),
  schema: () => ({
    fields: [
      { key: 'quote',  type: 'rich-text', label: 'Quote' },
      { key: 'author', type: 'text', label: 'Author' },
      { key: 'source', type: 'text', label: 'Source / attribution',
        placeholder: '2005 Stanford commencement',
        help: 'Optional secondary line under the author, speech / book / interview reference.' },
      { key: 'portrait', type: 'asset', label: 'Portrait (optional)', accept: 'image/*',
        help: 'Shown as a circle next to the quote, a square headshot looks best.' },
      themeField(),
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-quote bb-theme-${c.theme ?? 'minimal-dark'}`;
    const quoteSrc = c.quote ?? '';
    const quoteHtml = quoteSrc.trim()
      ? sanitizeHtml(looksLikeHtml(quoteSrc) ? quoteSrc : plainToHtml(quoteSrc))
      : '<span style="opacity:.55;">Type a quote in the inspector.</span>';
    // Portrait is an asset URL, escaping the attribute isn't enough, a
    // `javascript:`/other-scheme value would still be a live src. Gate on
    // isSafeImgUrl (http(s)/data:image/relative) like menu.js; drop the img
    // entirely when the scheme isn't allowed.
    const portraitOk = isSafeImgUrl(c.portrait);
    root.innerHTML = `
      <div class="bb-quote-card">
        ${portraitOk ? `<img class="bb-quote-portrait" src="${escapeAttr(c.portrait)}" alt="">` : ''}
        <div class="bb-quote-text">
          <span class="bb-quote-mark">“</span>
          <blockquote>${quoteHtml}</blockquote>
          ${c.author ? `<cite>— ${escapeHtml(c.author)}${c.source ? `<span class="bb-quote-source"> · ${escapeHtml(c.source)}</span>` : ''}</cite>` : ''}
        </div>
      </div>
    `;
    container.appendChild(root);
    return composeDispose(() => root.remove());
  },
});

