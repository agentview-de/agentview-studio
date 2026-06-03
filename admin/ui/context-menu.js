// Lightweight floating context menu for right-click actions. Reuses the
// .avs-menu / .avs-menu-item styling but positions itself at the cursor instead
// of inside a centered modal. One menu open at a time.
//
//   openContextMenu(clientX, clientY, items)
//   items: [{ label, icon?, run, disabled? } | { separator: true }, …]

import { escapeHtml } from '../../shared/utils/escape.js';

let openEl = null;

function onDocPointer(e) { if (openEl && !openEl.contains(e.target)) closeContextMenu(); }
function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); closeContextMenu(); } }

export function closeContextMenu() {
  if (!openEl) return;
  openEl.remove();
  openEl = null;
  document.removeEventListener('pointerdown', onDocPointer, true);
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('blur', closeContextMenu);
  window.removeEventListener('resize', closeContextMenu);
  window.removeEventListener('wheel', closeContextMenu, true);
}

export function openContextMenu(x, y, items) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'avs-menu avs-context-menu';
  for (const it of (items ?? [])) {
    if (!it) continue;
    if (it.separator) { const s = document.createElement('div'); s.className = 'avs-menu-sep'; menu.appendChild(s); continue; }
    const b = document.createElement('button');
    b.className = 'avs-menu-item';
    b.disabled = !!it.disabled;
    b.innerHTML = `${it.icon ? `<span class="avs-menu-ic">${it.icon}</span>` : '<span class="avs-menu-ic"></span>'}<span>${escapeHtml(it.label)}</span>`;
    if (!it.disabled) b.addEventListener('click', () => { closeContextMenu(); try { it.run?.(); } catch (e) { console.error('context action failed', e); } });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);

  // Clamp into the viewport so it never spills off-screen.
  const r = menu.getBoundingClientRect();
  const pad = 6;
  const left = Math.max(pad, Math.min(x, innerWidth - r.width - pad));
  const top = Math.max(pad, Math.min(y, innerHeight - r.height - pad));
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  openEl = menu;
  // Defer global listeners so the opening right-click doesn't immediately close it.
  setTimeout(() => {
    if (!openEl) return;
    document.addEventListener('pointerdown', onDocPointer, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', closeContextMenu);
    window.addEventListener('resize', closeContextMenu);
    window.addEventListener('wheel', closeContextMenu, true);
  }, 0);
  return menu;
}
