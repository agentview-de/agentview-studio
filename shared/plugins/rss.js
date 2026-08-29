import { register } from './registry.js';
import { textScaleField } from '../text-scale.js';
import { colorOverrideDefaults, themeColorSection, applyColorOverrides } from '../widget-color.js';
import { composeDispose, childSignal } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';
import { fetchFeedItems } from '../feeds.js';
import { isStored, dataModeField } from '../offline-data.js';
import { refreshSecField, refreshIntervalMs } from '../refresh-field.js';
import { localeField, safeLocale } from '../locale-field.js';
import { ensureTickerKeyframes } from '../ticker-keyframes.js';
import { dataModeNetwork } from '../plugin-network.js';

// Map one <item>/<entry> node to the shape the widget renders. Shared by the
// live fetch and offline provisioning so both store/show identical data.
const rssMapItem = (it) => {
  const dateStr = it.querySelector('pubDate, published, updated')?.textContent;
  const date = dateStr ? new Date(dateStr) : null;
  // Only append "…" when the description was actually truncated, and drop the
  // line entirely when the feed gave no description — a lone "…" or a full
  // sentence with a misleading ellipsis both looked broken.
  const rawDesc = (it.querySelector('description, summary')?.textContent ?? '')
    .replace(/<[^>]*>/g, '').trim();
  return {
    title: it.querySelector('title')?.textContent ?? '',
    desc: rawDesc.slice(0, 240),
    truncated: rawDesc.length > 240,
    date: date && !isNaN(date) ? date.getTime() : 0,
  };
};

// RSS Feed plugin, three layout modes for handling more items than the
// widget can show at once:
//   fit       : render everything, hide what doesn't fit. Always readable.
//   paginate  : split into pages of however many fit, rotate on a timer.
//   ticker    : horizontal scrolling headline ticker (CSS-animated).
// Fit + paginate recompute on resize via ResizeObserver; ticker rerenders
// only when items or the speed change.
//
// Ticker keyframes come from the SHARED ensureTickerKeyframes() helper
// (shared/ticker-keyframes.js) — the old local copy only defined the LTR
// keyframe under the shared 'bb-ticker-kf' style id, which silently broke the
// Ticker widget's right-to-left direction when an RSS widget rendered first.

// Inline style for the per-item timestamp (sizes follow the same cqmin clamp ×
// text-scale pattern as .bb-rss-title/.bb-rss-desc in the stylesheet).
const DATE_STYLE = 'font-size:calc(clamp(11px, 1.9cqmin, 26px) * var(--bb-rss-text-scale, 1));color:var(--bb-st-accent);opacity:.9;';
// Ticker variant inherits the track font size, so plain em works there.
const TICKER_DATE_STYLE = 'font-size:.55em;color:var(--bb-st-accent);opacity:.9;margin-left:.6em;';

