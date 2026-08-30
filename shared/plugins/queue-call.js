import { register } from './registry.js';
import { textScaleField } from '../text-scale.js';
import { colorOverrideDefaults, applyColorOverrides, themeColorSection } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';
import { remoteJsonFields } from '../remote-json-fields.js';
import { refreshIntervalMs } from '../refresh-field.js';
import { liveSource } from '../live-source.js';
import { offlineLiveOpts } from '../offline-data.js';
import { prefersReducedMotion } from '../animations.js';

// Queue / "Now serving" board — the waiting-room widget.
//
// One very large CALLED number plus the desk or room it is called to, and an
// optional strip of the numbers coming next. Practices, pharmacies, public
// offices, bakeries, service counters and tyre shops all run the same board;
// before this widget they had to fake it with a kpi-card (no call flash, no
// "next up" strip) or a data-table (no hero number at all).
//
// The number can be typed by hand (a receptionist edits the slide) or polled
// from the queue system's JSON endpoint — the SAME source/dataUrl/refreshSec
// trio every other data widget uses, so it inherits offline provisioning too.

const LAYOUTS = { hero: 'hero', split: 'split', board: 'board' };

// Accepted remote shapes — deliberately forgiving, because queue systems all
// name their fields differently and a signage widget must never be the reason
// an integration needs a proxy in front of it:
//   { current: { number, counter }, upcoming: [{ number, counter }] }
//   { now: "A-042", next: ["A-043", "A-044"] }
//   [ { number, counter }, … ]     → first entry is current, the rest upcoming
//   "A-042"                        → a bare number
function normalizeEntry(v) {
  if (v == null) return null;
  // ONE emptiness rule for scalars and objects alike: a number that is blank
  // after trimming is not an entry. Without this, an endpoint answering `""`
  // between calls painted an empty hero box instead of the "—" placeholder.
  // A literal 0 survives, because a queue that resets to 0 means it.
  if (typeof v === 'string' || typeof v === 'number') {
    return String(v).trim() ? { number: String(v), counter: '', note: '' } : null;
  }
  if (typeof v !== 'object') return null;
  const number = v.number ?? v.ticket ?? v.no ?? v.id ?? v.value ?? v.name ?? '';
  const counter = v.counter ?? v.desk ?? v.room ?? v.station ?? v.window ?? v.location ?? '';
  const note = v.note ?? v.label ?? v.status ?? '';
  if (!String(number).trim()) return null;
  return { number: String(number), counter: String(counter ?? ''), note: String(note ?? '') };
}

export function normalizeQueue(raw) {
  if (Array.isArray(raw)) {
    const list = raw.map(normalizeEntry).filter(Boolean);
    return { current: list[0] ?? null, upcoming: list.slice(1) };
  }
  if (raw && typeof raw === 'object') {
    const cur = normalizeEntry(raw.current ?? raw.now ?? raw.serving ?? raw.nowServing ?? null);
    const rest = raw.upcoming ?? raw.next ?? raw.queue ?? raw.waiting ?? [];
    const upcoming = (Array.isArray(rest) ? rest : []).map(normalizeEntry).filter(Boolean);
    if (cur || upcoming.length) return { current: cur, upcoming };
  }
  const one = normalizeEntry(raw);
  return { current: one, upcoming: [] };
}

// The call flash. Injected once per document (admin preview, fullscreen preview
// iframe, live player) — the same id-guard pattern text.js uses for its pulse.
function ensureKeyframes() {
  if (document.getElementById('bb-queue-kf')) return;
  const style = document.createElement('style');
  style.id = 'bb-queue-kf';
  style.textContent =
    '@keyframes bb-queue-call { 0%,100% { transform: scale(1); } 18% { transform: scale(1.06); } 40% { transform: scale(.99); } }'
    + '@keyframes bb-queue-flash { 0%,100% { opacity: 1; } 25%,75% { opacity: .3; } }';
  document.head.appendChild(style);
}

