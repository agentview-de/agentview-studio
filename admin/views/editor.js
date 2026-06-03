// Editor view — the 3-column Keynote-style shell.
//   left   : slide rail (drag-sortable)
//   center : zoomable canvas
//   right  : slide-settings strip + (Library when nothing selected / Inspector when a widget is)

import { state, subscribe } from '../store.js';
import { mountSlideRail } from '../panels/slide-rail.js';
import { mountCanvas } from '../canvas/canvas.js';
import { mountLibrary } from '../panels/library.js';
import { mountSlideSettings, renderWidgetInspector } from '../panels/inspector.js';

let canvasApi = null;

export function mountEditor(host) {
  host.classList.add('avs-editor');
  host.innerHTML = `
    <aside class="avs-col avs-col-rail" id="avs-rail"></aside>
    <section class="avs-col avs-col-canvas" id="avs-canvas"></section>
    <aside class="avs-col avs-col-right">
      <div class="avs-right-section" id="avs-slide-settings"></div>
      <div class="avs-right-swap" id="avs-right-swap"></div>
    </aside>`;

  mountSlideRail(host.querySelector('#avs-rail'));
  canvasApi = mountCanvas(host.querySelector('#avs-canvas'));
  mountSlideSettings(host.querySelector('#avs-slide-settings'));

  const swap = host.querySelector('#avs-right-swap');
  const swapRight = () => {
    // Clear both mode classes so they don't accumulate across swaps. The
    // child mount fn (mountLibrary / renderWidgetInspector) adds back the one
    // it needs.
    swap.classList.remove('avs-inspector', 'avs-library');
    swap.replaceChildren();
    if (state.ui.selectedWidgetId) renderWidgetInspector(swap);
    else mountLibrary(swap);
  };
  subscribe('ui', p => { if (p === 'ui.selectedWidgetId') swapRight(); });
  swapRight();

  // Fit the canvas after layout settles.
  requestAnimationFrame(() => canvasApi.zoomToFit());
  return canvasApi;
}

export function getCanvasApi() { return canvasApi; }
