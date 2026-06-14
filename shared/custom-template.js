// Custom-widget template engine.
//
// A "custom" widget stores a SHAPE the user authored — { template, css,
// fields, ...values } — instead of being hard-coded JS like the built-in
// plugins. This module turns that shape into safe DOM, and is shared by the
// editor preview and the live player so a designed widget renders identically
// in both (same single render path as every other widget).
//
// SECURITY MODEL — the reason a custom widget can be exported as a plain JSON
// file and shared with strangers without it being an arbitrary-code-execution
// vector: only DATA crosses between users, never code. The three transforms
// below all sanitize:
//   * substituteTokens — escapes scalar values as text (no markup injection);
//     only rich-text fields (already passed through the strict sanitizeHtml)
//     are inserted as HTML.
//   * sanitizeCustomTemplate — a layout-oriented allowlist sanitizer: keeps
//     class/id/style/data-* so author CSS can hook the markup, but strips
//     <script>/<iframe>/<style>, every on* handler, and unsafe href/src.
//   * sanitizeCss + scopeCss — drop @import / expression() / javascript:, then
//     prefix every selector so author CSS cannot leak out of this one widget.
//
// The pure string transforms (substituteTokens, applyFilter, sanitizeCss,
// scopeCss) are unit-tested headlessly; sanitizeCustomTemplate needs the DOM
// and is covered by the browser suite.

// Content keys that are part of the custom-widget MACHINERY, not author field
// values — collectValues() skips these (and any key starting with "_", e.g.
// the offline-data cache) so they never leak into token substitution.
export const CUSTOM_RESERVED_KEYS = Object.freeze([
  'template', 'css', 'fields', 'theme', 'textColor', 'accentColor',
]);

// ---------------------------------------------------------------------------
// Token substitution
// ---------------------------------------------------------------------------

// {{ key }} or {{ key | filter }}. The key is a JS-identifier-ish field key;
// the optional filter is a single lowercase word from FILTERS below.
const TOKEN_RE = /\{\{\s*([a-zA-Z_$][\w$]*)\s*(?:\|\s*([a-zA-Z]+)\s*)?\}\}/g;

function escapeText(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Apply a display filter to a raw value. Unknown filters pass the value
// through unchanged (forgiving — a typo shows the raw value, not an error).
export function applyFilter(value, filter) {
  if (!filter) return value;
  const n = Number(value);
  const finite = Number.isFinite(n);
  switch (filter.toLowerCase()) {
    case 'upper':   return String(value).toUpperCase();
    case 'lower':   return String(value).toLowerCase();
    case 'trim':    return String(value).trim();
    case 'round':   return finite ? String(Math.round(n)) : value;
    case 'number':  return finite ? n.toLocaleString() : value;
    case 'percent': return finite ? `${n}%` : value;
    case 'json':    try { return JSON.stringify(value); } catch { return String(value); }
    default:        return value;
  }
}

// Replace every {{token}} in `template` with the matching value from `values`.
// `fieldTypes` maps key→field-type; a 'rich-text' field's value is trusted HTML
// (already strict-sanitized by the rich-text control) and inserted raw, so the
// author's bold/colour survives. Every other value is HTML-escaped as text.
export function substituteTokens(template, values = {}, fieldTypes = {}) {
  return String(template ?? '').replace(TOKEN_RE, (_m, key, filter) => {
    let v = values[key];
    if (v == null) v = '';
    v = applyFilter(v, filter);
    if (fieldTypes[key] === 'rich-text') return String(v);
    return escapeText(v);
  });
}

// Map of field.key → field.type for a fields[] array.
export function fieldTypeMap(fields) {
  const m = {};
  if (Array.isArray(fields)) for (const f of fields) if (f && f.key) m[f.key] = f.type;
  return m;
}

// Pull the author-value keys out of a custom widget's content (everything that
// isn't machinery). Used to feed substituteTokens.
export function collectValues(content) {
  const out = {};
  if (content && typeof content === 'object') {
    for (const k of Object.keys(content)) {
      if (CUSTOM_RESERVED_KEYS.includes(k) || k.startsWith('_')) continue;
      out[k] = content[k];
    }
  }
  return out;
}

// List the {{tokens}} actually referenced by a template (deduped, in order).
// Lets the designer warn about tokens with no matching field and vice-versa.
export function tokensInTemplate(template) {
  const seen = new Set();
  const out = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(String(template ?? ''))) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CSS sanitize + scope
// ---------------------------------------------------------------------------

// Strip comments and the few CSS constructs that can fetch or execute:
// @import / @charset (could load a remote stylesheet), expression() (old IE
// script), javascript:/vbscript: urls, -moz-binding (XBL), behavior: (IE htc).
export function sanitizeCss(css) {
  let s = String(css ?? '');
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/@(import|charset)[^;]*;?/gi, '');
  s = s.replace(/expression\s*\(/gi, 'expr_blocked(');
  s = s.replace(/(javascript|vbscript)\s*:/gi, 'blocked:');
  s = s.replace(/-moz-binding/gi, 'blocked');
  s = s.replace(/behavior\s*:/gi, 'blocked:');
  return s;
}

// Return the index of the '}' that matches the '{' at `open`. Falls back to the
// end of the string for unbalanced input (forgiving — never throws).
function matchBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i; }
  }
  return src.length - 1;
}