export default register({
  type: 'queue-call',
  label: 'Queue / Now Serving',
  group: 'data',
  icon: '🎫',
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(),
    heading: 'Now serving',
    current: 'A-042',
    counter: 'Counter 3',
    upcomingHeading: 'Next up',
    upcoming: [
      { number: 'A-043', counter: 'Counter 1' },
      { number: 'A-044', counter: 'Counter 2' },
      { number: 'B-017', counter: 'Counter 4' },
    ],
    maxUpcoming: 4,
    layout: 'split',
    source: 'inline',
    dataUrl: '',
    refreshSec: 15,
    flashOnChange: true,
    waitLabel: '',
    waitMinutes: 0,
    footnote: '',
    textScale: 100,
    theme: 'medical-calm',
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'heading', type: 'text', label: 'Heading', placeholder: 'Now serving' },
      { type: 'row', children: [
        { key: 'current', type: 'text', label: 'Called number', placeholder: 'A-042',
          showIf: c => (c.source ?? 'inline') === 'inline' },
        { key: 'counter', type: 'text', label: 'Counter / room', placeholder: 'Counter 3',
          showIf: c => (c.source ?? 'inline') === 'inline' },
      ] },
      { key: 'upcomingHeading', type: 'text', label: 'Heading above the waiting list', placeholder: 'Next up',
        help: 'Leave empty to drop the small heading above the waiting numbers.' },
      { key: 'upcoming', type: 'table', label: 'Next numbers',
        showIf: c => (c.source ?? 'inline') === 'inline',
        columns: [
          { key: 'number',  label: 'Number', placeholder: 'A-043' },
          { key: 'counter', label: 'Counter / room', placeholder: 'Counter 1' },
          { key: 'note',    label: 'Note', placeholder: 'optional' },
        ] },

      { type: 'section', key: 'data', label: 'Data',
        summary: c => ((c.source ?? 'inline') === 'inline' ? 'Typed in' : 'Remote JSON') },
      ...remoteJsonFields({
        placeholder: 'https://queue.example.com/current.json',
        urlHelp: 'Returns { "current": { "number": "A-042", "counter": "3" }, "upcoming": [ … ] }, '
          + 'or { "now": "A-042", "next": ["A-043"] }, or a plain array whose first entry is the called number.',
      }),

      { type: 'section', key: 'sec-layout', label: 'Layout',
        summary: c => c.layout ?? 'split' },
      { key: 'layout', type: 'select', label: 'Arrangement', buttons: true, options: [
        { value: 'hero',  label: 'Hero' },
        { value: 'split', label: 'Split' },
        { value: 'board', label: 'Board' },
      ], help: 'Hero: the called number alone, as big as the tile allows. Split: called number beside the waiting list. Board: the call on top, an equal-weight grid of waiting numbers underneath.' },
      { key: 'maxUpcoming', type: 'number', label: 'Waiting numbers shown', min: 0, max: 12, step: 1,
        showIf: c => (c.layout ?? 'split') !== 'hero' },

      { type: 'section', key: 'behavior', label: 'Behavior',
        summary: c => [c.flashOnChange && 'flash', (Number(c.waitMinutes) || 0) > 0 && 'wait time'].filter(Boolean).join(' · ') || 'plain' },
      { key: 'flashOnChange', type: 'toggle', label: 'Flash when the number changes',
        help: 'A short scale-and-flash on the called number so a waiting room notices the call. Skipped when the display prefers reduced motion.' },
      { type: 'row', children: [
        { key: 'waitLabel', type: 'text', label: 'Wait-time label', placeholder: 'Current wait', tier: 'advanced' },
        { key: 'waitMinutes', type: 'number', label: 'Minutes (0 = hidden)', min: 0, max: 600, step: 1, suffix: ' min', tier: 'advanced' },
      ] },
      { key: 'footnote', type: 'text', label: 'Footnote', tier: 'advanced',
        placeholder: 'Please keep your ticket ready' },

      { type: 'section', key: 'appearance', label: 'Appearance',
        summary: c => `${c.textScale ?? 100}%` },
      { ...textScaleField(), tier: 'advanced' },

      ...themeColorSection(),
    ],
  }),
  looks: () => [
    { id: 'waiting-room', name: 'Waiting room', patch: { layout: 'split', maxUpcoming: 4, flashOnChange: true, theme: 'medical-calm' } },
    { id: 'single-call', name: 'Single call', patch: { layout: 'hero', flashOnChange: true, textScale: 130 } },
    { id: 'counter-board', name: 'Counter board', patch: { layout: 'board', maxUpcoming: 6, flashOnChange: false, theme: 'corporate-blue' } },
    { id: 'shop-counter', name: 'Shop counter', patch: { layout: 'hero', flashOnChange: true, theme: 'bistro-warm' } },
    { id: 'with-wait', name: 'With wait time', patch: { layout: 'split', waitLabel: 'Current wait', waitMinutes: 12, maxUpcoming: 3 } },
  ],
  render(slide, container, ctx = {}) {
    const c = slide.content ?? {};
    const layout = LAYOUTS[c.layout] ?? 'split';
    const reduced = prefersReducedMotion();

    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-queue bb-theme-${c.theme ?? 'medical-calm'}`;
    root.style.cssText += 'container-type:size;width:100%;height:100%;background:transparent;'
      + 'display:flex;flex-direction:column;gap:clamp(6px,1.6cqmin,20px);padding:clamp(8px,2.4cqmin,32px);box-sizing:border-box;';
    root.style.setProperty('--bb-q-scale', String((Number(c.textScale) || 100) / 100));

    // Every size is cq-derived and multiplied by the widget's text scale, so the
    // same widget reads correctly in a quarter-tile and on a 4K portrait screen.
    //
    // The called number is the exception: its size also depends on how many
    // characters it has. A fixed 20cqw is right for "42" and wraps "B-014" onto
    // two lines, which is precisely the failure a call board cannot have. The
    // width budget is ~0.62em per glyph for the bold display face, so the
    // widest that fits N glyphs across the hero column is about 155/N cqw —
    // capped so a two-digit number does not become absurd. Recomputed on every
    // paint, because in remote mode the length changes with the data.
    //
    // The budget is a share of the WIDGET, but the number only gets the hero
    // COLUMN of it: in the split layout that is roughly 57 % (flex 1.35 against
    // 1, minus the gap), in board it is the full width. Measuring against the
    // whole widget let "M-AB 1234" ask for more width than its column had, and
    // a nowrap plate was clipped mid-registration on a workshop board.
    const heroShare = layout === 'split' ? 0.55 : 1;
    const numWidthCq = (text) => Math.min(layout === 'hero' ? 26 : 20,
      (155 * heroShare) / Math.max(2, String(text ?? '').length));
    const numFont = (text) => `calc(min(${numWidthCq(text).toFixed(1)}cqw, ${layout === 'board' ? 22 : 40}cqh) * var(--bb-q-scale, 1))`;
    // The secondary sizes are cq-HEIGHT dominated on purpose. The hero number
    // already claims most of the box; a supporting line sized off the WIDTH
    // (4.4cqw on a 16:9 tile is 8 % of the height) grew until the waiting rows
    // and the footnote had nothing left and were sliced off at the edge.
    const subFont = 'calc(min(3cqw, 5.4cqh) * var(--bb-q-scale, 1))';
    const headFont = 'calc(min(2.6cqw, 4.6cqh) * var(--bb-q-scale, 1))';
    const footFont = 'calc(min(2.4cqw, 4cqh) * var(--bb-q-scale, 1))';
    const listFont = `calc(min(${layout === 'board' ? 3.2 : 4}cqw, ${layout === 'board' ? 5.5 : 7}cqh) * var(--bb-q-scale, 1))`;

    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1" style="margin:0;">${escapeHtml(slide.title)}</h1>` : ''}
      <div class="bb-q-main" style="flex:1;min-height:0;display:flex;gap:clamp(8px,2.6cqmin,36px);align-items:stretch;">
        <section class="bb-q-now" data-field="heading current counter layout textScale"
                 style="flex:${layout === 'split' ? '1.35' : '1'};min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:.08em;
                        border-radius:clamp(10px,2.4cqmin,28px);background:color-mix(in srgb, var(--bb-st-accent) 10%, transparent);padding:clamp(6px,2cqmin,28px);">
          <div class="bb-q-heading" style="font:600 ${headFont}/1.2 var(--bb-st-font,Inter,system-ui,sans-serif);letter-spacing:.08em;text-transform:uppercase;opacity:.75;"></div>
          <div class="bb-q-number" style="font:800 ${numFont('00000')}/1 var(--bb-display,'Inter Tight',Inter,sans-serif);color:var(--bb-st-accent);letter-spacing:-.02em;white-space:nowrap;max-width:100%;"></div>
          <div class="bb-q-counter" style="font:700 ${subFont}/1.25 var(--bb-st-font,Inter,system-ui,sans-serif);opacity:.9;"></div>
          <div class="bb-q-wait" style="font:500 ${subFont}/1.3 var(--bb-st-font,Inter,system-ui,sans-serif);opacity:.65;margin-top:.35em;"></div>
        </section>
        <aside class="bb-q-next" data-field="upcoming upcomingHeading maxUpcoming"
               style="flex:1;min-width:0;min-height:0;overflow:hidden;display:${layout === 'hero' ? 'none' : 'flex'};flex-direction:column;gap:clamp(4px,1cqmin,12px);justify-content:center;"></aside>
      </div>
      <div class="bb-q-foot" style="flex:0 0 auto;font:500 ${footFont}/1.35 var(--bb-st-font,Inter,system-ui,sans-serif);opacity:.6;text-align:center;"></div>`;

    const headEl = root.querySelector('.bb-q-heading');
    const numEl = root.querySelector('.bb-q-number');
    const cntEl = root.querySelector('.bb-q-counter');
    const waitEl = root.querySelector('.bb-q-wait');
    const nextEl = root.querySelector('.bb-q-next');
    const footEl = root.querySelector('.bb-q-foot');

    if (layout === 'board') {
      root.querySelector('.bb-q-main').style.flexDirection = 'column';
      root.querySelector('.bb-q-now').style.flex = '0 0 auto';
      nextEl.style.flex = '1';
    }

    headEl.textContent = c.heading ?? '';
    headEl.style.display = c.heading ? '' : 'none';
    footEl.textContent = c.footnote ?? '';
    footEl.style.display = c.footnote ? '' : 'none';

    const waitMin = Math.max(0, Number(c.waitMinutes) || 0);
    if (waitMin > 0) waitEl.textContent = `${String(c.waitLabel ?? '').trim() || '⏱'} ${waitMin} min`;
    else waitEl.style.display = 'none';

    let lastNumber = null;
    const paint = (queue) => {
      const cur = queue.current;
      const number = cur?.number ?? '—';
      numEl.textContent = number;
      numEl.style.fontSize = numFont(number);
      cntEl.textContent = cur?.counter ?? '';
      cntEl.style.display = cur?.counter ? '' : 'none';

      // Flash only on a real CHANGE, never on the first paint — a board that
      // flashes the moment a slide appears trains the room to ignore it.
      if (c.flashOnChange && !reduced && lastNumber !== null && lastNumber !== number) {
        ensureKeyframes();
        numEl.style.animation = 'none';
        void numEl.offsetWidth;   // force a reflow so the animation replays
        numEl.style.animation = 'bb-queue-call 1.1s ease-out 2, bb-queue-flash 1.1s ease-in-out 2';
      }
      lastNumber = number;

      // Number('') is 0, not NaN, so a cleared field must fall back explicitly —
      // `Number(x) ?? 4` would never fire, which is what eslint caught here.
      const raw = Number.isFinite(+c.maxUpcoming) ? +c.maxUpcoming : 4;
      const cap = layout === 'hero' ? 0 : Math.max(0, Math.min(12, raw));
      nextEl.replaceChildren();
      if (!cap) return;
      if (c.upcomingHeading) {
        const h = document.createElement('div');
        h.style.cssText = `font:600 ${headFont}/1.2 var(--bb-st-font,Inter,system-ui,sans-serif);letter-spacing:.08em;text-transform:uppercase;opacity:.6;`;
        h.textContent = c.upcomingHeading;
        nextEl.appendChild(h);
      }
      const list = queue.upcoming.slice(0, cap);
      if (!list.length) {
        const empty = document.createElement('div');
        empty.style.cssText = `font:500 ${subFont}/1.3 var(--bb-st-font,Inter,system-ui,sans-serif);opacity:.5;`;
        empty.textContent = '—';
        nextEl.appendChild(empty);
        return;
      }
      const grid = document.createElement('div');
      // `grid-auto-rows: minmax(0, 1fr)` is what keeps a board honest: rows
      // SHARE the height that is left instead of each taking its natural size
      // and the last one being sliced in half by the footnote below.
      grid.style.cssText = layout === 'board'
        ? 'display:grid;grid-template-columns:repeat(auto-fit,minmax(28%,1fr));'
          + 'grid-auto-rows:minmax(0,1fr);align-content:stretch;gap:clamp(4px,1cqmin,14px);flex:1;min-height:0;overflow:hidden;'
        : 'display:flex;flex-direction:column;gap:clamp(4px,1cqmin,12px);min-height:0;overflow:hidden;';
      for (const e of list) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:baseline;justify-content:space-between;gap:.6em;'
          + 'border-radius:clamp(8px,1.6cqmin,16px);padding:clamp(4px,1.2cqmin,16px) clamp(6px,1.8cqmin,20px);'
          + 'background:color-mix(in srgb, currentColor 8%, transparent);';
        const n = document.createElement('span');
        n.style.cssText = `flex:0 0 auto;white-space:nowrap;font:700 ${listFont}/1.15 var(--bb-display,'Inter Tight',Inter,sans-serif);`;
        n.textContent = e.number;
        const d = document.createElement('span');
        d.style.cssText = `flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`
          + `font:500 ${subFont}/1.2 var(--bb-st-font,Inter,system-ui,sans-serif);opacity:.7;text-align:right;`;
        d.textContent = [e.counter, e.note].filter(Boolean).join(' · ');
        row.append(n, d);
        grid.appendChild(row);
      }
      nextEl.appendChild(grid);
    };

    const inlineQueue = () => ({
      current: String(c.current ?? '').trim()
        ? { number: String(c.current), counter: String(c.counter ?? ''), note: '' }
        : null,
      upcoming: (Array.isArray(c.upcoming) ? c.upcoming : []).map(normalizeEntry).filter(Boolean),
    });

    // Paint the typed-in values first in EVERY mode, so the tile is never blank
    // while the first request is in flight (and stays readable if it fails).
    paint(inlineQueue());

    const source = c.source ?? 'inline';
    if (source === 'inline') {
      container.appendChild(root);
      return composeDispose(() => root.remove());
    }
    const stop = liveSource({
      url: String(c.dataUrl ?? '').trim(),
      signal: ctx.signal,
      intervalMs: source === 'url' ? refreshIntervalMs(c.refreshSec) : 0,
      ...offlineLiveOpts(c),
      onData: data => paint(normalizeQueue(data)),
      onError: (e, info) => { if (info?.gaveUp) ctx.onError?.(e); },
    });
    container.appendChild(root);
    return composeDispose(() => { stop(); root.remove(); });
  },
});
