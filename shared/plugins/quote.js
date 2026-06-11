import { register } from './registry.js';
import { colorOverrideDefaults, themeColorSection, applyColorOverrides } from '../widget-color.js';
import { textScaleField } from '../text-scale.js';
import { composeDispose } from '../plugin-contract.js';
import { sanitizeHtml, plainToHtml, looksLikeHtml } from '../sanitize-html.js';
import { escapeHtml, escapeAttr } from '../utils/escape.js';
import { isSafeImgUrl, cssUrl } from '../safe-url.js';

// Decorative opening-mark glyph per markStyle. 'none' renders no mark at all.
const MARK_GLYPHS = { classic: '“', guillemet: '»', none: '' };
const LAYOUTS = ['card', 'minimal', 'fullscreen'];
const LAYOUT_NAMES = { card: 'Card', minimal: 'Minimal', fullscreen: 'Fullscreen' };
const FADE_MS = 600;

// Rotation entries with an empty quote are editor noise (a freshly-added list
// row) — skip them so the display never cross-fades to a blank card.
function rotationEntries(c) {
  return (Array.isArray(c.quotes) ? c.quotes : [])
    .map(q => ({
      quote: typeof q?.quote === 'string' ? q.quote : '',
      author: typeof q?.author === 'string' ? q.author : '',
      source: typeof q?.source === 'string' ? q.source : '',
    }))
    .filter(q => q.quote.trim());
}

