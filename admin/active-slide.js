// Which slide the editor is currently editing.
//
// One function, because there are three surfaces that have to agree on the
// answer — the canvas, the inspector and the Layers panel each had their own
// copy, and the moment "the slide you are editing" stopped being "the slide the
// rail has selected" they would have started disagreeing.
//
// That moment is the slide master: while `ui.editingMaster` is on, the canvas
// edits `playlist.master`, which is a Slide-shaped object precisely so every one
// of those surfaces keeps working without learning what a master is.

import { state } from './store.js';
import { ensureMaster } from '../shared/slide-schema.js';

export function isEditingMaster() {
  return !!state.ui?.editingMaster;
}

export function activeSlide() {
  const pl = state.playlist;
  if (!pl) return null;
  if (isEditingMaster()) return ensureMaster(pl);
  return pl.slides.find(s => s.id === state.ui.activeSlideId) ?? pl.slides[0] ?? null;
}

// There is deliberately no `activeDeckSlide()` here. The one place that would
// have needed it — the per-slide settings strip — refuses to render at all while
// the master is being edited, because a duration or a schedule on the master is
// a control that looks like it does something and does not.
