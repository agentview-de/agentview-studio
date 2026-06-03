// Cmd+K command palette with fuzzy search.

import { t } from '../i18n.js';
import { kbd } from '../shortcuts.js';
import { escapeHtml } from '../../shared/utils/escape.js';

let _commands = [];
let _root = null;

export function registerCommand(cmd) {
  _commands.push(cmd);
}

export function open() {
  if (_root) { close(); return; }
  _root = document.createElement('div');
  _root.className = 'bb-pal-overlay';
  _root.innerHTML = `
    <div class="bb-pal">
      <div class="bb-pal-search">
        <span class="bb-pal-icon">${kbd('mod')}</span>
        <input class="bb-pal-input" placeholder="${t('palette.placeholder')}" autofocus />
      </div>
      <ul class="bb-pal-list"></ul>
      <div class="bb-pal-footer"><span>↑↓ ${t('palette.navigate')}</span><span>↵ ${t('palette.run')}</span><span>Esc ${t('palette.close')}</span></div>
    </div>
  `;
  document.body.appendChild(_root);
  const input = _root.querySelector('.bb-pal-input');
  const list = _root.querySelector('.bb-pal-list');
  let selected = 0;
  let filtered = rank('', _commands);

  function render() {
    list.innerHTML = filtered.slice(0, 50).map((c, i) => `
      <li class="bb-pal-item ${i === selected ? 'bb-pal-active' : ''}" data-idx="${i}">
        <span class="bb-pal-bullet">${c.icon ?? '•'}</span>
        <span class="bb-pal-label">${escapeHtml(c.label)}</span>
        ${c.hint ? `<span class="bb-pal-hint">${escapeHtml(c.hint)}</span>` : ''}
      </li>
    `).join('') || `<li class="bb-pal-empty">${t('palette.noMatches')}</li>`;
  }

  function run(i) {
    const cmd = filtered[i];
    if (!cmd) return;
    close();
    try { cmd.run?.(); } catch (e) { console.error('command failed', e); }
  }

  input.addEventListener('input', () => {
    filtered = rank(input.value, _commands);
    selected = 0;
    render();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { selected = (selected + 1) % filtered.length; render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { selected = (selected - 1 + filtered.length) % filtered.length; render(); e.preventDefault(); }
    else if (e.key === 'Enter') { run(selected); e.preventDefault(); }
    else if (e.key === 'Escape') { close(); }
  });
  list.addEventListener('click', e => {
    const li = e.target.closest('li[data-idx]');
    if (li) run(+li.dataset.idx);
  });
  _root.addEventListener('click', e => { if (e.target === _root) close(); });
  render();
  setTimeout(() => input.focus(), 30);
}

export function close() {
  _root?.remove();
  _root = null;
}

export function isOpen() { return !!_root; }

// Simple fuzzy ranker — case-insensitive substring + token order bonus.
function rank(q, cmds) {
  if (!q) return [...cmds];
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = [];
  for (const c of cmds) {
    const txt = `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`.toLowerCase();
    let s = 0; let lastIdx = -1;
    for (const tok of tokens) {
      const idx = txt.indexOf(tok, lastIdx + 1);
      if (idx === -1) { s = -1; break; }
      s += 10 - Math.min(9, idx);
      lastIdx = idx;
    }
    if (s >= 0) scored.push({ c, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.map(x => x.c);
}

