// Editor view — the 3-column Keynote-style shell.
//   left   : slide rail (drag-sortable)
//   center : zoomable canvas
//   right  : slide-settings strip + (Library when nothing selected / Inspector when a widget is)

import { state, subscribe, on } from '../store.js';
import { mountSlideRail } from '../panels/slide-rail.js';
import { mountLayers } from '../panels/layers.js';
import { mountCanvas, selectionGroupState, duplicateSelected, deleteSelected, bringToFront, sendToBack, editSelectedText } from '../canvas/canvas.js';
import { mountLibrary } from '../panels/library.js';
import { mountSlideSettings, renderWidgetInspector } from '../panels/inspector.js';
import { renderArrangePanel } from '../panels/arrange-panel.js';
import { t } from '../i18n.js';
import { uiIconSvg } from '../../shared/data/ui-icons.js';
import { activeSlide } from '../active-slide.js';

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
    <button class="avs-col-toggle" id="avs-right-toggle" type="button"></button>
    <!-- Phone shell. Hidden above the breakpoint, so the desktop three-column
         layout is untouched. Below it the two side columns become sheets that
         slide up over the canvas, and this bar is how you reach them: three
         columns do not fit on a 375px screen, but they are all still needed. -->
    <div class="avs-m-scrim" id="avs-m-scrim" hidden></div>
    <!-- Selection bar, the way Keynote and PowerPoint put an object's common
         actions within thumb reach instead of behind a panel. Appears over the
         tab bar while something is selected and no sheet is covering the
         canvas; the actions themselves are the ones the right-click menu has
         always had. -->
    <div class="avs-m-ctxbar" id="avs-m-ctxbar" hidden>
      <button type="button" class="avs-m-ctxbtn avs-m-ctxtext" data-ctx="text" title="${t('m.editText')}" aria-label="${t('m.editText')}" hidden>${uiIconSvg('type', 17)}</button>
      <button type="button" class="avs-m-ctxbtn" data-ctx="edit">${uiIconSvg('sliders', 17)}<span>${t('m.edit')}</span></button>
      <button type="button" class="avs-m-ctxbtn" data-ctx="dup" title="${t('ctx.duplicate')}" aria-label="${t('ctx.duplicate')}">${uiIconSvg('copy', 17)}</button>
      <button type="button" class="avs-m-ctxbtn" data-ctx="front" title="${t('ctx.toFront')}" aria-label="${t('ctx.toFront')}">▲</button>
      <button type="button" class="avs-m-ctxbtn" data-ctx="back" title="${t('ctx.toBack')}" aria-label="${t('ctx.toBack')}">▼</button>
      <button type="button" class="avs-m-ctxbtn avs-m-ctxdel" data-ctx="del" title="${t('ctx.delete')}" aria-label="${t('ctx.delete')}">${uiIconSvg('trash', 17)}</button>
    </div>
    <nav class="avs-m-bar" id="avs-m-bar" aria-label="${t('m.navLabel')}">
      <button type="button" class="avs-m-tab" data-m-panel="rail">
        ${uiIconSvg('layers', 18)}<span>${t('m.slides')}</span>
      </button>
      <button type="button" class="avs-m-tab" data-m-panel="">
        ${uiIconSvg('brush', 18)}<span>${t('m.design')}</span>
      </button>
      <button type="button" class="avs-m-tab" data-m-panel="right">
        ${uiIconSvg('sliders', 18)}<span id="avs-m-right-label">${t('m.widgets')}</span>
      </button>
    </nav>`;

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

  mountMobileShell(host, swap);

  // Fit the canvas after layout settles.
  requestAnimationFrame(() => canvasApi.zoomToFit());
  return canvasApi;
}

// Phone shell: which of the two side columns is currently covering the canvas.
// Deliberately NOT in state.ui — that object is persisted, and reopening the
// Studio with a sheet already over the canvas would look like a broken layout
// rather than a restored one. '' means neither: the canvas has the screen.
function mountMobileShell(host, swap) {
  let openPanel = '';
  const bar = host.querySelector('#avs-m-bar');
  const scrim = host.querySelector('#avs-m-scrim');
  const rightLabel = host.querySelector('#avs-m-right-label');

  const ctxbar = host.querySelector('#avs-m-ctxbar');

  // Selection bar: only with a selection, and only while the canvas is
  // actually visible — a bar acting on the thing behind an open sheet would be
  // pointing at something nobody can see.
  const textBtn = ctxbar.querySelector('[data-ctx="text"]');
  const reflectCtxBar = () => {
    const has = !!state.ui.selectedWidgetId || (state.ui.selectedWidgetIds?.length ?? 0) > 0;
    ctxbar.hidden = !has || !!openPanel;
    // The text button only makes sense for a single text widget — which is
    // also the only case editSelectedText() acts on.
    const id = state.ui.selectedWidgetId;
    const w = id ? activeSlide()?.widgets.find(x => x.id === id) : null;
    textBtn.hidden = w?.type !== 'text';
  };

  // What the right sheet holds depends on the selection, so the tab that opens
  // it says which of the three panels is behind it. swapRight() has already run
  // by the time this fires — it writes the mode class onto the same element.
  const reflectRightLabel = () => {
    const key = swap.classList.contains('avs-inspector') ? 'm.object'
      : swap.classList.contains('avs-arrange-panel') ? 'm.arrange' : 'm.widgets';
    rightLabel.textContent = t(key);
  };

  const reflect = () => {
    host.classList.toggle('avs-m-rail-open', openPanel === 'rail');
    host.classList.toggle('avs-m-right-open', openPanel === 'right');
    scrim.hidden = !openPanel;
    bar.querySelectorAll('[data-m-panel]').forEach(b =>
      b.classList.toggle('avs-on', (b.dataset.mPanel ?? '') === openPanel));
    // Opening a sheet hides the selection bar and closing one brings it back,
    // so the two are always decided together.
    reflectCtxBar();
    // The canvas just changed size (a sheet covers part of it, or gave it
    // back), so the slide has to be re-fitted or it sits half off-screen.
    requestAnimationFrame(() => canvasApi?.zoomToFit());
  };

  const setPanel = (next) => { openPanel = openPanel === next ? '' : next; reflect(); };
  bar.addEventListener('click', e => {
    const btn = e.target.closest('[data-m-panel]');
    if (btn) setPanel(btn.dataset.mPanel ?? '');
  });
  // Tapping the dimmed canvas closes the sheet — the gesture everyone tries
  // first, and the only one available while a sheet covers the toolbar.
  scrim.addEventListener('click', () => { openPanel = ''; reflect(); });

  // Picking a widget out of the library adds it to the slide behind the sheet.
  // Stepping aside is the point: the whole reason to tap that tile was to see
  // the thing land, and it is selected, so the panel this reveals is already
  // its inspector.
  on('widget.added', () => { if (openPanel) { openPanel = ''; reflect(); } });
  // Same courtesy for the slide rail: an explicit pick reveals the slide.
  on('slide.picked', () => { if (openPanel === 'rail') { openPanel = ''; reflect(); } });

  ctxbar.addEventListener('click', e => {
    const act = e.target.closest('[data-ctx]')?.dataset.ctx;
    if (!act) return;
    // "Edit" is the one that opens a panel; the rest act in place, so the
    // canvas stays visible and you can see what happened.
    if (act === 'edit') { openPanel = 'right'; reflect(); return; }
    if (act === 'text') { editSelectedText(); return; }
    if (act === 'dup') duplicateSelected();
    else if (act === 'front') bringToFront();
    else if (act === 'back') sendToBack();
    else if (act === 'del') deleteSelected();
  });

  subscribe('ui', p => {
    if (p !== 'ui.selectedWidgetId' && p !== 'ui.selectedWidgetIds') return;
    reflectRightLabel();
    reflectCtxBar();
  });

  reflectRightLabel();
  reflect();
}

export function getCanvasApi() { return canvasApi; }
