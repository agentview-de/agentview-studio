import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { textScaleField } from '../text-scale.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose, childSignal } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';
import { cssUrl } from '../safe-url.js';

// News with Photos, image-card grid version of the RSS widget. Shares the
// fit/paginate layout pattern: render all cards, then either hide overflow
// (fit) or rotate through pages (paginate). Auto-recomputes on resize via
// ResizeObserver. Multi-feed via the same `feed-list` field type as the RSS
// plugin, items from all feeds merge into one date-sorted list.

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
  defaults: () => ({ ...colorOverrideDefaults(),
    url: ['https://www.tagesschau.de/index~rss2.xml'],
    theme: 'editorial-mono',
    textScale: 100,
    showDesc: true,
    mode: 'fit',
    pageSec: 8,
    maxItems: 8,
  }),
  schema: () => ({
    fields: [
      { key: 'url', type: 'feed-list', label: 'RSS Feeds' },
      themeField(),
      ...colorOverrideFields(),
      textScaleField(),
      { key: 'showDesc', type: 'toggle', label: 'Show descriptions' },
      { key: 'mode', type: 'select', label: 'When too many items', options: [
        { value: 'fit',      label: 'Auto-fit (show as many as fit)' },
        { value: 'paginate', label: 'Paginate (rotate through pages)' },
      ]},
      { key: 'pageSec', type: 'duration', label: 'Time per page',
        min: 2, max: 30, default: 8,
        showIf: c => c.mode === 'paginate' },
      { key: 'maxItems', type: 'number', label: 'Maximum items',
        min: 1, max: 30, slider: true,
        help: 'How many items to fetch from the feed.' },
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const mode = c.mode ?? 'fit';
    const showDesc = c.showDesc !== false;
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-news bb-theme-${c.theme ?? 'editorial-mono'}` +
      `${showDesc ? '' : ' bb-news-no-desc'}`;
    root.style.setProperty('--bb-news-text-scale', (c.textScale ?? 100) / 100);
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <div class="bb-news-grid">${ctx?.thumbnail
        ? Array.from({length: 4}).map(() => `<article class="bb-news-card"><div class="bb-news-img bb-news-img-empty"></div><div class="bb-news-text"><h3>Sample headline</h3><p>Live news renders here in the player.</p></div></article>`).join('')
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
        return `
        <article class="bb-news-card">
          ${bg
            ? `<div class="bb-news-img" style="background-image:${bg};"></div>`
            : '<div class="bb-news-img bb-news-img-empty"></div>'}
          <div class="bb-news-text">
            <h3>${escapeHtml(it.title)}</h3>
            <p>${escapeHtml(it.desc)}</p>
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

    (async () => {
      const urls = Array.isArray(c.url) ? c.url.filter(Boolean)
                 : (typeof c.url === 'string' && c.url) ? [c.url]
                 : [];
      if (!urls.length) { grid.innerHTML = '<div class="bb-news-loading">No feed configured</div>'; return; }
      const responses = await Promise.allSettled(
        urls.map(u => fetch(u, { signal: ctrl.signal }).then(r => r.text()))
      );
      if (ctrl.signal.aborted) return;
      const merged = [];
      let okCount = 0;
      for (const resp of responses) {
        if (resp.status !== 'fulfilled') continue;
        try {
          const doc = new DOMParser().parseFromString(resp.value, 'application/xml');
          const items = Array.from(doc.querySelectorAll('item, entry'));
          if (!items.length) continue;
          okCount++;
          for (const it of items) {
            const dateStr = it.querySelector('pubDate, published, updated')?.textContent;
            const date = dateStr ? new Date(dateStr) : null;
            const img = it.getElementsByTagName('media:thumbnail')[0]?.getAttribute('url')
                     || it.getElementsByTagName('media:content')[0]?.getAttribute('url')
                     || it.querySelector('enclosure[type^="image"]')?.getAttribute('url')
                     || (it.querySelector('description')?.textContent ?? '').match(/<img[^>]+src="([^"]+)"/)?.[1]
                     || '';
            merged.push({
              title: it.querySelector('title')?.textContent ?? '',
              desc: (it.querySelector('description, summary')?.textContent ?? '')
                .replace(/<[^>]*>/g, '').slice(0, 200),
              img,
              date: date && !isNaN(date) ? date.getTime() : 0,
            });
          }
        } catch { /* malformed feed, skip */ }
      }
      if (!okCount) {
        if (!ctx?.onError?.()) grid.innerHTML = '<div class="bb-news-error">Feed unavailable</div>';
        return;
      }
      merged.sort((a, b) => b.date - a.date);
      allItems = merged.slice(0, c.maxItems ?? 8);
      layout();
    })();

    const ro = new ResizeObserver(() => layout());
    ro.observe(root);

    return composeDispose(() => {
      ctrl.abort();
      clearInterval(pageTimer);
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
