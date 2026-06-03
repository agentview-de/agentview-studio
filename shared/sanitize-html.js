// Whitelist HTML sanitizer for user-authored rich text. Used by the rich-text
// field control on save and by plugins on render — both sides sanitize so
// hand-edited playlist files can't smuggle scripts past either layer.
//
// Allowed tags: inline formatting (B/I/U/S/SUB/SUP/CODE), block formatting
// (P/DIV/H2/H3/BLOCKQUOTE/PRE/HR), lists (UL/OL/LI), tables, and links
// (validated href; target/rel forced). Allowed style props cover colour,
// alignment, weight, size, family, line-height, decoration, and background.
// Everything else (class, id, src, on*, <script>, <iframe>, <img>, …) is stripped.

const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'BR', 'P', 'DIV', 'SPAN', 'UL', 'OL', 'LI',
  'H2', 'H3', 'BLOCKQUOTE', 'HR', 'CODE', 'PRE', 'SUB', 'SUP', 'A', 'IMG',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
]);

const ALLOWED_STYLE_PROPS = new Set([
  'color', 'background-color', 'text-align',
  'font-weight', 'font-style', 'font-size', 'font-family', 'line-height',
  'text-decoration', 'text-decoration-line',
  'max-width', 'width', 'height',
]);

// Per-tag attribute whitelists. Anything else on the element is dropped.
// `style` is handled separately (filtered prop-by-prop against ALLOWED_STYLE_PROPS).
const ALLOWED_ATTRS = {
  A:   ['href'],
  IMG: ['src', 'alt', 'width', 'height'],
  TH:  ['colspan', 'rowspan'],
  TD:  ['colspan', 'rowspan'],
};

// http(s) + mailto only. Rejects javascript:, data:, vbscript:, file:, blob:,
// and relative URLs (a display has no meaningful base — relative links are
// almost always a paste mistake).
function isSafeHref(href) {
  const s = String(href ?? '').trim();
  return /^(https?:|mailto:)/i.test(s);
}

// Image sources: http(s), data:image/, and relative paths (assets shipped
// alongside the player). Hard-rejects script schemes.
function isSafeImgSrc(src) {
  const s = String(src ?? '').trim();
  if (!s) return false;
  if (/^\s*(javascript|vbscript|file):/i.test(s)) return false;
  if (/^\/\//.test(s)) return false;                // protocol-relative → arbitrary host
  if (/^data:image\//i.test(s)) return true;
  if (/^https?:\/\//i.test(s)) return true;
  if (/^(\/|\.\/|\.\.\/)/.test(s)) return true;     // relative path
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) return true; // no scheme at all
  return false;
}

// colspan/rowspan must be a positive integer. Returns the cleaned string or null.
function cleanSpan(v) {
  const n = parseInt(String(v ?? ''), 10);
  return (Number.isFinite(n) && n > 1 && n < 1000) ? String(n) : null;
}

// width/height on <img>: positive integer up to 10000 (pixels). Returns string or null.
function cleanDim(v) {
  const n = parseInt(String(v ?? ''), 10);
  return (Number.isFinite(n) && n > 0 && n <= 10000) ? String(n) : null;
}

export function sanitizeHtml(input) {
  const src = String(input ?? '');
  if (!src) return '';
  const tmpl = document.createElement('template');
  tmpl.innerHTML = src;
  walk(tmpl.content);
  return tmpl.innerHTML;
}

function walk(node) {
  // Snapshot children — we mutate during iteration.
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 1) {
      const el = child;
      if (!ALLOWED_TAGS.has(el.tagName)) {
        // Unwrap: keep its sanitized children, drop the element itself. This
        // means a pasted <a href=...> survives as its text, not as a link.
        const parent = el.parentNode;
        walk(el);
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        continue;
      }
      // Special-case <a>: validate href; unwrap if it points somewhere unsafe
      // (javascript:, data:, …) so the link text survives but the click target
      // is removed.
      if (el.tagName === 'A') {
        const href = el.getAttribute('href');
        if (!isSafeHref(href)) {
          const parent = el.parentNode;
          walk(el);
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          parent.removeChild(el);
          continue;
        }
      }
      // Special-case <img>: drop the element entirely if src is unsafe or
      // missing (no fallback content makes sense for a broken image).
      if (el.tagName === 'IMG') {
        if (!isSafeImgSrc(el.getAttribute('src'))) { el.remove(); continue; }
      }
      // Strip every attribute first, then re-apply only the whitelisted ones
      // and a filtered `style`.
      const styleAttr = el.getAttribute('style');
      const tagAttrs = ALLOWED_ATTRS[el.tagName] ?? [];
      const kept = {};
      for (const name of tagAttrs) {
        const v = el.getAttribute(name);
        if (v != null) kept[name] = v;
      }
      for (const attr of [...el.attributes]) el.removeAttribute(attr.name);

      if (el.tagName === 'A') {
        // href was validated above; re-read from kept (always present at this point).
        el.setAttribute('href', kept.href);
        // Force-open in a new tab and detach the opener — defence in depth
        // against tabnabbing on whatever surface ends up rendering this.
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer nofollow');
      } else if (el.tagName === 'TH' || el.tagName === 'TD') {
        const cs = cleanSpan(kept.colspan); if (cs) el.setAttribute('colspan', cs);
        const rs = cleanSpan(kept.rowspan); if (rs) el.setAttribute('rowspan', rs);
      } else if (el.tagName === 'IMG') {
        // src was validated above; alt is free text (escaped by serialization).
        el.setAttribute('src', kept.src);
        if (kept.alt != null) el.setAttribute('alt', kept.alt);
        const w = cleanDim(kept.width);  if (w) el.setAttribute('width', w);
        const hh = cleanDim(kept.height); if (hh) el.setAttribute('height', hh);
      }

      if (styleAttr) {
        el.setAttribute('style', styleAttr);
        for (let i = el.style.length - 1; i >= 0; i--) {
          const name = el.style[i];
          if (!ALLOWED_STYLE_PROPS.has(name)) el.style.removeProperty(name);
        }
        // If the style ended up empty, drop the attribute entirely.
        if (!el.getAttribute('style')) el.removeAttribute('style');
      }
      walk(el);
    } else if (child.nodeType === 8) {
      // HTML comment — drop.
      child.remove();
    }
    // Text nodes (nodeType 3): keep as-is.
  }
}

// Helper for migrating legacy plain-text bodies into the rich editor.
export function plainToHtml(text) {
  const esc = String(text ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return esc.replace(/\n/g, '<br>');
}

// True if the string looks like it's already an HTML string (vs plain text
// from a legacy widget). Recognises both real tags ("<b>") and entity-encoded
// markup ("&lt;script&gt;") — the rich editor stores pasted plain text using
// entities, and without entity detection a downstream re-encode would turn
// `&lt;` into `&amp;lt;` (double-escaped, ugly).
export function looksLikeHtml(s) {
  return /<\w+|&(lt|gt|amp|quot|apos|#x?[0-9a-f]+);/i.test(String(s ?? ''));
}
