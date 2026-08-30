import { register } from './registry.js';
import { textScaleField } from '../text-scale.js';
import { themeColorSection, colorOverrideDefaults, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { currencySymbol } from '../data/currencies.js';
import { isSafeImgUrl } from '../safe-url.js';
import { escapeHtml, escapeAttr } from '../utils/escape.js';
import { readableOn } from '../background.js';
import { localeField, safeLocale } from '../locale-field.js';
import { mediaPlaceholder } from '../media-placeholder.js';
import { anyRemote } from '../plugin-network.js';

// Known dietary / allergen tags, keys are lowercase comma tokens the user
// types into the `tags` column. Each maps to a badge label + colour. Unknown
// tags are still rendered as plain badges so customers don't need to wait for
// us to ship a new release before they can add "halal" or "house-special".
const TAG_BADGES = {
  vegan:        { label: 'V',  title: 'Vegan',         bg: '#15803d' },
  vegetarian:   { label: 'VG', title: 'Vegetarian',    bg: '#16a34a' },
  'gluten-free':{ label: 'GF', title: 'Gluten-free',   bg: '#0891b2' },
  glutenfree:   { label: 'GF', title: 'Gluten-free',   bg: '#0891b2' },
  'lactose-free':{label: 'LF', title: 'Lactose-free',  bg: '#0284c7' },
  spicy:        { label: '🌶', title: 'Spicy',          bg: '#dc2626' },
  hot:          { label: '🌶', title: 'Spicy',          bg: '#dc2626' },
  nuts:         { label: 'N',  title: 'Contains nuts', bg: '#a16207' },
  halal:        { label: 'H',  title: 'Halal',         bg: '#7c3aed' },
  kosher:       { label: 'K',  title: 'Kosher',        bg: '#7c3aed' },
  organic:      { label: '🌱', title: 'Organic',        bg: '#65a30d' },
  bio:          { label: '🌱', title: 'Organic',        bg: '#65a30d' },
  new:          { label: 'NEW',title: 'New on the menu',bg:'#f59e0b' },
};

function badgeFor(token) {
  const k = String(token ?? '').toLowerCase().trim();
  if (!k) return null;
  if (TAG_BADGES[k]) return TAG_BADGES[k];
  // Unknown tag → render the literal text on a neutral badge. color-mix tints
  // the neutral grey toward the theme accent so custom tags feel intentional
  // rather than off-palette.
  return { label: k.length <= 4 ? k.toUpperCase() : k, title: token,
    bg: 'color-mix(in srgb, var(--bb-st-accent, #475569) 28%, #475569)' };
}

export default register({
  type: 'menu',
  // Only when a row really points at a remote picture: a text menu board —
  // which is most of them — must not sit behind a consent click.
  network: c => !!c?.showImages && anyRemote((c?.rows ?? []).map(r => r?.image)),
  label: 'Menu / Pricelist',
  group: 'basic',
  icon: '📋',
  schemaVersion: 4,
  // v3 → v4: toggle columns (sold / featured) used to be seeded as legacy
  // truthy STRINGS ('yes' / 'today') in defaults(), while the table editor
  // writes the canonical truthy-empty shape (1 = on, '' = off). The render
  // truthiness test treated both the same, so this is a pure shape clean-up:
  // any stored legacy string is normalised to 1 so the editor and the data
  // agree. Anything already empty / falsy stays off.
  migrate(content, fromVersion) {
    const c = { ...(content ?? {}) };
    if (fromVersion < 4 && Array.isArray(c.rows)) {
      c.rows = c.rows.map(r => {
        const row = { ...r };
        if (row.sold != null && row.sold !== '' && row.sold !== 1) row.sold = String(row.sold).trim() ? 1 : '';
        if (row.featured != null && row.featured !== '' && row.featured !== 1) row.featured = String(row.featured).trim() ? 1 : '';
        return row;
      });
    }
    return c;
  },
  defaults: () => ({ ...colorOverrideDefaults(),
    rows: [
      { section: 'Starters', name: 'Bruschetta',         price: 6.50,  desc: 'Tomato · basil · garlic',          tags: 'vegan' },
      { section: 'Starters', name: 'Olives',             price: 4.00,  desc: 'Mediterranean mix',                tags: 'vegan, gluten-free' },
      { section: 'Mains',    name: 'Pasta al Pomodoro',  price: 12.00, desc: 'San Marzano tomato sauce',         tags: 'vegetarian', featured: 1 },
      { section: 'Mains',    name: 'Risotto Funghi',     price: 14.50, desc: 'Wild mushrooms, parmesan',         tags: 'vegetarian, gluten-free' },
      { section: 'Mains',    name: 'Bistecca alla Fiorentina', price: 28.00, desc: 'Dry-aged T-bone, rosemary',  sold: 1 },
    ],
    currency: 'EUR',
    currencyPosition: 'after',
    hideZeroDecimals: false,
    showPrices: true,
    showImages: false,
    columns: 'auto',
    sectionFilter: '',
    footnote: '',
    textScale: 100,
    locale: '',
    theme: 'bistro-warm',
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'rows', type: 'table', label: 'Menu items',
        help: 'One row per dish. Rows are grouped by the Section column (e.g. Starters, Mains). Tags column understands: vegan, vegetarian, gluten-free, lactose-free, spicy, nuts, halal, kosher, organic/bio, new — any other word still shows as a neutral badge.',
        validate: (v) => {
          const arr = Array.isArray(v) ? v : [];
          if (!arr.length) return { level: 'warn', message: 'The menu is empty — add at least one item.' };
          const ok = arr.some(r => String(r?.name ?? '').trim() || String(r?.price ?? '').trim());
          if (!ok) return { level: 'warn', message: 'No item has a name or a price yet — the menu will render blank.' };
          return null;
        },
        columns: [
          { key: 'section',  label: 'Section', placeholder: 'Starters' },
          { key: 'name',     label: 'Item' },
          { key: 'price',    label: 'Price', type: 'number' },
          { key: 'desc',     label: 'Description' },
          { key: 'image',    label: 'Image', type: 'asset', accept: 'image/*', placeholder: 'https://… (optional)' },
          { key: 'tags',     label: 'Tags',     placeholder: 'vegan, spicy, gluten-free' },
          { key: 'sold',     label: 'Sold',     type: 'toggle' },
          { key: 'featured', label: '★',        type: 'toggle' },
        ] },
      { key: 'sectionFilter', type: 'text', label: 'Only show sections', tier: 'advanced',
        placeholder: 'Starters, Mains',
        help: 'Comma-separated section names. Leave empty to show everything. Lets several screens share one menu — a Starters screen shows only Starters.' },

      { type: 'section', key: 'pricing', label: 'Pricing',
        summary: (c) => {
          if (c?.showPrices === false) return 'hidden';
          return `${currencySymbol(c?.currency ?? 'EUR')} · ${c?.currencyPosition === 'before' ? 'before' : 'after'}`;
        } },
      { key: 'showPrices', type: 'toggle', label: 'Show prices',
        help: 'Turn off for a showcase menu with no prices — hides the price column and the dotted leader line entirely.' },
      { key: 'currency', type: 'currency', label: 'Currency',
        showIf: c => c.showPrices !== false },
      { key: 'currencyPosition', type: 'select', buttons: true, label: 'Symbol position', tier: 'advanced',
        showIf: c => c.showPrices !== false,
        options: [
          { value: 'after', label: '12 €' },
          { value: 'before', label: '€ 12' },
        ],
        help: 'Where the currency symbol sits relative to the amount — “12 €” (EUR style) or “$ 12” (USD/GBP style).' },
      { key: 'hideZeroDecimals', type: 'toggle', label: 'Hide “.00” on whole prices', tier: 'advanced',
        showIf: c => c.showPrices !== false,
        help: 'Shows whole amounts as “12” instead of “12.00”; amounts with cents (12.50) keep both decimals.' },
      { ...localeField(), tier: 'advanced',
        help: 'Decides how a price is written: 4,50 € in German, 4.50 € in English. A signage box often runs an OS locale that has nothing to do with the room it hangs in.' },

      { type: 'section', key: 'appearance', label: 'Appearance' },
      { key: 'columns', type: 'select', buttons: true, label: 'Columns', tier: 'advanced',
        options: [
          { value: 'auto', label: 'Auto' },
          { value: '1', label: '1' },
          { value: '2', label: '2' },
          { value: '3', label: '3' },
        ],
        help: 'Auto fits as many columns as the width allows. Pin a fixed count to serve a narrow sidebar (1) or a full wall (3).' },
      { key: 'showImages', type: 'toggle', label: 'Show dish thumbnails',
        help: 'Thumbnails appear only for items that have an Image URL set; rows without an image stay text-only.' },
      { key: 'footnote', type: 'text', label: 'Footer note', tier: 'advanced',
        placeholder: 'All prices incl. VAT · allergen info at the counter',
        help: 'Small dimmed line under the menu — handy for VAT / allergen disclaimers.' },
      { ...textScaleField(), tier: 'advanced' },

      ...themeColorSection(),
    ],
  }),
  looks: () => [
    { id: 'with-photos', name: 'With photos', patch: {
      showImages: true, showPrices: true, columns: '1' } },
    { id: 'text-only', name: 'Text only', patch: {
      showImages: false, showPrices: true, columns: 'auto' } },
    { id: 'two-columns', name: 'Two columns', patch: {
      columns: '2', showImages: false } },
    { id: 'showcase', name: 'Showcase (no prices)', patch: {
      showPrices: false, showImages: true, columns: '1' } },
    { id: 'price-first', name: 'Price first', patch: {
      showPrices: true, currencyPosition: 'before', showImages: false } },
  ],
  render(slide, container, _ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-menu bb-theme-${c.theme ?? 'bistro-warm'}`;

    // textScale is a percent (80–400); feed the multiplier into a CSS var that
    // the cqmin font clamps in slide-themes.css multiply against. Never an
    // inline em font-size (it would pin the text and stop tracking the box).
    const ts = Math.max(0.8, Math.min(4, (Number(c.textScale) || 100) / 100));
    root.style.setProperty('--bb-menu-text-scale', String(ts));

    const rows = Array.isArray(c.rows) ? c.rows : [];
    const cur = currencySymbol(c.currency ?? 'EUR');
    const showImages = !!c.showImages;
    const showPrices = c.showPrices !== false;
    const before = c.currencyPosition === 'before';
    const hideZeroDec = !!c.hideZeroDecimals;

    // Optional section allow-list: a screen can show just "Starters" from a
    // shared dataset. Empty = everything. Case-insensitive, trimmed.
    const filter = String(c.sectionFilter ?? '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const allow = (sec) => !filter.length || filter.includes(String(sec ?? '').trim().toLowerCase());

    // Price → display string. Numbers honour the hide-zero-decimals toggle;
    // non-numeric strings (e.g. "market price") pass through untouched. NaN
    // passthrough and tabular-nums alignment stay intact.
    // toFixed() always writes a DOT. A menu board in a German café showing
    // "4.50 €" is simply the wrong number format for the room — and the room is
    // what this widget exists for. `safeLocale(locale)` per the locale-field
    // contract: '' falls through to the device default.
    const loc = safeLocale(c.locale);
    const fmtPrice = (price) => {
      let amount;
      if (typeof price === 'number') {
        amount = (hideZeroDec && Number.isInteger(price))
          ? price.toLocaleString(loc, { maximumFractionDigits: 0 })
          : price.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      } else {
        const s = String(price ?? '').trim();
        if (!s) return '';
        amount = s;
      }
      const sym = escapeHtml(cur);
      return before ? `${sym} ${escapeHtml(amount)}` : `${escapeHtml(amount)} ${sym}`;
    };

    // Column layout: 'auto' keeps the responsive CSS grid; a pinned count
    // overrides grid-template-columns inline from here.
    const colSel = String(c.columns ?? 'auto');
    const colStyle = /^[123]$/.test(colSel) ? `grid-template-columns:repeat(${colSel}, 1fr);` : '';

    // Group flat rows back into sections, preserving first-seen order, after
    // applying the optional section filter.
    const order = [];
    const bySection = new Map();
    for (const r of rows) {
      const s = r.section ?? '';
      if (!allow(s)) continue;
      if (!bySection.has(s)) { bySection.set(s, []); order.push(s); }
      bySection.get(s).push(r);
    }

    // Thirty of the thirty-four widgets say something when they have nothing
    // to show; this one drew an empty box. Deleting the last row — or mistyping
    // the section filter — left a blank rectangle on the canvas that is
    // indistinguishable from a broken widget, and a blank panel on the wall.
    if (!order.length) {
      const why = rows.length
        ? 'No menu items match the section filter.'
        : 'Add menu items in the inspector.';
      const empty = mediaPlaceholder({ icon: '🍽️', message: why });
      root.appendChild(empty);
      container.appendChild(root);
      return composeDispose(() => root.remove());
    }

    const renderTags = (raw) => {
      const tags = String(raw ?? '').split(',').map(t => t.trim()).filter(Boolean);
      if (!tags.length) return '';
      return `<span class="bb-menu-tags">${tags.map(t => {
        const b = badgeFor(t);
        if (!b) return '';
        // Ink derived from the badge colour, not a hard-coded white. Five of
        // the eleven palette entries are light enough that white fails WCAG AA
        // on them — "VG" was 3.3:1 and "NEW" on amber 2.1:1. These badges carry
        // allergen and dietary information; unreadable is not a cosmetic bug.
        return `<span class="bb-menu-tag" style="background:${b.bg};color:${readableOn(b.bg) ?? '#fff'};" title="${escapeAttr(b.title)}">${escapeHtml(b.label)}</span>`;
      }).join('')}</span>`;
    };

    const footnote = String(c.footnote ?? '').trim();

    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <div class="bb-menu-cols" style="${colStyle}">
        ${order.map(sec => `
          <section class="bb-menu-section">
            ${sec ? `<h2 data-field="rows sectionFilter">${escapeHtml(sec)}</h2>` : ''}
            <ul>
              ${bySection.get(sec).map(it => {
                const isSold = !!String(it.sold ?? '').trim();
                const isFeatured = !!String(it.featured ?? '').trim();
                const hasImage = showImages && isSafeImgUrl(it.image);
                const itemCls = `bb-menu-item${isSold ? ' bb-menu-sold' : ''}${isFeatured ? ' bb-menu-featured' : ''}`;
                const priceStr = showPrices ? fmtPrice(it.price) : '';
                // <img> instead of CSS background-image: load failures fire an
                // `error` event we can catch (.bb-menu-thumb-broken hides the
                // thumb cleanly so the row stays aligned) and the editor sees
                // a console warning instead of a silent blank square.
                return `
                <li class="${itemCls}">
                  ${hasImage
                    ? `<div class="bb-menu-thumb" data-field="rows showImages"><img src="${escapeAttr(it.image)}" alt="" loading="lazy" decoding="async" data-menu-thumb></div>`
                    : ''}
                  <div class="bb-menu-body">
                    <div class="bb-menu-row">
                      <span class="bb-menu-name" data-field="rows tags sold featured">${isFeatured ? '<span class="bb-menu-star" aria-hidden="true">★</span> ' : ''}${escapeHtml(it.name ?? '')}${renderTags(it.tags)}${isSold ? '<span class="bb-menu-soldlbl">Sold out</span>' : ''}</span>
                      ${showPrices ? '<span class="bb-menu-dots"></span>' : ''}
                      ${showPrices ? `<span class="bb-menu-price" data-field="rows showPrices currency currencyPosition hideZeroDecimals">${priceStr}</span>` : ''}
                    </div>
                    ${it.desc ? `<div class="bb-menu-desc" data-field="rows">${escapeHtml(it.desc)}</div>` : ''}
                  </div>
                </li>
              `;
              }).join('')}
            </ul>
          </section>
        `).join('')}
      </div>
      ${footnote ? `<div class="bb-menu-footnote" data-field="footnote textScale" style="margin-top:1.4em;font-size:calc(clamp(11px, 1.6cqmin, 22px) * var(--bb-menu-text-scale, 1));opacity:.6;text-align:center;">${escapeHtml(footnote)}</div>` : ''}
    `;
    container.appendChild(root);
    // Wire up onerror for menu thumbs so a broken dish-image URL collapses
    // the thumb container instead of leaving a forever-empty grey square.
    root.querySelectorAll('img[data-menu-thumb]').forEach(img => {
      img.addEventListener('error', () => {
        const wrap = img.parentElement;
        if (wrap) wrap.classList.add('bb-menu-thumb-broken');
        console.warn(`[menu] dish image failed to load: ${img.src}`);
      }, { once: true });
    });
    return composeDispose(() => root.remove());
  },
});
