import { register } from './registry.js';
import { textScaleField } from '../text-scale.js';
import { colorOverrideDefaults, themeColorSection, applyColorOverrides } from '../widget-color.js';
import { composeDispose, childSignal } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';
import { cssUrl } from '../safe-url.js';
import { fetchFeedItems } from '../feeds.js';
import { isStored, dataModeField } from '../offline-data.js';
import { refreshSecField } from '../refresh-field.js';
import { localeField } from '../locale-field.js';
import { mediaFitField, backgroundSizeValue } from '../media-fit.js';

// Map one <item>/<entry> node to a photo card. Shared by the live fetch and
// offline provisioning so both store/show identical data.
const newsMapItem = (it) => {
  const dateStr = it.querySelector('pubDate, published, updated')?.textContent;
  const date = dateStr ? new Date(dateStr) : null;
  const img = it.getElementsByTagName('media:thumbnail')[0]?.getAttribute('url')
           || it.getElementsByTagName('media:content')[0]?.getAttribute('url')
           || it.querySelector('enclosure[type^="image"]')?.getAttribute('url')
           || (it.querySelector('description')?.textContent ?? '').match(/<img[^>]+src="([^"]+)"/)?.[1]
           || '';
  // Publisher hostname for the optional per-card source line. RSS carries the
  // link as element text, Atom as <link href="…">; either may be missing.
  const linkEl = it.querySelector('link');
  const link = linkEl?.getAttribute('href') || linkEl?.textContent?.trim() || '';
  let src = '';
  try { src = link ? new URL(link).hostname.replace(/^www\./, '') : ''; } catch { /* unparsable link → no source line */ }
  return {
    title: it.querySelector('title')?.textContent ?? '',
    desc: (it.querySelector('description, summary')?.textContent ?? '')
      .replace(/<[^>]*>/g, '').slice(0, 200),
    img,
    src,
    date: date && !isNaN(date) ? date.getTime() : 0,
  };
};

// News with Photos, image-card grid version of the RSS widget. Shares the
// fit/paginate layout pattern: render all cards, then either hide overflow
// (fit) or rotate through pages (paginate). Auto-recomputes on resize via
// ResizeObserver. Multi-feed via the same `feed-list` field type as the RSS
// plugin, items from all feeds merge into one date-sorted list.

// Card-layout modifier classes + the meta line + the column override live in
// an injected style block (same once-per-document pattern as the ticker
// keyframes) because they are widget-internal layout, not theming. The base
// card/grid styles stay in styles/slide-themes.css.
//
// The overlay scrim is deliberately a fixed dark gradient with white text:
// the caption sits ON the photo, so readability depends on the image, not on
// the slide theme — a dark scrim + light text is the one combination that
// works over arbitrary photos (and over the neutral empty-image block).
function ensureNewsLayoutStyles() {
  if (document.getElementById('bb-news-layout-styles')) return;
  const style = document.createElement('style');
  style.id = 'bb-news-layout-styles';
  style.textContent = `
    .bb-news-card.bb-news-card-top { grid-template-columns: 1fr; }
    .bb-news-card.bb-news-card-top .bb-news-img { aspect-ratio: 16 / 9; }
    .bb-news-card.bb-news-card-left { grid-template-columns: clamp(80px, 22%, 200px) 1fr; }
    .bb-news-card.bb-news-card-left .bb-news-img { aspect-ratio: 4 / 3; }
    .bb-news-card.bb-news-card-overlay { position: relative; display: block; padding: 0; }
    .bb-news-card.bb-news-card-overlay .bb-news-img { aspect-ratio: 16 / 9; border-radius: 0; }
    .bb-news-card.bb-news-card-overlay .bb-news-text {
      position: absolute; left: 0; right: 0; bottom: 0;
      padding: clamp(10px, 2cqmin, 18px);
      background: linear-gradient(transparent, rgba(0, 0, 0, .78));
      color: #fff;
    }
    .bb-news-card .bb-news-meta {
      font-size: calc(clamp(11px, 1.6cqmin, 20px) * var(--bb-news-text-scale, 1));
      opacity: .65;
      margin-top: clamp(2px, .6cqmin, 6px);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .bb-slide-news.bb-news-cols-set .bb-news-grid {
      grid-template-columns: repeat(var(--bb-news-cols), minmax(0, 1fr));
    }
  `;
  document.head.appendChild(style);
}

