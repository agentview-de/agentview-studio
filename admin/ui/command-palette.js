// Cmd+K command palette with fuzzy search.

import { t } from '../i18n.js';
import { kbd } from '../shortcuts.js';
import { escapeHtml } from '../../shared/utils/escape.js';
import { inertBackground } from './inert-background.js';

let _commands = [];
let _root = null;
let _restoreFocus = null;
let _unInert = null;

// How many matches are put in the DOM. The list scrolls, so this is only a
// bound on DOM size — but it used to be a bound on the DOM ONLY: navigation
// wrapped modulo the full match count. With ~70 registered commands, arrowing
// past the fiftieth highlighted nothing and Enter ran a command the user had
// never seen. Everything below works off the SHOWN list, not the match list.
const MAX_SHOWN = 50;

export function registerCommand(cmd) {
  _commands.push(cmd);
}

export function open() {
  if (_root) { close(); return; }
  const opener = document.activeElement;
  _root = document.createElement('div');
  _root.className = 'bb-pal-overlay';
  // A dialog, announced as one. It covers the editor and owns the keyboard
  // while it is up; the list is a listbox that the input drives through
  // aria-activedescendant, which is how a screen reader hears the highlight
  // move without focus ever leaving the search field.
  _root.setAttribute('role', 'dialog');
  _root.setAttribute('aria-modal', 'true');
  _root.setAttribute('aria-label', t('palette.placeholder'));
  _root.innerHTML = `
    <div class="bb-pal">
      <div class="bb-pal-search">
        <span class="bb-pal-icon" aria-hidden="true">${kbd('mod')}</span>
        <input class="bb-pal-input" role="combobox" aria-expanded="true" aria-controls="bb-pal-list"
               aria-autocomplete="list" aria-label="${t('palette.placeholder')}"
               placeholder="${t('palette.placeholder')}" autofocus />
      </div>
      <ul class="bb-pal-list" id="bb-pal-list" role="listbox" aria-label="${t('palette.placeholder')}"></ul>
      <div class="bb-pal-footer"><span>↑↓ ${t('palette.navigate')}</span><span>↵ ${t('palette.run')}</span><span>Esc ${t('palette.close')}</span></div>
    </div>
  `;
  document.body.appendChild(_root);
  _unInert = inertBackground(_root);
  const input = _root.querySelector('.bb-pal-input');
  const list = _root.querySelector('.bb-pal-list');
  let selected = 0;
  let shown = rank('', _commands).slice(0, MAX_SHOWN);

  function render() {
    list.innerHTML = shown.map((c, i) => `
      <li class="bb-pal-item ${i === selected ? 'bb-pal-active' : ''}" data-idx="${i}"
          id="bb-pal-opt-${i}" role="option" aria-selected="${i === selected}">
        <span class="bb-pal-bullet" aria-hidden="true">${c.icon ?? '•'}</span>
        <span class="bb-pal-label">${escapeHtml(c.label)}</span>
        ${c.hint ? `<span class="bb-pal-hint">${escapeHtml(c.hint)}</span>` : ''}
      </li>
    `).join('') || `<li class="bb-pal-empty">${t('palette.noMatches')}</li>`;
    if (shown.length) input.setAttribute('aria-activedescendant', `bb-pal-opt-${selected}`);
    else input.removeAttribute('aria-activedescendant');
    // Keep the highlight where it can be seen: the list is 55vh tall with its
    // own scrollbar, and arrowing down used to walk straight out of view.
    list.querySelector('.bb-pal-active')?.scrollIntoView({ block: 'nearest' });
  }

  const move = (delta) => {
    if (!shown.length) return;
    selected = (selected + delta + shown.length) % shown.length;
    render();
  };

  function run(i) {
    const cmd = shown[i];
    if (!cmd) return;
    close();
    try { cmd.run?.(); } catch (e) { console.error('command failed', e); }
  }

  input.addEventListener('input', () => {
    shown = rank(input.value, _commands).slice(0, MAX_SHOWN);
    selected = 0;
    render();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { move(1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { move(-1); e.preventDefault(); }
    else if (e.key === 'Home') { selected = 0; render(); e.preventDefault(); }
    else if (e.key === 'End') { selected = Math.max(0, shown.length - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { run(selected); e.preventDefault(); }
    else if (e.key === 'Escape') { close(); }
    // Tab must not walk into the editor behind an overlay that covers it.
    else if (e.key === 'Tab') { e.preventDefault(); }
  });
  list.addEventListener('click', e => {
    const li = e.target.closest('li[data-idx]');
    if (li) run(+li.dataset.idx);
  });
  _root.addEventListener('click', e => { if (e.target === _root) close(); });
  render();
  setTimeout(() => input.focus(), 30);
  _restoreFocus = () => { try { if (opener?.isConnected) opener.focus?.(); } catch { /* opener went away */ } };
}

export function close() {
  _unInert?.();
  _unInert = null;
  _root?.remove();
  _root = null;
  // Hand the keyboard back to whatever opened this. Removing the overlay while
  // the search field has focus drops focus on <body>, and the next Tab starts
  // again from the top of the page.
  const restore = _restoreFocus;
  _restoreFocus = null;
  restore?.();
}

export function isOpen() { return !!_root; }

// Simple fuzzy ranker — case-insensitive substring, with a bonus when the words
// appear in the order they were typed.
//
// The comment always said "bonus"; the code made it a REQUIREMENT. Each token
// was searched from just after the previous match, so a query whose words came
// out in the wrong order matched nothing at all: "slide add" found none of the
// commands that "add slide" finds. People type the noun first about as often as
// the verb.
export function rank(q, cmds) {
  if (!q.trim()) return [...cmds];
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = [];
  for (const c of cmds) {
    const txt = `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`.toLowerCase();
    let s = 0, lastIdx = -1, inOrder = true, all = true;
    for (const tok of tokens) {
      const idx = txt.indexOf(tok);
      if (idx === -1) { all = false; break; }
      s += 10 - Math.min(9, idx);           // earlier in the text scores higher
      const next = txt.indexOf(tok, lastIdx + 1);
      if (next === -1) inOrder = false; else lastIdx = next;
    }
    if (!all) continue;
    if (inOrder) s += 5;
    scored.push({ c, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.map(x => x.c);
}

