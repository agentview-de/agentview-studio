import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { currencySymbol } from '../data/currencies.js';
import { isSafeImgUrl } from '../safe-url.js';
import { escapeHtml, escapeAttr } from '../utils/escape.js';

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
  // Unknown tag → render the literal text on a neutral badge.
  return { label: k.length <= 4 ? k.toUpperCase() : k, title: token, bg: '#475569' };
}

export default register({
  type: 'menu',
  label: 'Menu / Pricelist',
  group: 'basic',
  icon: '📋',
  schemaVersion: 3,
  defaults: () => ({ ...colorOverrideDefaults(),
    rows: [
      { section: 'Starters', name: 'Bruschetta',         price: 6.50,  desc: 'Tomato · basil · garlic',          tags: 'vegan' },
      { section: 'Starters', name: 'Olives',             price: 4.00,  desc: 'Mediterranean mix',                tags: 'vegan, gluten-free' },
      { section: 'Mains',    name: 'Pasta al Pomodoro',  price: 12.00, desc: 'San Marzano tomato sauce',         tags: 'vegetarian', featured: 'today' },
      { section: 'Mains',    name: 'Risotto Funghi',     price: 14.50, desc: 'Wild mushrooms, parmesan',         tags: 'vegetarian, gluten-free' },
      { section: 'Mains',    name: 'Bistecca alla Fiorentina', price: 28.00, desc: 'Dry-aged T-bone, rosemary',  sold: 'yes' },
    ],
    currency: 'EUR',
    showImages: false,
    theme: 'bistro-warm',
  }),
  schema: () => ({
    fields: [
      { key: 'currency', type: 'currency', label: 'Currency' },
      { key: 'showImages', type: 'toggle', label: 'Show dish thumbnails (if image URL set)' },
      { key: 'rows', type: 'table', label: 'Menu items',
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
      themeField(),
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-menu bb-theme-${c.theme ?? 'bistro-warm'}`;
    const rows = Array.isArray(c.rows) ? c.rows : [];
    const cur = currencySymbol(c.currency ?? 'EUR');
    const showImages = !!c.showImages;

    // Group flat rows back into sections, preserving first-seen order.
    const order = [];
    const bySection = new Map();
    for (const r of rows) {
      const s = r.section ?? '';
      if (!bySection.has(s)) { bySection.set(s, []); order.push(s); }
      bySection.get(s).push(r);
    }

    const renderTags = (raw) => {
      const tags = String(raw ?? '').split(',').map(t => t.trim()).filter(Boolean);
      if (!tags.length) return '';
      return `<span class="bb-menu-tags">${tags.map(t => {
        const b = badgeFor(t);
        if (!b) return '';
        return `<span class="bb-menu-tag" style="background:${b.bg};color:#fff;" title="${escapeAttr(b.title)}">${escapeHtml(b.label)}</span>`;
      }).join('')}</span>`;
    };

    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <div class="bb-menu-cols">
        ${order.map(sec => `
          <section class="bb-menu-section">
            ${sec ? `<h2>${escapeHtml(sec)}</h2>` : ''}
            <ul>
              ${bySection.get(sec).map(it => {
                const isSold = !!String(it.sold ?? '').trim();
                const isFeatured = !!String(it.featured ?? '').trim();
                const hasImage = showImages && isSafeImgUrl(it.image);
                const itemCls = `bb-menu-item${isSold ? ' bb-menu-sold' : ''}${isFeatured ? ' bb-menu-featured' : ''}`;
                // <img> instead of CSS background-image: load failures fire an
                // `error` event we can catch (.bb-menu-thumb-broken hides the
                // thumb cleanly so the row stays aligned) and the editor sees
                // a console warning instead of a silent blank square.
                return `
                <li class="${itemCls}">
                  ${hasImage
                    ? `<div class="bb-menu-thumb"><img src="${escapeAttr(it.image)}" alt="" loading="lazy" decoding="async" data-menu-thumb></div>`
                    : ''}
                  <div class="bb-menu-body">
                    <div class="bb-menu-row">
                      <span class="bb-menu-name">${isFeatured ? '<span class="bb-menu-star" aria-hidden="true">★</span> ' : ''}${escapeHtml(it.name ?? '')}${renderTags(it.tags)}${isSold ? '<span class="bb-menu-soldlbl">Sold out</span>' : ''}</span>
                      <span class="bb-menu-dots"></span>
                      <span class="bb-menu-price">${typeof it.price === 'number' ? it.price.toFixed(2) : (it.price ?? '')} ${escapeHtml(cur)}</span>
                    </div>
                    ${it.desc ? `<div class="bb-menu-desc">${escapeHtml(it.desc)}</div>` : ''}
                  </div>
                </li>
              `;
              }).join('')}
            </ul>
          </section>
        `).join('')}
      </div>
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