// Prefix one selector with the scope. :root/html/body collapse to the scope
// itself; a leading & (nesting) binds to the scope; everything else is
// descendant-scoped. Keyframe offsets never reach here (kept inside @keyframes).
function scopeSelector(sel, scope) {
  let s = sel.trim();
  if (!s) return '';
  if (s === ':root' || s === 'html' || s === 'body' || s === '*') return scope;
  s = s.replace(/^(:root|html|body)\b\s*/i, '');
  if (!s) return scope;
  if (s.startsWith('&')) return scope + s.slice(1);
  return `${scope} ${s}`;
}

// Scope every rule in `css` under `scope` (e.g. '[data-cw="w_ab12"]'). Recurses
// into @media/@supports/@container; leaves @keyframes/@font-face/@page bodies
// untouched (their inner selectors aren't element selectors). Run sanitizeCss
// first. Brace-matched, so nested rules and malformed input are handled safely.
export function scopeCss(css, scope) {
  const src = String(css ?? '');
  let out = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1) { out += src.slice(i); break; }
    const prelude = src.slice(i, open);
    const close = matchBrace(src, open);
    const body = src.slice(open + 1, close);
    const pre = prelude.trim();
    const lead = prelude.slice(0, prelude.length - prelude.trimStart().length); // preserve leading whitespace/newlines
    if (pre.startsWith('@')) {
      const lower = pre.toLowerCase();
      if (lower.startsWith('@media') || lower.startsWith('@supports')
          || lower.startsWith('@container') || lower.startsWith('@document')) {
        out += `${lead}${pre} {${scopeCss(body, scope)}}`;
      } else {
        // @keyframes / @font-face / @page — keep the block verbatim.
        out += `${lead}${pre} {${body}}`;
      }
    } else {
      const sel = pre.split(',').map(p => scopeSelector(p, scope)).filter(Boolean).join(', ');
      out += `${lead}${sel} {${body}}`;
    }
    i = close + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTML sanitize (layout-oriented allowlist) — DOM-dependent
// ---------------------------------------------------------------------------

// Tags removed WITH their children (content makes no sense without them or they
// are active/interactive). foreignObject is the SVG escape hatch back into HTML
// — dropped so the SVG subset can't smuggle scripts/inputs.
const CW_DROP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE',
  'NOSCRIPT', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'OPTION',
  'APPLET', 'TEMPLATE', 'SLOT', 'FOREIGNOBJECT', 'AUDIO', 'VIDEO', 'CANVAS',
]);

// Tags kept. Anything not here and not in CW_DROP_TAGS is UNWRAPPED (its
// sanitized children survive, the element itself is dropped) — generous but
// safe. Covers structural HTML, text formatting, tables, and a safe SVG subset
// for simple icons/shapes.
const CW_ALLOWED_TAGS = new Set([
  // structure
  'DIV', 'SPAN', 'SECTION', 'HEADER', 'FOOTER', 'MAIN', 'ARTICLE', 'ASIDE', 'NAV',
  'FIGURE', 'FIGCAPTION', 'P', 'BLOCKQUOTE', 'PRE', 'HR', 'BR', 'WBR',
  // headings + inline text
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SMALL', 'MARK', 'ABBR', 'TIME', 'CODE',
  'SUB', 'SUP', 'KBD', 'SAMP', 'VAR', 'A', 'IMG',
  // lists
  'UL', 'OL', 'LI', 'DL', 'DT', 'DD',
  // tables
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'CAPTION', 'COLGROUP', 'COL',
  // safe SVG subset
  'SVG', 'G', 'PATH', 'CIRCLE', 'RECT', 'LINE', 'POLYLINE', 'POLYGON', 'ELLIPSE',
  'TEXT', 'TSPAN', 'DEFS', 'LINEARGRADIENT', 'RADIALGRADIENT', 'STOP', 'CLIPPATH', 'TITLE',
]);

