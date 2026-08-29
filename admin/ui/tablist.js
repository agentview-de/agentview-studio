// A row of buttons that switches what fills the page is a TABLIST.
//
// The app has two of them — the three views in the header, and the nine tabs of
// the Verwaltung console — and both marked the active one with nothing but a
// CSS class. A screen reader heard nine identically-shaped buttons and had no
// way to tell which section it was already in; the answer was on screen, in a
// background colour.
//
// It also fixes the keyboard shape. A tablist is ONE tab stop: you arrive on
// the current tab, walk the others with the arrow keys, and Tab moves on into
// the panel. Nine separate tab stops in front of every panel is what the plain
// buttons gave, which is why the pattern exists.
//
// wire() is called once per row; setActive() is called by the existing switch
// function, so the visual class toggle and the announced state cannot drift.

/**
 * @param {Element} container   the row of buttons
 * @param {object}  opts
 * @param {string}  opts.itemSelector  which children are tabs
 * @param {(btn: Element) => string} opts.idOf   the value a tab stands for
 * @param {(id: string) => void}     opts.onPick called when a tab is chosen
 * @param {(id: string) => Element|null} [opts.panelOf] the panel a tab controls
 * @param {string}  [opts.label]  accessible name for the row
 */
export function wireTablist(container, { itemSelector, idOf, onPick, panelOf, label }) {
  if (!container) return { setActive: () => {} };
  const items = () => [...container.querySelectorAll(itemSelector)];
  container.setAttribute('role', 'tablist');
  if (label) container.setAttribute('aria-label', label);

  let seq = 0;
  for (const b of items()) {
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', 'false');
    b.tabIndex = -1;
    if (!b.id) b.id = `avs-tab-${(container.id || 'x')}-${seq++}`;
    const panel = panelOf?.(idOf(b));
    if (panel) {
      if (!panel.id) panel.id = `${b.id}-panel`;
      b.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
    }
  }

  container.addEventListener('keydown', (e) => {
    const list = items().filter(b => !b.disabled && b.offsetParent !== null);
    if (!list.length) return;
    const at = list.indexOf(document.activeElement);
    const go = (i) => {
      e.preventDefault();
      const next = list[(i + list.length) % list.length];
      next.focus();
      onPick(idOf(next));
    };
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(at < 0 ? 0 : at + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(at < 0 ? list.length - 1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
  });

  const setActive = (id) => {
    for (const b of items()) {
      const on = idOf(b) === id;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      // Roving tabindex: the row is one stop, and it is the current tab.
      b.tabIndex = on ? 0 : -1;
      const panel = panelOf?.(idOf(b));
      if (panel && on) panel.setAttribute('aria-labelledby', b.id);
    }
  };
  return { setActive };
}
