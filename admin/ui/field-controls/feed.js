// Single-feed URL field — text input + RSS directory browser + autodetect probe.

import { t } from '../../i18n.js';
import { RSS_FEEDS } from '../../../shared/data/rss-feeds.js';
import { probeUrl } from '../probe.js';
import { openModal } from '../modal.js';
import { h, esc } from './_shared.js';

export function renderFeed(f, v, set) {
  const wrap = h('div', 'bb-feed-field');
  const row = h('div', 'bb-asset-field');
  const input = h('input');
  input.type = 'text';
  input.placeholder = t('feed.placeholder');
  input.value = v ?? '';
  input.addEventListener('input', () => set(input.value));
  const browseBtn = h('button', 'bb-btn bb-btn-secondary', '📡');
  browseBtn.type = 'button'; browseBtn.title = t('feed.browse');
  row.append(input, browseBtn);

  const actions = h('div', 'bb-field-test');
  const testBtn = h('button', 'bb-btn bb-btn-secondary bb-btn-sm', '⚡ ' + t('probe.test'));
  testBtn.type = 'button';
  actions.append(testBtn);

  const hint = h('p', 'bb-form-help', t('feed.corsHint'));
  const msg = h('div', 'bb-field-msg');
  msg.hidden = true;
  const showMsg = (level, text) => { msg.hidden = false; msg.dataset.level = level; msg.textContent = text; };

  browseBtn.addEventListener('click', () => {
    const body = h('div', 'bb-feed-dir');
    openModal({
      title: t('feed.browse'),
      body,
      actions: [{ label: t('common.close') }],
      onMount: (card, close) => {
        RSS_FEEDS.forEach(cat => {
          body.append(h('div', 'bb-feed-cat', esc(cat.category)));
          cat.feeds.forEach(fd => {
            const r = h('button', 'bb-feed-row');
            r.type = 'button';
            r.innerHTML = `<span class="bb-feed-name">${esc(fd.name)}</span><span class="bb-feed-url">${esc(fd.url)}</span>`;
            r.addEventListener('click', () => { input.value = fd.url; set(fd.url); close(); });
            body.append(r);
          });
        });
      },
    });
  });

  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    const label = testBtn.textContent;
    testBtn.textContent = t('probe.testing');
    try { const res = await probeUrl(input.value.trim(), 'feed'); showMsg(res.level, res.message); }
    finally { testBtn.disabled = false; testBtn.textContent = label; }
  });

  wrap.append(row, actions, hint, msg);
  return { el: wrap };
}