// Attributes allowed on ANY element (besides the per-tag href/src handled
// specially, and data-*/aria-* matched by prefix). Lowercase. Includes the SVG
// presentation attributes so the SVG subset can actually draw.
const CW_ALLOWED_ATTRS = new Set([
  'class', 'id', 'style', 'title', 'alt', 'role', 'lang', 'dir',
  'colspan', 'rowspan', 'width', 'height', 'span',
  // SVG presentation
  'viewbox', 'preserveaspectratio', 'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
  'opacity', 'transform', 'd', 'points', 'cx', 'cy', 'r', 'rx', 'ry',
  'x', 'y', 'x1', 'x2', 'y1', 'y2', 'offset', 'stop-color', 'stop-opacity',
  'gradientunits', 'gradienttransform', 'text-anchor', 'dominant-baseline',
  'font-size', 'font-family', 'font-weight', 'letter-spacing',
]);

function isSafeHref(v) {
  return /^(https?:|mailto:|#)/i.test(String(v ?? '').trim());
}
function isSafeImgSrc(v) {
  const s = String(v ?? '').trim();
  if (!s) return false;
  if (/^\s*(javascript|vbscript|file):/i.test(s)) return false;
  if (/^\/\//.test(s)) return false;
  if (/^data:image\//i.test(s)) return true;
  if (/^https?:\/\//i.test(s)) return true;
  if (/^(\/|\.\/|\.\.\/)/.test(s)) return true;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) return true; // schemeless → relative
  return false;
}

// Strip dangerous bits from an inline style value: script-ish constructs and
// url() pointing at non-safe schemes (http(s)/data:image/relative kept).
function sanitizeStyleValue(v) {
  let s = String(v ?? '');
  s = s.replace(/expression\s*\(/gi, '(')
       .replace(/(javascript|vbscript)\s*:/gi, '')
       .replace(/-moz-binding/gi, '')
       .replace(/behavior\s*:/gi, '');
  s = s.replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (m, _q, url) => {
    const u = String(url).trim();
    if (/^(https?:|data:image\/|\/|\.\/|\.\.\/|#)/i.test(u) || !/:/.test(u)) return m;
    return 'none';
  });
  return s;
}

function cleanAttrs(el) {
  const tag = el.tagName.toUpperCase();
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();
    const val = attr.value;
    // Every event handler goes, no exceptions.
    if (name.startsWith('on')) { el.removeAttribute(attr.name); continue; }
    // data-*/aria-* are always fine (no behaviour, just hooks/labels).
    if (name.startsWith('data-') || name.startsWith('aria-')) continue;
    if (name === 'href') {
      if (tag === 'A' && isSafeHref(val)) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer nofollow');
      } else {
        el.removeAttribute(attr.name);
      }
      continue;
    }
    if (name === 'src') {
      if (!(tag === 'IMG' && isSafeImgSrc(val))) el.removeAttribute(attr.name);
      continue;
    }
    // xlink:href and any namespaced url-bearing attr → drop (use/image refs).
    if (name.includes('href')) { el.removeAttribute(attr.name); continue; }
    if (name === 'style') { el.setAttribute('style', sanitizeStyleValue(val)); continue; }
    if (!CW_ALLOWED_ATTRS.has(name)) el.removeAttribute(attr.name);
  }
}

function walkCustom(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 1) {
      const el = child;
      const tag = el.tagName.toUpperCase();
      if (CW_DROP_TAGS.has(tag)) { el.remove(); continue; }
      if (!CW_ALLOWED_TAGS.has(tag)) {
        // Unwrap: sanitize + keep children, drop the element itself.
        const parent = el.parentNode;
        walkCustom(el);
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        continue;
      }
      cleanAttrs(el);
      walkCustom(el);
    } else if (child.nodeType === 8) {
      child.remove(); // comments
    }
  }
}

// Sanitize an author HTML template into safe markup. DOM-only (uses a
// <template>); call from render(), not from pure logic.
export function sanitizeCustomTemplate(html) {
  const src = String(html ?? '');
  if (!src) return '';
  const tmpl = document.createElement('template');
  tmpl.innerHTML = src;
  walkCustom(tmpl.content);
  return tmpl.innerHTML;
}

// One-shot: turn a custom widget's content into final, safe, scoped HTML+CSS.
// Returns { html, css } ready to inject. `scope` is the attribute selector the
// caller will put on the wrapper element (e.g. '[data-cw="w_ab12"]').
export function renderCustom(content, scope) {
  const c = content ?? {};
  const html = sanitizeCustomTemplate(
    substituteTokens(c.template, collectValues(c), fieldTypeMap(c.fields)),
  );
  const css = c.css ? scopeCss(sanitizeCss(c.css), scope) : '';
  return { html, css };
}
