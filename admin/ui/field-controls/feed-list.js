// Multi-feed picker — chips for selected URLs + an add button that opens
// a multi-select directory modal. Accepts a legacy single-string value and
// silently treats it as a one-element array.

import { t, tx } from '../../i18n.js';
import { RSS_FEEDS } from '../../../shared/data/rss-feeds.js';
import { openModal } from '../modal.js';
import { h, esc } from './_shared.js';

export function renderFeedList(f, v, set) {
  const wrap = h('div', 'bb-feedlist-field');
  let urls = Array.isArray(v) ? v.filter(Boolean)
           : (typeof v === 'string' && v) ? [v]
           : [];

  const findName = (url) => {
    for (const cat of RSS_FEEDS) {
      const fd = cat.feeds.find(x => x.url === url);
      if (fd) return fd.name;
    }
    return null;
  };

  // commit() = persist to parent state AND redraw the chips. Defined as a
  // function declaration so the inner closures (picker, chip-remove) can
  // reference it before render() runs.
  function commit() { set([...urls]); render(); }

  function openPicker() {
    const body = h('div', 'bb-feed-dir');
    // Working selection — buffered so each click can toggle without closing
    // the modal. Commit happens once when the user clicks "Done"; "Cancel"
    // throws the buffer away.
    const chosen = new Set(urls);
    // Track row buttons by URL so we can update their checked state in place.
    const rowEls = new Map();
    const refreshRow = (url) => {
      const r = rowEls.get(url);
      if (!r) return;
      const on = chosen.has(url);
      r.classList.toggle('bb-feed-row-on', on);
      r.querySelector('.bb-feed-check').textContent = on ? '☑' : '☐';
    };

    openModal({
      title: t('feed.browse'),
      body,
      actions: [
        { label: t('common.cancel') },
        { label: t('common.done'), kind: 'primary', value: 'done' },
      ],
      onMount: (card) => {
        // Listen for the Done action: commit the buffered selection.
        const footer = card.querySelector('.bb-modal-footer');
        footer?.querySelectorAll('button').forEach(b => {
          if (b.textContent.trim() === t('common.done')) {
            b.addEventListener('click', () => { urls = [...chosen]; commit(); });
          }
        });

        // Custom-URL row at the top — adds to the buffer without closing.
        const custom = h('div', 'bb-feedlist-custom');
        const ci = h('input');
        ci.type = 'url';
        ci.placeholder = t('feed.placeholder');
        const cb = h('button', 'bb-btn bb-btn-secondary bb-btn-sm', t('common.add'));
        cb.type = 'button';
        const addCustom = () => {
          const u = ci.value.trim();
          if (!u || chosen.has(u)) return;
          chosen.add(u);
          ci.value = '';
          // Render the new URL as a row at the bottom so the user sees it
          // immediately and can untick it if it was a mistake.
          appendCustomRow(u);
        };
        cb.addEventListener('click', addCustom);
        ci.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } });
        custom.append(ci, cb);
        body.append(custom);

        const buildRow = (url, name) => {
          const r = h('button', 'bb-feed-row');
          r.type = 'button';
          r.innerHTML =
            `<span class="bb-feed-check" aria-hidden="true">☐</span>` +
            `<div class="bb-feed-row-text"><span class="bb-feed-name">${esc(name)}</span><span class="bb-feed-url">${esc(url)}</span></div>`;
          r.addEventListener('click', () => {
            if (chosen.has(url)) chosen.delete(url); else chosen.add(url);
            refreshRow(url);
          });
          rowEls.set(url, r);
          refreshRow(url);
          return r;
        };

        RSS_FEEDS.forEach(cat => {
          body.append(h('div', 'bb-feed-cat', esc(cat.category)));
          cat.feeds.forEach(fd => body.append(buildRow(fd.url, fd.name)));
        });

        // Slot for custom (non-directory) URLs added during this session.
        const customSection = h('div', 'bb-feed-custom-section');
        body.append(customSection);
        function appendCustomRow(url) {
          if (!customSection.children.length) {
            customSection.append(h('div', 'bb-feed-cat', esc(t('feed.customCat'))));
          }
          customSection.append(buildRow(url, url));
        }
        // If any current selection is custom (not in directory), surface it as a row.
        [...chosen].forEach(u => {
          if (![...rowEls.keys()].includes(u)) appendCustomRow(u);
        });
      },
    });
  }

  function render() {
    wrap.innerHTML = '';
    const chips = h('div', 'bb-feedlist-chips');
    if (!urls.length) {
      chips.append(h('div', 'bb-feedlist-empty', t('feed.none')));
    } else {
      urls.forEach((url, i) => {
        const chip = h('div', 'bb-feedlist-chip');
        const name = findName(url) ?? url;
        chip.innerHTML = `<span class="bb-feedlist-name" title="${esc(url)}">${esc(name)}</span><button class="bb-feedlist-rm" type="button" aria-label="${esc(tx('Remove'))}" title="${esc(tx('Remove'))}">✕</button>`;
        chip.querySelector('.bb-feedlist-rm').addEventListener('click', () => {
          urls.splice(i, 1); commit();
        });
        chips.append(chip);
      });
    }
    wrap.append(chips);

    const actions = h('div', 'bb-feedlist-actions');
    const add = h('button', 'bb-btn bb-btn-secondary bb-btn-sm', '+ ' + t('feed.add'));
    add.type = 'button';
    add.addEventListener('click', openPicker);
    actions.append(add);
    wrap.append(actions);

    const hint = h('p', 'bb-form-help', t('feed.multiHint'));
    wrap.append(hint);
  }

  render();
  return { el: wrap };
}
