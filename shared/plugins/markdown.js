import { register } from './registry.js';
import { textScaleField } from '../text-scale.js';
import { themeColorSection, colorOverrideDefaults, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { liveSource } from '../live-source.js';
import { refreshSecField } from '../refresh-field.js';
import { sanitizeHtml } from '../sanitize-html.js';
import { escapeHtml } from '../utils/escape.js';

// marked.js is loaded as a CDN script in both host shells; we read it from
// window. marked 5+ dropped its built-in sanitizer, so we MUST pipe the
// rendered HTML through our whitelist sanitiser, otherwise an authored
// markdown body containing raw <script>, <iframe>, or <img onerror=…> would
// execute on the player. URL-sourced markdown goes through the SAME pipeline —
// remote content is even less trustworthy than authored content.
function md(src) {
  if (typeof window !== 'undefined' && window.marked?.parse) {
    const raw = window.marked.parse(src ?? '', { breaks: true, gfm: true });
    return sanitizeHtml(raw);
  }
  return `<pre>${escapeHtml(src ?? '')}</pre>`;
}

// Auto-scroll loop for overflowing content: pause at the top, glide to the
// bottom over `secs` seconds, pause, snap back to the top, repeat. rAF only
// runs during the glide (adaptive cadence — the pauses are plain timeouts),
// and the overflow is re-measured at every cycle start so content swaps
// (URL refresh) and box resizes are picked up without a ResizeObserver.
// Returns a stop() that cancels both the frame and the timer.
function startAutoScroll(viewport, inner, secs) {
  const PAUSE_MS = 3000;
  let raf = 0;
  let timer = 0;
  let stopped = false;
  const cycle = () => {
    if (stopped) return;
    const overflow = viewport.scrollHeight - viewport.clientHeight;
    if (overflow <= 4) {
      // Nothing to scroll right now — re-check later (the box may shrink or
      // a poll may swap in longer content).
      inner.style.transform = '';
      timer = setTimeout(cycle, 4000);
      return;
    }
    const durMs = Math.max(1, secs) * 1000;
    let t0 = 0;
    const step = (now) => {
      if (stopped) return;
      if (!t0) t0 = now;
      const p = Math.min(1, (now - t0) / durMs);
      inner.style.transform = `translateY(${(-overflow * p).toFixed(1)}px)`;
      if (p < 1) { raf = requestAnimationFrame(step); return; }
      // Reached the bottom: hold, then snap back and let cycle() take the
      // top pause before the next pass.
      timer = setTimeout(() => { inner.style.transform = ''; cycle(); }, PAUSE_MS);
    };
    timer = setTimeout(() => { raf = requestAnimationFrame(step); }, PAUSE_MS);
  };
  cycle();
  return () => { stopped = true; cancelAnimationFrame(raf); clearTimeout(timer); };
}

export default register({
  type: 'markdown',
  label: 'Markdown',
  group: 'basic',
  icon: '✍️',
  schemaVersion: 2,
  // v1 → v2: textScale used to be stored as a 0.6–2.0 multiplier; since the
  // percent control it is 80–400. Old decks are converted ONCE here (≤ 5 can
  // only be the multiplier form — a percent never goes below 80). The render()
  // guard stays as belt-and-braces for decks that bypass migration.
  migrate(content, fromVersion) {
    const c = { ...(content ?? {}) };
    if (fromVersion < 2) {
      const ts = Number(c.textScale);
      if (Number.isFinite(ts) && ts > 0 && ts <= 5) c.textScale = Math.round(ts * 100);
    }
    return c;
  },
  defaults: () => ({ ...colorOverrideDefaults(),
    body: '# Sprint highlights\n\n- **Atlas** went live in production\n- Network maintenance Friday 18:00–19:00\n- Cake in the kitchen at 15:00\n\n> Report display issues in #it-support.',
    sourceUrl: '',
    refreshSec: 0,
    theme: 'dark-minimal',
    textScale: 100,
    align: 'left',
    valign: 'middle',
    columns: '1',
    autoScroll: false,
    scrollSec: 30,
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'body', type: 'markdown', label: 'Markdown Content',
        placeholder: '# Heading\n\n- bullet\n\n**bold**, [links](https://…), > quotes',
        help: 'Supports headings, lists, bold/italic, links, quotes and GFM tables.' },

      { type: 'section', key: 'data', label: 'Data', collapsed: true,
        help: 'Optionally load the Markdown from a URL — e.g. a README or a generated status page.',
        summary: (c) => {
          const u = String(c?.sourceUrl ?? '').trim();
          if (!u) return '–';
          try { return new URL(u).hostname; } catch { return u.slice(0, 30); }
        } },
      { key: 'sourceUrl', type: 'url', label: 'Markdown URL', test: true,
        placeholder: 'https://example.com/status.md',
        help: 'When set, the displayed Markdown is fetched from this URL and the inline content above becomes the fallback on fetch errors. The URL must be CORS-enabled.' },
      refreshSecField({ showIf: c => !!String(c.sourceUrl ?? '').trim() }),

      { type: 'section', key: 'layout', label: 'Layout' },
      { key: 'columns', type: 'select', buttons: true, label: 'Columns',
        options: [
          { value: '1', label: '1' },
          { value: '2', label: '2' },
          { value: '3', label: '3' },
        ],
        help: 'Flows the text into multiple columns, so lists fill wide screens instead of a narrow left column.' },
      { type: 'row', children: [
        { key: 'align', type: 'align', label: 'Alignment' },
        { key: 'valign', type: 'align', vertical: true, label: 'Vertical alignment' },
      ] },
      textScaleField(),

      { type: 'section', key: 'behavior', label: 'Behavior' },
      { type: 'row', children: [
        { key: 'autoScroll', type: 'toggle', label: 'Auto-scroll long content',
          help: 'When the text is taller than the widget, it slowly scrolls to the end, pauses, and starts over. Skipped when the device prefers reduced motion.' },
        { key: 'scrollSec', type: 'duration', label: 'Scroll duration', min: 5,
          showIf: c => !!c.autoScroll,
          help: 'Time for one full top-to-bottom pass.' },
      ] },

      ...themeColorSection(),
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-markdown bb-theme-${c.theme ?? 'dark-minimal'}`;
    // textScale is a percent (80–400). Legacy decks stored a 0.6–2.0 multiplier;
    // migrate() converts on load, but values ≤ 5 are still scaled here as a
    // belt-and-braces guard for content that bypassed migration.
    let ts = Number(c.textScale) || 100;
    if (ts <= 5) ts *= 100;
    const scale = Math.max(0.8, Math.min(4, ts / 100));
    const align = ['left', 'center', 'right'].includes(c.align) ? c.align : 'left';
    const valign = ['top', 'middle', 'bottom'].includes(c.valign) ? c.valign : 'middle';
    const cols = Math.min(3, Math.max(1, parseInt(c.columns, 10) || 1));

    // Vertical alignment without "unsafe" flex centering: for 'middle' the
    // viewport stays content-sized (flex:0 1 auto) and the .bb-slide root's own
    // justify-content:center centres the title+article group — EXACTLY the
    // pre-valign layout, so stored decks render unchanged. 'top'/'bottom' grow
    // the viewport to fill the box; 'bottom' pins the article down with
    // margin-top:auto, which collapses to 0 once content overflows, so an
    // overflowing article is always clipped at the BOTTOM (where the
    // auto-scroll starts), never at the top.
    const grow = valign === 'middle' ? '0 1 auto' : '1 1 auto';
    const artMargin = valign === 'bottom' ? 'margin-top:auto;' : '';

    // The base font-size lives in CSS as a cqmin clamp so the text tracks the
    // WIDGET box (a full-slide widget gets big type, a tablet card stays small).
    // We only feed the user's multiplier in here, via a CSS variable — setting
    // an `em` font-size inline would resolve against the inherited 16px and pin
    // the text to a fixed size that never grows with the widget. The viewport
    // div carries no container-type, so the cqmin units keep resolving against
    // the .bb-slide container.
    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      <div class="bb-md-viewport" style="flex:${grow};min-height:0;overflow:hidden;display:flex;flex-direction:column;">
        <article class="bb-md" style="--bb-md-text-scale:${scale};text-align:${align};flex:0 0 auto;${artMargin}${cols > 1 ? `columns:${cols};column-gap:1.6em;` : ''}"></article>
      </div>
    `;
    container.appendChild(root);
    const viewport = root.querySelector('.bb-md-viewport');
    const article = root.querySelector('.bb-md');

    const fallbackHtml = () => (c.body ?? '').trim()
      ? md(c.body)
      : '<p style="opacity:.6;">Write Markdown in the inspector, headings, lists, <strong>bold</strong>, links and quotes are supported.</p>';

    const reducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    let stopScroll = null;
    let lastHtml = null;
    // Repaints idempotently: an unchanged poll result must NOT reset the
    // auto-scroll position, so identical HTML is skipped wholesale.
    const paint = (html) => {
      if (html === lastHtml) return;
      lastHtml = html;
      stopScroll?.();
      stopScroll = null;
      article.style.transform = '';
      article.innerHTML = html;
      if (c.autoScroll && !reducedMotion) {
        stopScroll = startAutoScroll(viewport, article, Math.max(5, Number(c.scrollSec) || 30));
      }
    };

    const url = String(c.sourceUrl ?? '').trim();
    if (url) {
      // Show the inline body immediately (it doubles as the offline/error
      // fallback — nothing removed), then swap in the fetched Markdown.
      // Remote text runs through the SAME md() → sanitizeHtml pipeline as
      // authored content. 0 = fetch once; positive values poll, clamped UP to
      // the 5s player floor. maxErrors:0 + backoff:false + stopOnCorsError:false
      // keeps a flaky status page recovering on the next tick instead of the
      // source giving up for good.
      paint(fallbackHtml());
      const refreshSec = Math.max(0, Number(c.refreshSec) || 0);
      const stop = liveSource({
        url,
        signal: ctx?.signal,
        parse: 'text',
        fetchInit: { cache: 'no-store' },
        intervalMs: refreshSec > 0 ? Math.max(5000, refreshSec * 1000) : 0,
        maxErrors: 0,
        backoff: false,
        stopOnCorsError: false,
        onData: (text) => paint(md(String(text ?? ''))),
        onError: () => { if (!ctx?.onError?.()) paint(fallbackHtml()); },
      });
      return composeDispose(() => { stopScroll?.(); stop(); root.remove(); });
    }

    paint(fallbackHtml());
    return composeDispose(() => { stopScroll?.(); root.remove(); });
  },
});
