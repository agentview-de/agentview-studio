// Tab-Shell — the seam every Verwaltung Tab sits behind. Owns the load →
// loading/error/empty/data lifecycle, the Refresh wiring, and a guarded
// action-button helper, so each Tab module supplies ONLY its load, its render,
// and its actions. The control-flow lives once here (and its pure core in
// lifecycle.js is under test) instead of being hand-rolled in 9 renderers.
//
// A Tab spec:
//   title         section header text
//   headerActions optional header button HTML (e.g. an Add button)
//   onHeader(ctx) optional — wire header buttons after the header renders
//   load(ctx)     fetch the Tab's data; may throw → error state. Optional: a Tab
//                 that fetches inside render (audit, members) can omit it.
//   isEmpty(data) optional — true → empty state
//   emptyText / emptyOpts  copy for the built-in empty state
//   onEmpty(ctx)  optional — wire an empty-state CTA
//   render(data, ctx)  build the Tab body into ctx.content
//
// ctx = { body, content, reload(), onAction(sel, handler, {reload?}), onClick(sel, handler) }

import { t } from '../../i18n.js';
import { toast } from '../../ui/toast.js';
import { runTabLifecycle, runAction } from './lifecycle.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function header(title, extraButtons = '') {
  return `<header class="avs-admin-section-head">
    <h2>${esc(title)}</h2>
    <div class="avs-admin-section-actions">
      ${extraButtons}
      <button class="bb-btn" data-act="refresh">${t('admin.refresh')}</button>
    </div>
  </header>`;
}

export function emptyState(text, opts = {}) {
  const { icon = '📭', cta } = opts;
  const ctaHtml = cta ? `<div style="margin-top:14px;">${cta}</div>` : '';
  return `<div class="avs-admin-empty">
    <div class="avs-admin-empty-icon">${icon}</div>
    <div>${esc(text || t('admin.empty'))}</div>
    ${ctaHtml}
  </div>`;
}

export function table(headers, rows) {
  return `<table class="avs-admin-table">
    <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
}

// Run one Verwaltung Tab's lifecycle into `body`. Returns the lifecycle promise
// (switchTab awaits it for in-flight coalescing). reload() re-runs the whole Tab
// against fresh data — the header (and its freshly-wired Refresh button) is
// rebuilt each time, so listeners never stack.
export function mountTab(body, spec) {
  const ctx = {
    body,
    content: null,
    reload: () => run(),
    // Guarded action button: try handler → on success reload (fresh data), on
    // failure toast. The Tab's handler does the API call + success toast.
    onAction(selector, handler, { reload = true } = {}) {
      body.querySelectorAll(selector).forEach(el => el.addEventListener('click', () =>
        runAction(handler, el, {
          onSuccess: () => { if (reload) ctx.reload(); },
          onError: (e) => toast(e.message, { kind: 'error' }),
        })));
    },
    // Raw click binding for the few buttons that manage their own feedback
    // (a webhook Test with inline timing, a filter Apply, a pricing compare).
    onClick(selector, handler) {
      body.querySelectorAll(selector).forEach(el => el.addEventListener('click', () => handler(el)));
    },
    // Update the header title after load — for Tabs whose title is data-derived
    // (e.g. members showing the org name once the org detail has been fetched).
    setTitle(text) {
      const h = body.querySelector('.avs-admin-section-head h2');
      if (h) h.textContent = text;
    },
  };

  function run() {
    body.innerHTML = header(spec.title, spec.headerActions ?? '');
    const content = document.createElement('div');
    content.className = 'avs-admin-tab-content';
    body.appendChild(content);
    ctx.content = content;
    body.querySelector('[data-act="refresh"]')?.addEventListener('click', ctx.reload);
    spec.onHeader?.(ctx);
    return runTabLifecycle({
      load: () => (spec.load ? spec.load(ctx) : null),
      isEmpty: spec.isEmpty,
      onLoading: () => { content.innerHTML = '<div class="avs-admin-loading">…</div>'; },
      onError: (e) => { content.innerHTML = `<div class="avs-admin-error">${esc(e?.message ?? 'Error')}</div>`; },
      onEmpty: () => {
        content.innerHTML = '';
        content.insertAdjacentHTML('beforeend', emptyState(spec.emptyText, spec.emptyOpts));
        spec.onEmpty?.(ctx);
      },
      onData: (data) => { content.innerHTML = ''; spec.render?.(data, ctx); },
    });
  }

  return run();
}
