// Browse agentView's 600+ public API list and one-click add a Live-JSON or
// Chart slide.

import { publicApis as api } from '../api.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { createSlide } from '../../shared/slide-schema.js';
import { escapeHtml, escapeAttr } from '../../shared/utils/escape.js';
import { tx } from '../i18n.js';

export async function open(addSlide) {
  const host = document.createElement('div');
  host.innerHTML = `
    <div class="bb-papi-toolbar">
      <input id="papi-q" placeholder="${escapeAttr(tx('Search 600+ free APIs (CORS only)…'))}" />
    </div>
    <div class="bb-papi-list" id="papi-list">${tx('Loading…')}</div>
  `;
  const list = host.querySelector('#papi-list');
  const fetchResults = async q => {
    list.innerHTML = tx('Searching…');
    try {
      const r = await api.search(q);
      const items = Array.isArray(r) ? r : (r?.apis ?? r?.results ?? []);
      list.innerHTML = items.slice(0, 40).map(apiRow).join('') || `<div class="bb-empty-state">${tx('No matches.')}</div>`;
    } catch (e) { list.innerHTML = `<div class="bb-empty-state">${tx('Search failed')}: ${escapeHtml(e.message)}</div>`; }
  };
  fetchResults('');
  host.querySelector('#papi-q').addEventListener('input', debounce(e => fetchResults(e.target.value), 300));
  host.addEventListener('click', async e => {
    const btn = e.target.closest('[data-act="add"]');
    if (!btn) return;
    const url = btn.dataset.url;
    const name = btn.dataset.name;
    if (!url) { toast(tx('No URL for this API'), { kind: 'warn' }); return; }
    // Quick CORS probe so we warn the user before the slide silently fails.
    btn.disabled = true;
    btn.textContent = tx('Checking CORS…');
    const corsOk = await probeCors(url);
    btn.disabled = false;
    btn.textContent = '+ ' + tx('Add as slide');
    if (!corsOk) {
      toast(`${name} ${tx("doesn't return CORS headers, slide may not render outside the agentView player. Added anyway.")}`, { kind: 'warn', ttl: 6000 });
    }
    addSlide(createSlide('live-json', {
      title: name,
      duration: 12,
      content: { url, refreshSec: 60, theme: 'dark-minimal' },
    }));
    toast(`${tx('Added')}: ${name}`, { kind: 'success' });
  });
  await openModal({ title: tx('Public APIs'), body: host, actions: [{ label: tx('Close') }] });
}

function apiRow(a) {
  const url = a.url ?? a.endpoint ?? a.link;
  // PublicApiItem from agentView uses `category` (singular string). Other API
  // catalogues use `tags`/`categories` (array). Normalise so the singular form
  // doesn't render as an empty pill row.
  const tags = Array.isArray(a.tags) ? a.tags
    : Array.isArray(a.categories) ? a.categories
    : (a.category ? [a.category] : []);
  return `<div class="bb-papi-row">
    <div class="bb-papi-meta">
      <div class="bb-papi-name">${escapeHtml(a.name ?? a.title ?? 'API')}</div>
      <div class="bb-papi-desc">${escapeHtml(a.description ?? '')}</div>
      <div class="bb-papi-tags">${tags.map(t => `<span>${escapeHtml(t)}</span>`).join('')}</div>
    </div>
    <button class="bb-btn bb-btn-secondary" data-act="add" data-url="${escapeAttr(url ?? '')}" data-name="${escapeAttr(a.name ?? '')}">+ ${escapeHtml(tx('Add as slide'))}</button>
  </div>`;
}

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

async function probeCors(url) {
  // HEAD request with a short timeout. If it succeeds without a CORS error,
  // the target server is responding to cross-origin requests.
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(url, { method: 'HEAD', signal: ctrl.signal, mode: 'cors' });
    return r.ok || r.type === 'opaque' ? true : true; // any response = CORS OK
  } catch (e) {
    return false;
  }
}