export default register({
  type: 'rss',
  label: 'RSS Feed',
  group: 'live',
  icon: '📰',
  // 'stored' reads data the Studio fetched earlier; only 'live' calls out.
  network: dataModeNetwork,
  // Same third-party-content caveat as the News with Photos widget (its
  // image-card sibling): headlines + descriptions are pulled from publisher
  // feeds, so flag it private-only and point to the publisher's terms.
  usage: {
    tier: 'private-only',
    note: 'Headlines and descriptions come from third-party news feeds; check the terms of each publisher before commercial display.',
  },
  schemaVersion: 1,
  // Offline provisioning: the Studio fetches + parses the feeds on "Refresh data"
  // and stores the merged item array; the display reads that (no live fetch, no
  // internet needed on screen). Returns the same shape rssMapItem produces.
  provisionOffline: async (content) => {
    const { items, okCount, configured } = await fetchFeedItems(content?.url, {
      mapItem: rssMapItem, maxItems: content?.maxItems ?? 10,
    });
    if (!configured) throw new Error('No feed configured');
    if (!okCount) throw new Error('Feed unavailable');
    return items;
  },
  defaults: () => ({ ...colorOverrideDefaults(),
    dataMode: 'live',
    url: ['https://www.heise.de/rss/heise-atom.xml'],
    theme: 'gradient-blue',
    textScale: 100,
    showDesc: true,
    showDate: false,
    dateFormat: 'relative',
    locale: '',
    mode: 'fit',
    pageSec: 6,
    tickerSpeed: 80,
    maxItems: 10,
    refreshSec: 300,
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
      dataModeField({
        help: 'Offline: the Studio fetches the feeds on “Refresh data” and stores them; the display reads that — no live fetch on screen.',
      }),
      // `url` is an array; the feed-list control also accepts a legacy
      // single-string value (older widgets) and treats it as a one-element array.
      { key: 'url', type: 'feed-list', label: 'RSS Feeds',
        help: 'Add one or more feeds — items from all feeds merge into one list, newest first.' },
      { key: 'maxItems', type: 'number', label: 'Maximum items',
        min: 1, max: 30, slider: true,
        help: 'Total items kept after merging all feeds.' },

      { type: 'section', key: 'layout', label: 'Layout' },
      // The mode select gates showDesc / pageSec / tickerSpeed below it.
      { key: 'mode', type: 'select', label: 'When too many items', options: [
        { value: 'fit',      label: 'Auto-fit (show as many as fit)' },
        { value: 'paginate', label: 'Paginate (rotate through pages)' },
        { value: 'ticker',   label: 'Live ticker (scroll horizontally)' },
      ]},
      { key: 'showDesc', type: 'toggle', label: 'Show descriptions', tier: 'advanced',
        showIf: c => c.mode !== 'ticker' },
      { key: 'showDate', type: 'toggle', label: 'Show item date', tier: 'advanced',
        help: 'Shows each item’s publication time as a small accent-coloured label.' },
      { key: 'dateFormat', type: 'select', label: 'Date format', tier: 'advanced', options: [
        { value: 'relative', label: 'Relative (2 hr ago)' },
        { value: 'time',     label: 'Time (14:05)' },
        { value: 'date',     label: 'Weekday + time (Mon 14:05)' },
      ], showIf: c => !!c.showDate },
      { ...localeField(), tier: 'advanced', showIf: c => !!c.showDate },
      { ...textScaleField(), tier: 'advanced' },

      { type: 'section', key: 'behavior', label: 'Behavior' },
      { key: 'pageSec', type: 'duration', label: 'Time per page', tier: 'advanced',
        min: 2, max: 30,
        showIf: c => c.mode === 'paginate' },
      { key: 'tickerSpeed', type: 'number', label: 'Ticker speed', tier: 'advanced',
        min: 20, max: 300, step: 10, slider: true, suffix: ' px/s',
        showIf: c => c.mode === 'ticker' },
      refreshSecField({ showIf: c => c.dataMode !== 'stored' }),

      ...themeColorSection(),
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const mode = c.mode ?? 'fit';
    const showDesc = c.showDesc !== false;
    const showDate = !!c.showDate;
    const dateFormat = c.dateFormat ?? 'relative';
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
    let refreshTimer = null;
    let dateTimer = null;
    let currentPage = 0;

    // Format one item's epoch-ms timestamp for the audience. `safeLocale(c.locale)`
    // (never ??) so the '' = browser-default sentinel falls through to the device.
    const fmtDate = (ts) => {
      if (!showDate || !ts) return '';
      const loc = safeLocale(c.locale);
      try {
        if (dateFormat === 'time') {
          return new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' }).format(ts);
        }
        if (dateFormat === 'date') {
          return new Intl.DateTimeFormat(loc, { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(ts);
        }
        // relative ("2 hr ago") — minutes, then hours, then days.
        const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto', style: 'short' });
        const min = Math.round((ts - Date.now()) / 60000);
        if (Math.abs(min) < 60) return rtf.format(min, 'minute');
        const hrs = Math.round(min / 60);
        if (Math.abs(hrs) < 24) return rtf.format(hrs, 'hour');
        return rtf.format(Math.round(hrs / 24), 'day');
      } catch { return ''; }
    };

    const renderItems = (items) => {
      // Only append "…" when the description was actually truncated, and drop
      // the line entirely when the feed gave no description, a lone "…" or a
      // full sentence with a misleading ellipsis both looked broken.
      list.innerHTML = items.map(it => {
        const dt = fmtDate(it.date);
        return `
        <li class="bb-rss-item">
          <div class="bb-rss-title" data-field="url maxItems textScale">${escapeHtml(it.title)}</div>
          ${it.desc ? `<div class="bb-rss-desc" data-field="showDesc textScale">${escapeHtml(it.desc)}${it.truncated ? '…' : ''}</div>` : ''}
          ${dt ? `<div class="bb-rss-date" data-field="showDate dateFormat locale" data-ts="${it.date}" style="${DATE_STYLE}">${escapeHtml(dt)}</div>` : ''}
        </li>`;
      }).join('') || '<li class="bb-rss-loading">Empty feed</li>';
    };

    const layoutTicker = () => {
      ensureTickerKeyframes();
      if (!tickerTrack) return;
      const entries = allItems.filter(i => i.title);
      if (!entries.length) { tickerTrack.innerHTML = '<span class="bb-rss-loading">Empty feed</span>'; return; }
      const sep = '•';
      // Two copies of the sequence so translateX(-50%) loops seamlessly.
      const buildCopy = () => entries
        .map(i => {
          const dt = fmtDate(i.date);
          return `<span class="bb-rss-ticker-item" data-field="url maxItems mode tickerSpeed textScale">${escapeHtml(i.title)}${dt ? `<span data-field="showDate dateFormat locale" data-ts="${i.date}" style="${TICKER_DATE_STYLE}">${escapeHtml(dt)}</span>` : ''}</span>`;
        })
        .join(`<span class="bb-rss-ticker-sep">${sep}</span>`);
      tickerTrack.innerHTML = buildCopy() + `<span class="bb-rss-ticker-sep">${sep}</span>` + buildCopy();
      // Approximate width-per-character (no layout read needed). speed = px/s.
      const cycleChars = entries
        .map(i => i.title + (showDate ? '  ' + fmtDate(i.date) : ''))
        .join('   ' + sep + '   ').length;
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

    const showErr = (msg) => {
      const errTarget = list ?? tickerTrack;
      if (errTarget) errTarget.innerHTML = `<${list ? 'li' : 'span'} class="bb-rss-error">${escapeHtml(msg)}</${list ? 'li' : 'span'}>`;
    };

    // Offline / provided mode: the Studio pre-fetched + parsed the feeds and the
    // merged items live in a data slot, injected here as content._offline.data via
    // a slot binding (set at publish). The display renders that — no live fetch.
    const stored = isStored(c);

    // Live fetch + parse of every feed (shared pipeline; one dead feed doesn't
    // blank the widget). Re-runs on the refresh timer; refresh failures keep the
    // last good items on screen instead of blanking to an error.
    const loadLive = async (first) => {
      const { items, okCount, configured } = await fetchFeedItems(c.url, {
        signal: ctrl.signal, mapItem: rssMapItem, maxItems: c.maxItems ?? 10,
      });
      if (ctrl.signal.aborted) return;
      if (!configured) { if (first) showErr('No feed configured'); return; }
      if (!okCount) { if (first && !ctx?.onError?.()) showErr('Feed unavailable'); return; }
      allItems = items;
      layout();
    };

    if (stored) {
      const offlineItems = c._offline?.data;
      if (offlineItems === undefined) {
        const ph = list ?? tickerTrack;
        if (ph) ph.innerHTML = `<${list ? 'li' : 'span'} class="bb-rss-loading">Provided offline — appears after “Refresh data”.</${list ? 'li' : 'span'}>`;
      } else {
        allItems = (Array.isArray(offlineItems) ? offlineItems : []).slice(0, c.maxItems ?? 10);
        if (!allItems.length) showErr('Empty feed');
        else layout();
      }
    } else {
      loadLive(true);
      // Poll the feeds so a slide pinned on screen for hours doesn't show stale
      // headlines. 0 = fetch once; positive values floor at the 5 s player minimum.
      const refreshSec = c.refreshSec ?? 300;
      if (refreshSec > 0) {
        refreshTimer = setInterval(() => {
          if (!ctrl.signal.aborted) loadLive(false);
        }, refreshIntervalMs(refreshSec));
      }
    }

    // Relative timestamps drift ("2 min ago" → "3 min ago") — update the date
    // labels in place once a minute without re-running the full layout (which
    // would reset the pagination rotation).
    if (showDate && dateFormat === 'relative') {
      dateTimer = setInterval(() => {
        if (ctrl.signal.aborted) return;
        root.querySelectorAll('[data-ts]').forEach(el => {
          el.textContent = fmtDate(Number(el.dataset.ts));
        });
      }, 60000);
    }

    // Re-layout whenever the widget box changes size. Ticker rerendering is
    // cheap (just one innerHTML + style assignment), so this is fine.
    const ro = new ResizeObserver(() => layout());
    ro.observe(root);

    return composeDispose(() => {
      ctrl.abort();
      clearInterval(pageTimer);
      clearInterval(refreshTimer);
      clearInterval(dateTimer);
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