export default register({
  type: 'quote',
  label: 'Quote',
  group: 'basic',
  icon: '❝',
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(),
    quote: 'Stay hungry. Stay foolish.', author: 'Steve Jobs', source: '', portrait: '',
    layout: 'card', markStyle: 'classic', textScale: 100,
    quotes: [], rotateSecs: 12,
    theme: 'minimal-dark' }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'quote',  type: 'rich-text', label: 'Quote',
        help: 'Use the toolbar to bold, colour or align — colours set here override the theme.' },
      { type: 'row', children: [
        { key: 'author', type: 'text', label: 'Author', placeholder: 'Steve Jobs' },
        { key: 'source', type: 'text', label: 'Source / attribution',
          placeholder: '2005 Stanford commencement',
          help: 'Optional secondary line under the author, speech / book / interview reference.' },
      ] },
      { key: 'portrait', type: 'asset', label: 'Portrait (optional)', accept: 'image/*',
        help: 'Shown as a circle next to the quote, a square headshot looks best. The fullscreen layout blurs it into the background instead.' },

      { type: 'section', key: 'appearance', label: 'Appearance',
        summary: c => `${LAYOUT_NAMES[c.layout] ?? 'Card'} · ${c.textScale ?? 100}%` },
      { key: 'layout', type: 'select', label: 'Layout', buttons: true, options: [
          { value: 'card', label: 'Card' },
          { value: 'minimal', label: 'Minimal' },
          { value: 'fullscreen', label: 'Fullscreen' },
        ],
        help: 'Card shows the portrait next to the text, Minimal is centred type only, Fullscreen makes the quote giant with the portrait as a blurred backdrop.' },
      { key: 'markStyle', type: 'select', label: 'Quotation mark', buttons: true, options: [
          { value: 'classic', label: '“ Classic' },
          { value: 'guillemet', label: '» Guillemet' },
          { value: 'none', label: 'Hidden' },
        ] },
      textScaleField(),

      { type: 'section', key: 'behavior', label: 'Behavior', collapsed: true,
        help: 'Rotate through extra quotes — a classic “quote of the day” loop.',
        summary: c => {
          const n = rotationEntries(c).length;
          return n ? `${n + 1} quotes · ${Math.max(3, Number(c.rotateSecs) || 12)}s` : 'off';
        } },
      { key: 'quotes', type: 'list', label: 'More quotes',
        itemShape: [
          { key: 'quote',  type: 'textarea', label: 'Quote' },
          { key: 'author', type: 'text', label: 'Author' },
          { key: 'source', type: 'text', label: 'Source' },
        ],
        help: 'The main quote above always comes first in the rotation. Drag to reorder.' },
      { key: 'rotateSecs', type: 'duration', label: 'Show each quote for', min: 3,
        showIf: c => rotationEntries(c).length > 0,
        help: 'How long each quote stays before cross-fading to the next.' },

      ...themeColorSection(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const layout = LAYOUTS.includes(c.layout) ? c.layout : 'card';
    const markGlyph = Object.hasOwn(MARK_GLYPHS, c.markStyle ?? '')
      ? MARK_GLYPHS[c.markStyle] : MARK_GLYPHS.classic;
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-quote bb-theme-${c.theme ?? 'minimal-dark'} bb-quote-layout-${layout}`;
    // Consumed by the calc(clamp(…) * var()) font rules on .bb-quote-text in
    // styles/slide-themes.css (and by the inline fullscreen sizes below).
    root.style.setProperty('--bb-quote-text-scale', String((Number(c.textScale) || 100) / 100));

    // Portrait is an asset URL, escaping the attribute isn't enough, a
    // `javascript:`/other-scheme value would still be a live src. Gate on
    // isSafeImgUrl (http(s)/data:image/relative) like menu.js; drop the img
    // entirely when the scheme isn't allowed. The fullscreen background path
    // goes through cssUrl(), which applies the same gate before any CSS use.
    const portraitOk = isSafeImgUrl(c.portrait);

    // Fullscreen: the portrait becomes a dimmed, blurred backdrop instead of a
    // circle. z-index -1 keeps it behind the in-flow content; negative inset
    // hides the blur's soft edges under the slide's overflow:hidden.
    if (layout === 'fullscreen' && portraitOk) {
      const bg = document.createElement('div');
      bg.setAttribute('aria-hidden', 'true');
      bg.style.cssText = 'position:absolute;inset:-5%;z-index:-1;'
        + 'filter:blur(14px) brightness(.45) saturate(.85);';
      bg.style.background = `${cssUrl(c.portrait)} center / cover no-repeat`;
      root.appendChild(bg);
    }

    // Slide title as bb-h1 — matches the other text-group widgets (text,
    // markdown, code, greeting); quote used to silently drop it.
    if (slide.title) {
      const h1 = document.createElement('h1');
      h1.className = 'bb-h1';
      h1.textContent = slide.title;
      root.appendChild(h1);
    }

    const card = document.createElement('div');
    card.className = 'bb-quote-card';
    // Layout-variant geometry (card-level, survives the innerHTML swaps the
    // rotation does). 'card' is the stylesheet default: portrait left, text
    // right. 'minimal' and 'fullscreen' stack and centre.
    if (layout !== 'card') {
      card.style.flexDirection = 'column';
      card.style.textAlign = 'center';
      card.style.gap = '24px';
    }
    if (layout === 'minimal') card.style.maxWidth = 'min(85%, 900px)';
    if (layout === 'fullscreen') card.style.maxWidth = 'min(92%, 1400px)';
    root.appendChild(card);

    // The rotation playlist: the main quote fields are always entry 0 so
    // existing single-quote content keeps working untouched. If only the
    // playlist is filled (main quote left blank), rotate the playlist alone
    // instead of fading to the "type a quote" hint every cycle.
    const entries = [{
      quote: typeof c.quote === 'string' ? c.quote : '',
      author: typeof c.author === 'string' ? c.author : '',
      source: typeof c.source === 'string' ? c.source : '',
      withPortrait: portraitOk,
    }, ...rotationEntries(c)];
    const list = (entries.length > 1 && !entries[0].quote.trim()) ? entries.slice(1) : entries;

    // Same sanitize pipeline for main quote and playlist entries: rich-text
    // HTML passes sanitizeHtml, legacy / playlist plain text gets plainToHtml.
    const quoteHtmlFor = (src) => src.trim()
      ? sanitizeHtml(looksLikeHtml(src) ? src : plainToHtml(src))
      : '<span style="opacity:.55;">Type a quote in the inspector.</span>';

    const renderEntry = (entry) => {
      const showPortrait = !!entry.withPortrait && layout !== 'fullscreen';
      card.innerHTML = `
        ${showPortrait ? `<img class="bb-quote-portrait" src="${escapeAttr(c.portrait)}" alt="">` : ''}
        <div class="bb-quote-text">
          ${markGlyph ? `<span class="bb-quote-mark">${markGlyph}</span>` : ''}
          <blockquote>${quoteHtmlFor(entry.quote)}</blockquote>
          ${entry.author ? `<cite>— ${escapeHtml(entry.author)}${entry.source ? `<span class="bb-quote-source"> · ${escapeHtml(entry.source)}</span>` : ''}</cite>` : ''}
        </div>
      `;
      // Child-level variant tweaks — re-applied after every innerHTML swap.
      if (layout === 'minimal') {
        const img = card.querySelector('.bb-quote-portrait');
        if (img) { img.style.width = '120px'; img.style.height = '120px'; }
      }
      if (layout === 'fullscreen') {
        const bq = card.querySelector('blockquote');
        if (bq) bq.style.font = '700 calc(clamp(32px, 9cqmin, 150px) * var(--bb-quote-text-scale, 1))/1.15 var(--bb-serif)';
        const cite = card.querySelector('cite');
        if (cite) cite.style.fontSize = 'calc(clamp(16px, 3cqmin, 40px) * var(--bb-quote-text-scale, 1))';
      }
    };

    let pos = 0;
    let cycleTimer = 0;
    let swapTimer = 0;
    renderEntry(list[0]);
    if (list.length > 1) {
      // Cross-fade rotation: fade the card out, swap content, fade back in.
      // 5s+ cadence (3s floor) — no need for visibility-gated ticking.
      const periodMs = Math.max(3, Number(c.rotateSecs) || 12) * 1000;
      card.style.transition = `opacity ${FADE_MS}ms ease`;
      cycleTimer = setInterval(() => {
        card.style.opacity = '0';
        swapTimer = setTimeout(() => {
          pos = (pos + 1) % list.length;
          renderEntry(list[pos]);
          card.style.opacity = '1';
        }, FADE_MS);
      }, periodMs);
    }

    container.appendChild(root);
    return composeDispose(() => {
      clearInterval(cycleTimer);
      clearTimeout(swapTimer);
      root.remove();
    });
  },
});
