// Drag-drop helpers: reorderable lists + drop-target upload zones.

export function makeReorderable(host, { onMove, dragSelector = '.bb-card' }) {
  let draggingEl = null;
  // Where the card sat before the drag started, and whether the drag ended on
  // THIS list. Dropping anywhere else must not leave the list showing an order
  // nobody committed — and it did: the whole window is a drop target (see
  // makeDropZone below), so releasing a slide over the canvas ended the drag
  // without ever reaching this handler, while dragover had already moved the
  // card. The rail then showed one order and the playlist held another until
  // something happened to repaint it.
  let origNext = null;
  let dropped = false;
  host.addEventListener('dragstart', e => {
    const card = e.target.closest(dragSelector);
    if (!card) return;
    draggingEl = card;
    origNext = card.nextElementSibling;
    dropped = false;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.id ?? '');
    card.classList.add('bb-dragging');
  });
  host.addEventListener('dragend', () => {
    if (draggingEl && !dropped) {
      // Cancelled. Only the dragged card ever moved, so putting it back before
      // the sibling it started in front of restores the original order exactly.
      if (origNext && origNext.parentElement === host) host.insertBefore(draggingEl, origNext);
      else if (!origNext) host.appendChild(draggingEl);
    }
    draggingEl?.classList.remove('bb-dragging');
    draggingEl = null;
    origNext = null;
  });
  host.addEventListener('dragover', e => {
    if (!draggingEl) return;
    e.preventDefault();
    const after = getInsertAfter(host, e.clientX, e.clientY, dragSelector);
    if (after === null) host.appendChild(draggingEl);
    else if (after !== draggingEl && after?.parentElement === host) {
      host.insertBefore(draggingEl, after);
    }
  });
  host.addEventListener('drop', e => {
    if (!draggingEl) return;
    e.preventDefault();
    dropped = true;
    const ids = [...host.querySelectorAll(dragSelector)].map(el => el.dataset.id);
    onMove?.(ids);
  });
}

function getInsertAfter(host, x, y, sel) {
  // Only cards the user can SEE take part. The slide rail hides filtered-out
  // cards with `hidden` (display:none), and a display:none element reports a
  // 0×0 box at 0,0 — so its "centre" is the top-left corner of the window and
  // it entered the nearest-centre contest from there. Drag a card towards that
  // corner while a filter is on and it was inserted next to a card that is not
  // on screen at all: an order nobody chose. (offsetParent === null is the same
  // is-it-rendered test ui/modal.js uses for its focus ring.)
  const cards = [...host.querySelectorAll(`${sel}:not(.bb-dragging)`)]
    .filter(el => el.offsetParent !== null);
  let closest = null;
  let closestDist = Infinity;
  for (const card of cards) {
    const r = card.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = Math.hypot(cx - x, cy - y);
    if (d < closestDist) {
      closestDist = d;
      // Insert before card if cursor is above-or-left of center.
      closest = (y < cy || (Math.abs(y - cy) < 8 && x < cx)) ? card : card.nextSibling;
    }
  }
  return closest;
}

// Generic drop zone that calls back with File[] and/or strings.
//
// The editor's zone is the WHOLE WINDOW (main.js), so it sees every internal
// drag too — and three separate decisions were collapsed into one:
//
//   what to HIGHLIGHT   only a real incoming payload: files, or a link dragged
//                       from another tab. Reordering a slide used to put a 2px
//                       accent frame around the entire editor.
//   what to ACCEPT      also plain text, because a URL dragged out of a text
//                       editor arrives as text/plain and nothing else — the
//                       drop has to be allowed before its value can be read.
//   when to UN-HIGHLIGHT only when the pointer actually left. dragleave BUBBLES
//                       from descendants, so crossing from one child to the
//                       next fired it on the zone itself and the affordance
//                       flickered off and on all the way across the editor.
export function makeDropZone(el, onDrop, { filesOnly = false } = {}) {
  const types = (dt) => [...(dt?.types ?? [])];
  const showsAffordance = (dt) => types(dt).includes('Files')
    || (!filesOnly && types(dt).includes('text/uri-list'));
  const acceptable = (dt) => showsAffordance(dt) || (!filesOnly && types(dt).includes('text/plain'));
  const off = () => el.classList.remove('bb-drop-hover');

  el.addEventListener('dragenter', e => {
    if (!acceptable(e.dataTransfer)) return;
    e.preventDefault();
    if (showsAffordance(e.dataTransfer)) el.classList.add('bb-drop-hover');
  });
  el.addEventListener('dragover', e => { if (acceptable(e.dataTransfer)) e.preventDefault(); });
  el.addEventListener('dragleave', e => {
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;
    off();
  });
  el.addEventListener('drop', async e => {
    if (!acceptable(e.dataTransfer)) { off(); return; }
    e.preventDefault();
    off();
    const files = [...(e.dataTransfer?.files ?? [])];
    const text = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain');
    onDrop({ files, text });
  });
}
