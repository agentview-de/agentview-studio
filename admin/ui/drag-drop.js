// Drag-drop helpers: reorderable lists + drop-target upload zones.

export function makeReorderable(host, { onMove, dragSelector = '.bb-card' }) {
  let draggingEl = null;
  host.addEventListener('dragstart', e => {
    const card = e.target.closest(dragSelector);
    if (!card) return;
    draggingEl = card;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.id ?? '');
    card.classList.add('bb-dragging');
  });
  host.addEventListener('dragend', () => {
    draggingEl?.classList.remove('bb-dragging');
    draggingEl = null;
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
    const ids = [...host.querySelectorAll(dragSelector)].map(el => el.dataset.id);
    onMove?.(ids);
  });
}

function getInsertAfter(host, x, y, sel) {
  const cards = [...host.querySelectorAll(`${sel}:not(.bb-dragging)`)];
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
export function makeDropZone(el, onDrop) {
  el.addEventListener('dragenter', e => { e.preventDefault(); el.classList.add('bb-drop-hover'); });
  el.addEventListener('dragover',  e => { e.preventDefault(); });
  el.addEventListener('dragleave', () => el.classList.remove('bb-drop-hover'));
  el.addEventListener('drop', async e => {
    e.preventDefault(); el.classList.remove('bb-drop-hover');
    const files = [...(e.dataTransfer?.files ?? [])];
    const text = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain');
    onDrop({ files, text });
  });
}