// "2 hrs ago" for the optional per-card date line. Locale follows the
// audience-language field (`c.locale || undefined` so '' falls through to the
// device default).
function relTime(ms, locale) {
  const diffSec = Math.round((ms - Date.now()) / 1000); // negative = past
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale || undefined, { numeric: 'auto' });
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86400), 'day');
}

// CSS class suffix per card layout; 'auto' (and legacy/unknown values) keep
// the stylesheet's responsive default: image beside text, stacked when narrow.
const CARD_LAYOUT_CLASS = {
  'image-top': ' bb-news-card-top',
  'image-left': ' bb-news-card-left',
  'text-overlay': ' bb-news-card-overlay',
};

export default register({
  type: 'news-photos',
  label: 'News with Photos',
  group: 'live',
  icon: '🗞️',
  network: true,
  usage: {
    tier: 'private-only',
    note: 'Headlines and images come from third-party news feeds; check the terms of each publisher before commercial display.',
  },
  schemaVersion: 1,
  // Offline provisioning: the Studio fetches + parses the feeds on "Refresh data"
  // and stores the merged card array; the display reads that (no live fetch).
  provisionOffline: async (content) => {
    const { items, okCount, configured } = await fetchFeedItems(content?.url, {
      mapItem: newsMapItem, maxItems: content?.maxItems ?? 8,
    });
    if (!configured) throw new Error('No feed configured');
    if (!okCount) throw new Error('Feed unavailable');
    return items;
  },
  defaults: () => ({ ...colorOverrideDefaults(),
    dataMode: 'live',
    url: ['https://www.tagesschau.de/index~rss2.xml'],
    refreshSec: 300,
    maxItems: 8,
    theme: 'editorial-mono',
    textScale: 100,
    cardLayout: 'auto',
    fit: 'cover',
    columns: 0,
    showDesc: true,
    showDate: false,
    showSource: false,
    locale: '',
    mode: 'fit',
    pageSec: 8,
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'url', type: 'feed-list', label: 'RSS Feeds',
        help: 'Items from all feeds are merged into one list, newest first.' },
      { key: 'maxItems', type: 'number', label: 'Maximum items',
        min: 1, max: 30, slider: true,
        help: 'Total items kept after merging all feeds.' },

      { type: 'section', key: 'data', label: 'Data' },
      dataModeField({ help: 'Offline: the Studio fetches the feeds on “Refresh data” and stores them; the display reads that — no live fetch on screen.' }),
      refreshSecField({ showIf: c => c.dataMode !== 'stored' }),

      { type: 'section', key: 'layout', label: 'Layout' },
      { key: 'cardLayout', type: 'select', label: 'Card layout', buttons: true, tier: 'advanced', options: [
        { value: 'auto',         label: 'Auto' },
        { value: 'image-top',    label: 'Image top' },
        { value: 'image-left',   label: 'Image left' },
        { value: 'text-overlay', label: 'Text overlay' },
      ], help: 'Auto puts the image beside the text and stacks it on narrow widgets.' },
      mediaFitField(),
      { key: 'columns', type: 'number', label: 'Columns', tier: 'advanced',
        min: 0, max: 4, step: 1, slider: true,
        help: '0 = automatic — as many columns as fit the width.' },
      { key: 'showDesc', type: 'toggle', label: 'Show descriptions', tier: 'advanced' },
      { key: 'showDate', type: 'toggle', label: 'Show date', tier: 'advanced',
        help: 'Shows how long ago each item was published.' },
      { key: 'showSource', type: 'toggle', label: 'Show source', tier: 'advanced',
        help: 'Shows the publisher domain on each card.' },
      { ...localeField(), tier: 'advanced', showIf: c => !!c.showDate },
      { ...textScaleField(), tier: 'advanced' },

      { type: 'section', key: 'behavior', label: 'Behavior' },
      { key: 'mode', type: 'select', label: 'When too many items', tier: 'advanced', options: [
        { value: 'fit',      label: 'Auto-fit (show as many as fit)' },
        { value: 'paginate', label: 'Paginate (rotate through pages)' },
      ]},
      { key: 'pageSec', type: 'duration', label: 'Time per page', tier: 'advanced',
        min: 2, max: 30,
        showIf: c => c.mode === 'paginate' },

      ...themeColorSection(),
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const mode = c.mode ?? 'fit';
    const showDesc = c.showDesc !== false;
    const cardClass = 'bb-news-card' + (CARD_LAYOUT_CLASS[c.cardLayout] ?? '');
    const bgSize = backgroundSizeValue(c.fit); // whitelisted → safe inside style=""
    ensureNewsLayoutStyles();
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-news bb-theme-${c.theme ?? 'editorial-mono'}` +
      `${showDesc ? '' : ' bb-news-no-desc'}`;
    root.style.setProperty('--bb-news-text-scale', (c.textScale ?? 100) / 100);
    // Column override: 0/empty keeps the stylesheet's auto-fit behavior; 1–4
    // pins the grid via a CSS var consumed by the injected rule above.
    const cols = Math.max(0, Math.min(4, Math.round(c.columns ?? 0)));
    if (cols >= 1) {
      root.classList.add('bb-news-cols-set');
      root.style.setProperty('--bb-news-cols', cols);
    }
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <div class="bb-news-grid">${ctx?.thumbnail
        ? Array.from({length: 4}).map(() => `<article class="${cardClass}"><div class="bb-news-img bb-news-img-empty"></div><div class="bb-news-text"><h3>Sample headline</h3><p>Live news renders here in the player.</p></div></article>`).join('')
        : '<div class="bb-news-loading">Loading…</div>'}</div>
      ${mode === 'paginate' ? '<div class="bb-news-dots" aria-hidden="true"></div>' : ''}
    `;
    container.appendChild(root);
    if (ctx?.thumbnail) return composeDispose(() => root.remove());

    const ctrl = childSignal(ctx?.signal);
    const grid = root.querySelector('.bb-news-grid');
    const dots = root.querySelector('.bb-news-dots');
    let allItems = [];
    let pageTimer = null;
    let refreshTimer = null;
    let currentPage = 0;

    const renderCards = (items) => {
      grid.innerHTML = items.map(it => {
        // Feed images come from untrusted RSS sources. HTML-escaping is NOT
        // enough inside a CSS url() context, the browser HTML-decodes the
        // attribute before CSS parses it, so an escaped quote turns back into
        // a real quote and a payload like
        // `'); background-image: url(javascript:...); content: url('`
        // breaks out. cssUrl() validates the scheme (http(s)/data:image) and
        // canonically encodes the value, returning '' for anything unsafe.
        const bg = cssUrl(it.img);
        const metaBits = [];
        if (c.showDate && it.date) metaBits.push(escapeHtml(relTime(it.date, c.locale)));
        if (c.showSource && it.src) metaBits.push(escapeHtml(it.src));
        return `
        <article class="${cardClass}">
          ${bg
            ? `<div class="bb-news-img" data-field="url cardLayout fit columns" style="background-image:${bg};background-size:${bgSize};"></div>`
            : '<div class="bb-news-img bb-news-img-empty" data-field="url cardLayout fit columns"></div>'}
          <div class="bb-news-text">
            <h3 data-field="url maxItems textScale">${escapeHtml(it.title)}</h3>
            <p data-field="showDesc textScale">${escapeHtml(it.desc)}</p>
            ${metaBits.length ? `<div class="bb-news-meta" data-field="showDate showSource locale">${metaBits.join(' · ')}</div>` : ''}
          </div>
        </article>
      `;
      }).join('') || '<div class="bb-news-loading">Feed empty</div>';
    };

    const layout = () => {
      if (ctrl.signal.aborted || !allItems.length) return;
      clearInterval(pageTimer); pageTimer = null;

      if (mode === 'paginate') {
        renderCards(allItems);
        const perPage = countFit(grid);
        const totalPages = Math.max(1, Math.ceil(allItems.length / perPage));
        if (currentPage >= totalPages) currentPage = 0;
        const showPage = () => {
          const start = currentPage * perPage;
          renderCards(allItems.slice(start, start + perPage));
          drawDots(dots, totalPages, currentPage);
        };
        showPage();
        if (totalPages > 1) {
          const ms = Math.max(2000, (c.pageSec ?? 8) * 1000);
          pageTimer = setInterval(() => {
            if (ctrl.signal.aborted) return;
            currentPage = (currentPage + 1) % totalPages;
            showPage();
          }, ms);
        }
      } else {
        renderCards(allItems);
        requestAnimationFrame(() => {
          if (ctrl.signal.aborted) return;
          hideOverflow(grid);
        });
      }
    };

    // Live fetch, used for the initial load AND the refresh poll. On a failed
    // BACKGROUND refresh we keep showing the last good items instead of
    // blanking the screen with an error.
    const loadLive = async (initial) => {
      const { items, okCount, configured } = await fetchFeedItems(c.url, {
        signal: ctrl.signal, mapItem: newsMapItem, maxItems: c.maxItems ?? 8,
      });
      if (ctrl.signal.aborted) return;
      if (!configured) { grid.innerHTML = '<div class="bb-news-loading">No feed configured</div>'; return; }
      if (!okCount) {
        if (!initial && allItems.length) return; // stale beats blank
        if (!ctx?.onError?.()) grid.innerHTML = '<div class="bb-news-error">Feed unavailable</div>';
        return;
      }
      allItems = items;
      layout();
    };

    // Offline / provided mode: the Studio pre-fetched + parsed the feeds and the
    // merged cards live in a data slot, injected here as content._offline.data via
    // a slot binding (set at publish). The display renders that — no live fetch.
    const stored = isStored(c);

    if (stored) {
      const offlineItems = c._offline?.data;
      if (offlineItems === undefined) {
        grid.innerHTML = '<div class="bb-news-loading">Provided offline — appears after “Refresh data”.</div>';
      } else {
        allItems = (Array.isArray(offlineItems) ? offlineItems : []).slice(0, c.maxItems ?? 8);
        if (!allItems.length) grid.innerHTML = '<div class="bb-news-loading">Feed empty</div>';
        else layout();
      }
    } else {
      loadLive(true);
      // Refresh poll so long-running displays don't go stale. 0 = fetch once;
      // positive values are clamped UP to the 5-second player minimum.
      const refreshSec = c.refreshSec ?? 300;
      if (refreshSec > 0) {
        refreshTimer = setInterval(() => {
          if (ctrl.signal.aborted) return;
          loadLive(false);
        }, Math.max(5000, refreshSec * 1000));
      }
    }

    const ro = new ResizeObserver(() => layout());
    ro.observe(root);

    return composeDispose(() => {
      ctrl.abort();
      clearInterval(pageTimer);
      clearInterval(refreshTimer);
      ro.disconnect();
      root.remove();
    });
  },
});

// How many of the currently-rendered children fit fully inside the grid box?
// Cards flow row-major (grid-auto-flow: row), so the first card whose bottom
// crosses the fold means everything after it is on the same row or lower —
// stop counting there rather than risk miscounting a backfilled short card.
function countFit(grid) {
  const children = [...grid.children];
  if (!children.length) return 1;
  const bottom = grid.getBoundingClientRect().bottom;
  let count = 0;
  for (const ch of children) {
    if (ch.getBoundingClientRect().bottom <= bottom + 0.5) count++;
    else break;
  }
  return Math.max(1, count);
}

function hideOverflow(grid) {
  const bottom = grid.getBoundingClientRect().bottom;
  for (const ch of grid.children) ch.style.display = '';
  for (const ch of grid.children) {
    if (ch.getBoundingClientRect().bottom > bottom + 0.5) ch.style.display = 'none';
  }
}

function drawDots(host, total, current) {
  if (!host) return;
  if (total <= 1) { host.innerHTML = ''; return; }
  host.innerHTML = Array.from({ length: total }, (_, i) =>
    `<span class="bb-news-dot${i === current ? ' bb-on' : ''}"></span>`
  ).join('');
}
