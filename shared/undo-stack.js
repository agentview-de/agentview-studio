// The undo/redo stack, extracted from the store so it can be reasoned about.
//
// It used to live inline in admin/store.js as an array plus a cursor, and three
// defects hid in that handful of lines:
//
//   1. `commit()` is DEBOUNCED by 250 ms, but `undo()` was not. Press ctrl+Z
//      within a quarter second of an edit — which is exactly what "oh no, undo
//      that" looks like — and the edit had not been pushed yet: the cursor
//      stepped back past the PREVIOUS entry, so one keystroke reverted two
//      actions and the newest edit was lost for good (redo could not reach it,
//      because it had never been recorded). The store now flushes a pending
//      commit before it moves the cursor; the stack itself stays synchronous.
//   2. Nothing seeded a baseline, so `canUndo()` (cursor > 0) was false until
//      the SECOND commit — the first edit after opening the app could not be
//      undone at all. The store now pushes a baseline on hydrate.
//   3. The cap dropped the oldest entry with `shift()` and then recomputed the
//      cursor as `length - 1`, which is only correct while the cursor sits at
//      the end. `push()` here truncates the redo tail first, so it always does
//      — but the cursor is now decremented explicitly rather than by luck.
//
// A snapshot is an opaque value to this module (the store passes JSON strings).
// Equality is `===`, so callers must pass something comparable.

/**
 * @param {{ limit?: number }} [opts]  `limit` caps retained entries (default 50).
 */
export function createUndoStack({ limit = 50 } = {}) {
  const max = Math.max(1, Math.floor(limit) || 1);
  /** @type {{ snapshot: any, reason: string, at: number }[]} */
  const entries = [];
  let idx = -1;

  return {
    /**
     * Record a snapshot. Truncates any redo tail first, so a new edit after an
     * undo forks history the way every editor does.
     * @returns {boolean} false when the snapshot equals the current entry —
     *   a commit that changed nothing must not cost the user a redo step.
     */
    push(snapshot, reason = '', at = 0) {
      if (entries.length && entries[idx]?.snapshot === snapshot) return false;
      entries.splice(idx + 1);
      entries.push({ snapshot, reason, at });
      while (entries.length > max) entries.shift();
      idx = entries.length - 1;
      return true;
    },

    /** @returns {any|null} the snapshot to restore, or null at the oldest entry. */
    undo() {
      if (idx <= 0) return null;
      idx -= 1;
      return entries[idx].snapshot;
    },

    /** @returns {any|null} the snapshot to restore, or null at the newest entry. */
    redo() {
      if (idx >= entries.length - 1) return null;
      idx += 1;
      return entries[idx].snapshot;
    },

    canUndo: () => idx > 0,
    canRedo: () => idx < entries.length - 1,
    size: () => entries.length,
    index: () => idx,
    /** The snapshot the stack currently sits on (null when empty). */
    current: () => (idx >= 0 ? entries[idx].snapshot : null),
    /** Reasons oldest→newest — for a history panel, and for debugging. */
    reasons: () => entries.map(e => e.reason),

    clear() { entries.length = 0; idx = -1; },
  };
}
