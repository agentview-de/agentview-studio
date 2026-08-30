// Editor view — the 3-column Keynote-style shell.
//   left   : slide rail (drag-sortable)
//   center : zoomable canvas
//   right  : slide-settings strip + (Library when nothing selected / Inspector when a widget is)

import { state, subscribe } from '../store.js';
import { mountSlideRail } from '../panels/slide-rail.js';
import { mountLayers } from '../panels/layers.js';
import { mountCanvas, selectionGroupState } from '../canvas/canvas.js';
import { mountLibrary } from '../panels/library.js';
import { mountSlideSettings, renderWidgetInspector } from '../panels/inspector.js';
import { renderArrangePanel } from '../panels/arrange-panel.js';
import { t } from '../i18n.js';

let canvasApi = null;

export function mountEditor(host) {
  host.classList.add('avs-editor');
  host.innerHTML = `
    <aside class="avs-col avs-col-rail">
      <div class="avs-rail-slot" id="avs-rail"></div>
      <div class="avs-layers-slot" id="avs-layers"></div>
    </aside>
    <section class="avs-col avs-col-canvas" id="avs-canvas"></section>
    <aside class="avs-col avs-col-right">
      <div class="avs-right-section" id="avs-slide-settings"></div>
      <div class="avs-right-swap" id="avs-right-swap"></div>
    </aside>
    <button class="avs-col-toggle" id="avs-right-toggle" type="button"></button>`;

  mountSlideRail(host.querySelector('#avs-rail'));
  // Layers sits UNDER the slide rail, in the same column: both answer "what is
  // in this deck / on this slide", and the canvas needs every pixel it has.
  mountLayers(host.querySelector('#avs-layers'));
  canvasApi = mountCanvas(host.querySelector('#avs-canvas'));
  mountSlideSettings(host.querySelector('#avs-slide-settings'));

  const swap = host.querySelector('#avs-right-swap');
  // Three states, not two: nothing selected → Library, one widget → Inspector,
  // several → Arrange. The third is what makes multi-select discoverable —
  // align and distribute exist on the keyboard and in the context menu too, but
  // a feature only reachable by right-click is a feature most people never find.
  // A selection change writes TWO store fields (the set, then the primary), so
  // both notifications land here. Rebuilding on each would build the inspector
  // and then immediately throw it away for the library on every deselect — the
  // library is a 39-tile grid, so that is a visible flicker, not a micro-
  // optimisation. The key names what is actually on screen; equal key, no work.
  let renderedKey = null;
  const swapRight = () => {
    const count = state.ui.selectedWidgetIds?.length ?? 0;
    const primary = state.ui.selectedWidgetId;
    // The group state is part of the key: grouping a selection changes nothing
    // the count or the primary can see, but it does swap the panel's Group
    // button for Ungroup.
    const key = count > 1 ? `arrange:${count}:${primary}:${selectionGroupState()}`
      : primary ? `inspector:${primary}` : 'library';
    if (key === renderedKey) return;
    renderedKey = key;
    // Clear the mode classes so they don't accumulate across swaps. The child
    // mount fn adds back the one it needs.
    swap.classList.remove('avs-inspector', 'avs-library', 'avs-arrange-panel');
    swap.replaceChildren();
    if (count > 1) renderArrangePanel(swap);
    else if (primary) renderWidgetInspector(swap);
    else mountLibrary(swap);
  };
  subscribe('ui', p => {
    // Both paths matter: the primary changes when you click a different widget,
    // and the SET changes when you shift-click a second one without changing
    // which is primary — the exact moment the panel has to become Arrange.
    if (p === 'ui.selectedWidgetId' || p === 'ui.selectedWidgetIds') swapRight();
  });
  swapRight();

  // The right column is 332px of a three-column grid. On a 1024px window — or
  // at 125% browser zoom on a 1280px one — that leaves the canvas about 440px,
  // which is not enough to see a slide you are designing. `state.ui.inspectorOpen`
  // has been in the store the whole time, declared and never read; this is what
  // it was for.
  const toggle = host.querySelector('#avs-right-toggle');
  const reflectRight = () => {
    const open = state.ui.inspectorOpen !== false;
    host.classList.toggle('avs-right-collapsed', !open);
    toggle.textContent = open ? '›' : '‹';
    toggle.title = t(open ? 'insp.collapse' : 'insp.expand');
    toggle.setAttribute('aria-label', toggle.title);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-controls', 'avs-right-swap');
    // The canvas has more (or less) room now; keep the slide in view.
    requestAnimationFrame(() => canvasApi?.zoomToFit());
  };
  toggle.addEventListener('click', () => { state.ui.inspectorOpen = state.ui.inspectorOpen === false; });
  subscribe('ui', p => { if (p === 'ui.inspectorOpen') reflectRight(); });
  reflectRight();

  // Fit the canvas after layout settles.
  requestAnimationFrame(() => canvasApi.zoomToFit());
  return canvasApi;
}

export function getCanvasApi() { return canvasApi; }
