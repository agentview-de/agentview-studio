// Lightweight floating context menu for right-click actions. Reuses the
// .avs-menu / .avs-menu-item styling but positions itself at the cursor instead
// of inside a centered modal. One menu open at a time.
//
//   openContextMenu(clientX, clientY, items)
//   items: [{ label, icon?, run, disabled? } | { separator: true }, …]

import { escapeHtml } from '../../shared/utils/escape.js';

let openEl = null;
let opener = null;

// The enabled entries, in the order they are read.
const menuItems = () => [...(openEl?.querySelectorAll('.avs-menu-item:not([disabled])') ?? [])];

function onDocPointer(e) { if (openEl && !openEl.contains(e.target)) closeContextMenu(); }

// A menu that can be OPENED from the keyboard has to be usable from it. Every
// surface that opens one of these is keyboard-reachable — a widget frame is
// focusable, a slide card is — and browsers fire `contextmenu` for Shift+F10
// and the menu key. So the menu appeared, at the right place, with the right
// entries, and there was no way to reach a single one of them: focus stayed
// where it was, and the buttons sat at the very end of <body>.
function onKey(e) {
  if (!openEl) return;
  if (e.key === 'Escape') { e.preventDefault(); closeContextMenu(); return; }
  const items = menuItems();
  if (!items.length) return;
  const at = items.indexOf(document.activeElement);
  const go = (i) => { e.preventDefault(); items[(i + items.length) % items.length].focus(); };
  if (e.key === 'ArrowDown') go(at < 0 ? 0 : at + 1);
  else if (e.key === 'ArrowUp') go(at < 0 ? items.length - 1 : at - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(items.length - 1);
  // Tab cycles inside the menu rather than walking off into the editor behind
  // it — a menu is modal for as long as it is up.
  else if (e.key === 'Tab') go(at < 0 ? 0 : at + (e.shiftKey ? -1 : 1));
}

export function closeContextMenu() {
  if (!openEl) return;
  // Only take the focus back if the MENU had it. Dismissing by clicking
  // somewhere else has already moved it, and yanking it away again would undo
  // what the click just did.
  const handBack = openEl.contains(document.activeElement) ? opener : null;
  openEl.remove();
  openEl = null;
  opener = null;
  document.removeEventListener('pointerdown', onDocPointer, true);
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('blur', closeContextMenu);
  window.removeEventListener('resize', closeContextMenu);
  window.removeEventListener('wheel', closeContextMenu, true);
  try { if (handBack?.isConnected) handBack.focus?.(); } catch { /* it went away */ }
}

export function openContextMenu(x, y, items) {
  closeContextMenu();
  const from = document.activeElement;
  const menu = document.createElement('div');
  menu.className = 'avs-menu avs-context-menu';
  menu.setAttribute('role', 'menu');
  for (const it of (items ?? [])) {
    if (!it) continue;
    if (it.separator) {
      const s = document.createElement('div');
      s.className = 'avs-menu-sep';
      s.setAttribute('role', 'separator');
      menu.appendChild(s);
      continue;
    }
    const b = document.createElement('button');
    b.className = 'avs-menu-item';
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.disabled = !!it.disabled;
    if (it.disabled) b.setAttribute('aria-disabled', 'true');
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
  opener = from;
  // Land on the first entry, the way a menu is expected to behave once it is
  // open — and the only way Escape, the arrows and Enter have anything to act on.
  menuItems()[0]?.focus();
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
