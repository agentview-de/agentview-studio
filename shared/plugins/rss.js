import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { textScaleField } from '../text-scale.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose, childSignal } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';

// RSS Feed plugin, three layout modes for handling more items than the
// widget can show at once:
//   fit       : render everything, hide what doesn't fit. Always readable.
//   paginate  : split into pages of however many fit, rotate on a timer.
//   ticker    : horizontal scrolling headline ticker (CSS-animated).
// Fit + paginate recompute on resize via ResizeObserver; ticker rerenders
// only when items or the speed change.

// Inject the ticker scroll keyframes once per document (works in admin
// preview, fullscreen preview iframe, and the live player). Reuses the same
// keyframe name as the Ticker plugin so we don't duplicate definitions.
function ensureTickerKeyframes() {
  if (document.getElementById('bb-ticker-kf')) return;
  const style = document.createElement('style');
  style.id = 'bb-ticker-kf';
  style.textContent = '@keyframes bb-ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }';
  document.head.appendChild(style);
}

export default register({
  type: 'rss',
  label: 'RSS Feed',
  group: 'live',
  icon: '📰',
  network: true,
  // Same third-party-content caveat as the News with Photos widget (its
  // image-card sibling): headlines + descriptions are pulled from publisher
  // feeds, so flag it private-only and point to the publisher's terms.
  usage: {
    tier: 'private-only',
    note: 'Headlines and descriptions come from third-party news feeds; check the terms of each publisher before commercial display.',
  },
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(),
    url: ['https://www.heise.de/rss/heise-atom.xml'],
    theme: 'gradient-blue',
    textScale: 100,
    showDesc: true,
    mode: 'fit',
    pageSec: 6,
    tickerSpeed: 80,
    maxItems: 10,
  }),
  schema: () => ({
    fields: [
      // `url` is now an array; the feed-list control also accepts a legacy
      // single-string value (older widgets) and treats it as a one-element array.
      { key: 'url',  type: 'feed-list', label: 'RSS Feeds' },
      themeField(),
      ...colorOverrideFields(),
      textScaleField(),
      { key: 'showDesc', type: 'toggle', label: 'Show descriptions',
        showIf: c => c.mode !== 'ticker' },
      { key: 'mode', type: 'select', label: 'When too many items', options: [
        { value: 'fit',      label: 'Auto-fit (show as many as fit)' },
        { value: 'paginate', label: 'Paginate (rotate through pages)' },
        { value: 'ticker',   label: 'Live ticker (scroll horizontally)' },
      ]},
      { key: 'pageSec', type: 'duration', label: 'Time per page',
        min: 2, max: 30, default: 6,
        showIf: c => c.mode === 'paginate' },
      { key: 'tickerSpeed', type: 'number', label: 'Ticker speed',
        min: 20, max: 300, step: 10, slider: true, suffix: ' px/s',
        showIf: c => c.mode === 'ticker' },
      { key: 'maxItems', type: 'number', label: 'Maximum items',
        min: 1, max: 30, slider: true,
        help: 'How many items to fetch from the feed.' },
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const mode = c.mode ?? 'fit';
    const showDesc = c.showDesc !== false;
    const isTicker = mode === 'ticker';
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-rss bb-theme-${c.theme ?? 'gradient-blue'}` +
      `${showDesc && !isTicker ? '' : ' bb-rss-no-desc'}` +
      `${isTicker ? ' bb-rss-mode-ticker' : ''}`;
    root.style.setProperty('--bb-rss-text-scale', (c.textScale ?? 100) / 100);
    const stubTitles = ['Headline one, sample preview', 'Headline two, sample preview', 'Headline three, sample preview'];

    if (isTicker) {
      // Different DOM shape: a single horizontal track instead of a vertical list.
      root.innerHTML = `
        ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
        <div class="bb-rss-ticker-viewport"><div class="bb-rss-ticker-track">${ctx?.thumbnail
          ? stubTitles.map(t => `<span class="bb-rss-ticker-item">${escapeHtml(t)}</span>`).join('<span class="bb-rss-ticker-sep">•</span>')
          : '<span class="bb-rss-loading">Fetching feed…</span>'}</div></div>
      `;
    } else {
      root.innerHTML = `
        ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
        <ul class="bb-rss-list">${ctx?.thumbnail
          ? stubTitles.map(t => `<li class="bb-rss-item"><div class="bb-rss-title">${escapeHtml(t)}</div><div class="bb-rss-desc">Live feed renders here in the player.</div></li>`).join('')
          : '<li class="bb-rss-loading">Fetching feed…</li>'}</ul>
        ${mode === 'paginate' ? '<div class="bb-rss-dots" aria-hidden="true"></div>' : ''}
      `;
    }
    container.appendChild(root);

    // Thumbnail mode: no fetch, no resize observer, static preview only.
    if (ctx?.thumbnail) return composeDispose(() => root.remove());

    const ctrl = childSignal(ctx?.signal);
    const list = root.querySelector('.bb-rss-list');
    const dots = root.querySelector('.bb-rss-dots');
    const tickerTrack = root.querySelector('.bb-rss-ticker-track');
    let allItems = [];
    let pageTimer = null;
    let currentPage = 0;

    const renderItems = (items) => {
      // Only append "…" when the description was actually truncated, and drop
      // the line entirely when the feed gave no description, a lone "…" or a
      // full sentence with a misleading ellipsis both looked broken.
      list.innerHTML = items.map(it => `
        <li class="bb-rss-item">
          <div class="bb-rss-title">${escapeHtml(it.title)}</div>
          ${it.desc ? `<div class="bb-rss-desc">${escapeHtml(it.desc)}${it.truncated ? '…' : ''}</div>` : ''}
        </li>`).join('') || '<li class="bb-rss-loading">Empty feed</li>';
    };

    const layoutTicker = () => {
      ensureTickerKeyframes();
      if (!tickerTrack) return;
      const titles = allItems.map(i => i.title).filter(Boolean);
      if (!titles.length) { tickerTrack.innerHTML = '<span class="bb-rss-loading">Empty feed</span>'; return; }
      const sep = '•';
      // Two copies of the sequence so translateX(-50%) loops seamlessly.
      const buildCopy = () => titles
        .map(t => `<span class="bb-rss-ticker-item">${escapeHtml(t)}</span>`)
        .join(`<span class="bb-rss-ticker-sep">${sep}</span>`);
      tickerTrack.innerHTML = buildCopy() + `<span class="bb-rss-ticker-sep">${sep}</span>` + buildCopy();
      // Approximate width-per-character (no layout read needed). speed = px/s.
      const cycleChars = titles.join('   ' + sep + '   ').length;
      const approxPx = Math.max(240, cycleChars * 16);
      const speed = Math.max(20, Math.min(300, c.tickerSpeed ?? 80));
      const dur = Math.max(6, approxPx / speed);
      tickerTrack.style.animation = `bb-ticker-scroll ${dur.toFixed(1)}s linear infinite`;
    };

    const layout = () => {
      if (ctrl.signal.aborted || !allItems.length) return;
      clearInterval(pageTimer); pageTimer = null;

      if (isTicker) { layoutTicker(); return; }

      if (mode === 'paginate') {
        // Render the full list once to measure how many items fit per page,
        // then render the current page and start the rotation timer.
        renderItems(allItems);
        const perPage = countFit(list);
        const totalPages = Math.max(1, Math.ceil(allItems.length / perPage));
        if (currentPage >= totalPages) currentPage = 0;
        const showPage = () => {
          const start = currentPage * perPage;
          renderItems(allItems.slice(start, start + perPage));
          drawDots(dots, totalPages, currentPage);
        };
        showPage();
        if (totalPages > 1) {
          const ms = Math.max(2000, (c.pageSec ?? 6) * 1000);
          pageTimer = setInterval(() => {
            if (ctrl.signal.aborted) return;
            currentPage = (currentPage + 1) % totalPages;
            showPage();
          }, ms);
        }
      } else {
        renderItems(allItems);
        // requestAnimationFrame so the browser settles layout before measuring.
        requestAnimationFrame(() => {
          if (ctrl.signal.aborted) return;
          hideOverflow(list);
        });
      }
    };

    (async () => {
      // Accept array (new) or single string (legacy) shape.
      const urls = Array.isArray(c.url) ? c.url.filter(Boolean)
                 : (typeof c.url === 'string' && c.url) ? [c.url]
                 : [];
      if (!urls.length) {
        const errTarget = list ?? tickerTrack;
        if (errTarget) errTarget.innerHTML = `<${list ? 'li' : 'span'} class="bb-rss-error">No feed configured</${list ? 'li' : 'span'}>`;
        return;
      }
      // Fetch all in parallel; ignore individual failures so one dead feed
      // doesn't blank the whole widget.
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
            const rawDesc = (it.querySelector('description, summary')?.textContent ?? '')
              .replace(/<[^>]*>/g, '').trim();
            merged.push({
              title: it.querySelector('title')?.textContent ?? '',
              desc: rawDesc.slice(0, 240),
              truncated: rawDesc.length > 240,
              date: date && !isNaN(date) ? date.getTime() : 0,
            });
          }
        } catch { /* malformed feed body, skip */ }
      }
      if (!okCount) {
        if (!ctx?.onError?.()) {
          const errTarget = list ?? tickerTrack;
          if (errTarget) errTarget.innerHTML = `<${list ? 'li' : 'span'} class="bb-rss-error">Feed unavailable</${list ? 'li' : 'span'}>`;
        }
        return;
      }
      // Sort newest first; undated items go last (preserve relative order).
      merged.sort((a, b) => b.date - a.date);
      allItems = merged.slice(0, c.maxItems ?? 10);
      layout();
    })();

    // Re-layout whenever the widget box changes size. Ticker rerendering is
    // cheap (just one innerHTML + style assignment), so this is fine.
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

// How many of the currently-rendered children fit fully inside the list box?
function countFit(list) {
  const children = [...list.children];
  if (!children.length) return 1;
  const listBottom = list.getBoundingClientRect().bottom;
  let count = 0;
  for (const ch of children) {
    if (ch.getBoundingClientRect().bottom <= listBottom + 0.5) count++;
    else break;
  }
  return Math.max(1, count);
}

function hideOverflow(list) {
  const listBottom = list.getBoundingClientRect().bottom;
  for (const ch of list.children) ch.style.display = '';
  for (const ch of list.children) {
    if (ch.getBoundingClientRect().bottom > listBottom + 0.5) ch.style.display = 'none';
  }
}

function drawDots(host, total, current) {
  if (!host) return;
  if (total <= 1) { host.innerHTML = ''; return; }
  host.innerHTML = Array.from({ length: total }, (_, i) =>
    `<span class="bb-rss-dot${i === current ? ' bb-on' : ''}"></span>`
  ).join('');
}

