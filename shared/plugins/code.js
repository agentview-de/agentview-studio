import { register } from './registry.js';
import { themeColorSection, colorOverrideDefaults, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { textScaleField } from '../text-scale.js';
import { STATUS_COLORS } from '../status-colors.js';
import { escapeHtml } from '../utils/escape.js';

// {value,label} pairs so the inspector reads "C#" / "JavaScript" instead of
// raw Prism ids like "csharp". The values stay the exact Prism language ids —
// this whitelist select is the real guard for the class name interpolated
// into the markup (escapeHtml is belt-and-braces only).
const LANGS = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'rust', label: 'Rust' },
  { value: 'go', label: 'Go' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'sql', label: 'SQL' },
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML' },
  { value: 'bash', label: 'Bash' },
  { value: 'yaml', label: 'YAML' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
];

// "3-5, 8" style spec — numbers and ranges, comma-separated (trailing comma
// tolerated while typing).
const HL_SPEC_RE = /^\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*,?$/;

// Parse the highlight spec into a Set of 1-based line numbers. Forgiving:
// malformed parts are skipped (validate() already warned in the inspector),
// reversed ranges are swapped, and range size is capped so "1-999999999"
// can't allocate a million-entry set on the player.
function parseHighlightLines(spec) {
  const set = new Set();
  for (const part of String(spec ?? '').split(',')) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : +m[1];
    const lo = Math.max(1, Math.min(a, b)), hi = Math.max(a, b);
    for (let n = lo; n <= Math.min(hi, lo + 4999); n++) set.add(n);
  }
  return set;
}

// Prism core API (synchronous, grammar must already be loaded). Returns the
// highlighted HTML or null when Prism / the grammar isn't available — the
// caller falls back to plain escaped text, so line numbers and highlights
// degrade gracefully without Prism (audit render note).
function highlightSource(src, lang) {
  if (typeof window === 'undefined') return null;
  const P = window.Prism;
  const grammar = P?.languages?.[lang];
  if (!P?.highlight || !grammar) return null;
  try { return P.highlight(src, grammar, lang); } catch { return null; }
}

// Split Prism's highlighted HTML into per-line strings. Prism tokens (e.g.
// block comments, template strings) can span newlines, so a naive split('\n')
// would tear spans apart — instead we track the stack of open <span> tags,
// close them at each newline and reopen them on the next line. Prism output
// contains only <span> elements and entities, which keeps this tractable.
function splitHighlightedHtml(html) {
  const lines = [];
  const open = [];
  let cur = '';
  let i = 0;
  while (i < html.length) {
    const ch = html[i];
    if (ch === '\n') {
      lines.push(cur + '</span>'.repeat(open.length));
      cur = open.join('');
      i += 1;
    } else if (ch === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) { cur += escapeHtml(html.slice(i)); break; } // defensive: malformed tail
      const tag = html.slice(i, end + 1);
      if (tag.startsWith('</')) open.pop();
      else if (!tag.endsWith('/>')) open.push(tag);
      cur += tag;
      i = end + 1;
    } else {
      cur += ch;
      i += 1;
    }
  }
  lines.push(cur + '</span>'.repeat(open.length));
  return lines;
}

export default register({
  type: 'code',
  label: 'Code Block',
  group: 'basic',
  icon: '⌨️',
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(),
    language: 'javascript',
    source: 'function hello() {\n  return "agentView";\n}\n',
    filename: '',
    textScale: 100,
    showLineNumbers: false,
    wrap: false,
    highlightLines: '',
    theme: 'dark-minimal',
  }),
  schema: () => ({
    fields: [
      // Content first: the code IS the widget — language second (it only
      // flavours the highlighting), optional window-chrome caption last.
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'source', type: 'code', label: 'Source code', placeholder: 'Paste your snippet…' },
      { key: 'language', type: 'select', label: 'Language', options: LANGS, search: true,
        help: 'Drives syntax-highlight colouring (when Prism is loaded on the display).' },
      { key: 'filename', type: 'text', label: 'Filename', placeholder: 'src/app.js',
        help: 'Shows an editor-style window bar with traffic-light dots above the code.' },

      { type: 'section', key: 'appearance', label: 'Appearance' },
      textScaleField(),
      { key: 'showLineNumbers', type: 'toggle', label: 'Line numbers' },
      { key: 'wrap', type: 'toggle', label: 'Wrap long lines',
        help: 'Soft-wraps long lines instead of clipping them at the edge of the widget.' },
      { key: 'highlightLines', type: 'text', label: 'Highlight lines', placeholder: '3-5, 8',
        help: 'Comma-separated line numbers or ranges to emphasise with an accent tint.',
        validate: (v) => {
          const s = String(v ?? '').trim();
          if (!s || HL_SPEC_RE.test(s)) return null;
          return { level: 'warn', message: 'Use comma-separated line numbers or ranges, e.g. "3-5, 8".' };
        } },

      ...themeColorSection(),
    ],
  }),
  render(slide, container) {
    const c = slide.content ?? {};
    const lang = c.language ?? 'javascript';
    const wrap = !!c.wrap;
    const showNums = !!c.showLineNumbers;
    const hl = parseHighlightLines(c.highlightLines);
    const filename = String(c.filename ?? '').trim();
    // Normalize CRLF so line numbering / highlighting counts match the editor.
    const src = String(c.source ?? '').replace(/\r\n?/g, '\n');

    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-code bb-theme-${c.theme ?? 'dark-minimal'}`;
    // Text-size multiplier — the .bb-code font clamp in slide-themes.css
    // consumes this var (see cssNeeds: calc(clamp(…) * var(…)) wrapper).
    root.style.setProperty('--bb-code-text-scale', String((Number(c.textScale) || 100) / 100));

    // Editor-style window chrome. The code box is ALWAYS a dark "terminal"
    // independent of the slide theme (see the .bb-code rationale in
    // slide-themes.css), so the bar's slightly-lighter dark bg + muted light
    // text are safe on every theme; the dots reuse the shared traffic-light
    // hexes. Sized in em off a cq clamp so it scales with textScale too.
    const dot = (color) => `<span style="width:.8em;height:.8em;border-radius:50%;background:${color};"></span>`;
    const chrome = filename
      ? '<div class="bb-code-chrome" style="display:flex;align-items:center;gap:12px;margin:1em 0 0;padding:10px 18px;border-radius:12px 12px 0 0;background:#16161e;color:#9ba3b4;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:calc(clamp(12px, 1.8cqmin, 22px) * var(--bb-code-text-scale, 1));">'
        + `<span style="display:flex;gap:.45em;flex:none;" aria-hidden="true">${dot(STATUS_COLORS.bad)}${dot(STATUS_COLORS.warn)}${dot(STATUS_COLORS.good)}</span>`
        + `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(filename)}</span>`
        + '</div>'
      : '';
    // With a chrome bar the <pre> docks underneath it: squared top corners,
    // zero top margin (the bar carries the pre's default 1em gap instead).
    const preStyle = chrome ? 'margin-top:0;border-top-left-radius:0;border-top-right-radius:0;' : '';

    let body;
    if (!src.trim()) {
      // Editor-only hint (player has no i18n). .bb-code brings its own dark
      // bg + light text, so this survives the light themes as-is.
      body = `${chrome}<pre class="bb-code" style="opacity:.6;${preStyle}">Paste a code snippet in the inspector.</pre>`;
    } else if (showNums || hl.size) {
      // Per-line path: highlight via the synchronous Prism core API, then
      // split into rows (span-balanced) so the gutter and the accent stripes
      // are plain plugin DOM — no Prism line-numbers plugin needed, and the
      // whole thing still works (unhighlighted) without Prism. NOTE: markup
      // lives inside <pre>, so rows are emitted with zero stray whitespace.
      const bare = src.replace(/\n$/, ''); // drop the trailing empty row
      const highlighted = highlightSource(bare, lang);
      const lines = highlighted != null ? splitHighlightedHtml(highlighted) : bare.split('\n').map(escapeHtml);
      const gutterCh = String(lines.length).length;
      const cols = showNums ? `grid-template-columns:${gutterCh}ch 1fr;column-gap:1.2em;` : 'grid-template-columns:1fr;';
      const cellWs = wrap ? 'white-space:pre-wrap;overflow-wrap:anywhere;' : 'white-space:pre;';
      const rows = lines.map((line, i) => {
        const n = i + 1;
        const mark = hl.has(n)
          ? 'background:color-mix(in srgb, var(--bb-st-accent, #8b5cf6) 24%, transparent);box-shadow:inset 3px 0 0 var(--bb-st-accent, #8b5cf6);'
          : '';
        const num = showNums ? `<span style="user-select:none;text-align:right;opacity:.4;" aria-hidden="true">${n}</span>` : '';
        // The || fallback is a literal U+200B ZWSP — keeps empty source lines one line-height tall.
        return `<div style="display:grid;${cols}${mark}">${num}<span style="${cellWs}">${line || '​'}</span></div>`;
      }).join('');
      // min-width:max-content sizes every row to the longest line so the
      // accent stripes span the full scroll width (unless wrapping).
      body = `${chrome}<pre class="bb-code" style="${preStyle}"><div style="${wrap ? '' : 'min-width:max-content;'}">${rows}</div></pre>`;
    } else {
      // Plain path — unchanged from the original (single <code> block +
      // highlightAllUnder), so Prism autoloader setups keep working.
      const wrapStyle = wrap ? 'white-space:pre-wrap;overflow-wrap:anywhere;' : '';
      body = `${chrome}<pre class="bb-code" style="${preStyle}${wrapStyle}"><code class="language-${escapeHtml(lang)}">${escapeHtml(src)}</code></pre>`;
    }

    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}
      ${body}
    `;
    container.appendChild(root);
    // Plain path: if Prism is available, highlight in place (the per-line
    // path already highlighted via Prism.highlight and has no <code> child).
    if (!(showNums || hl.size) && typeof window !== 'undefined' && window.Prism?.highlightAllUnder) {
      try { window.Prism.highlightAllUnder(root); } catch {}
    }
    return composeDispose(() => root.remove());
  },
});
