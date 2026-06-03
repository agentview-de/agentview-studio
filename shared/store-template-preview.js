// Local, network-free preview of a store template's JSON data slots.
//
// Store templates render from data slots they fetch at runtime via
// `{{slot:KEY.readUrl}}` placeholders. Those are resolved to real public read
// URLs only once the template is *sent* to a display; in the Studio editor they
// stay literal and the template falls back to its own built-in defaults (the
// template's loader guards with `^https?://`, so a literal placeholder is simply
// ignored — see any bistro-* template's `looksLikeUrl`).
//
// buildPreviewHtml() lets the editor show *edited* slot values live, with no
// cloud slot and no network: every `{{slot:KEY.readUrl}}` whose KEY has an
// edited value is rewritten to a sentinel https URL, and a small script is
// injected at the top of <head> that patches fetch()/XHR to answer those
// sentinel URLs from the supplied values. Keys without a value keep their
// placeholder, so the template still uses its own defaults for them.
//
// This is intentionally generic: it never parses the template's internals, only
// the agentView slot-URL contract, so it works for any store template.

const SENTINEL_ORIGIN = 'https://avs-slot.local';

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matches `{{slot:KEY.readUrl}}` for one key, tolerant of inner whitespace.
function slotUrlPlaceholder(key) {
  return new RegExp('\\{\\{\\s*slot:' + escapeRegExp(key) + '\\.readUrl\\s*\\}\\}', 'g');
}

// Keys whose value is a present (non-undefined) entry get wired to the shim.
function activeKeys(slots) {
  if (!slots || typeof slots !== 'object') return [];
  return Object.keys(slots).filter(k => slots[k] !== undefined);
}

export function buildPreviewHtml(html, slots) {
  const src = String(html ?? '');
  const keys = activeKeys(slots);
  if (!keys.length) return src;

  const data = {};
  let rewritten = src;
  for (const key of keys) {
    data[key] = slots[key];
    rewritten = rewritten.replace(slotUrlPlaceholder(key), SENTINEL_ORIGIN + '/' + encodeURIComponent(key));
  }

  // HTML-escape the embedded JSON so it can never break out of the <script>
  // (no literal `</script>` or `<!--` reaches the parser).
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const shim = buildShim(json);
  return injectIntoHead(rewritten, shim);
}

function buildShim(jsonLiteral) {
  return `<script>(function(){
  var DATA = ${jsonLiteral};
  var PREFIX = ${JSON.stringify(SENTINEL_ORIGIN + '/')};
  function keyFor(u){
    try { u = String(u); } catch (e) { return null; }
    if (u.indexOf(PREFIX) !== 0) return null;
    return decodeURIComponent(u.slice(PREFIX.length).split(/[?#]/)[0]);
  }
  function has(k){ return k !== null && Object.prototype.hasOwnProperty.call(DATA, k); }
  var of = (typeof window.fetch === 'function') ? window.fetch.bind(window) : null;
  window.fetch = function(input, init){
    var url = (input && typeof input === 'object' && 'url' in input) ? input.url : input;
    var k = keyFor(url);
    if (has(k)) {
      var body = JSON.stringify(DATA[k]);
      return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return of ? of(input, init) : Promise.reject(new Error('fetch unavailable'));
  };
  var OX = window.XMLHttpRequest;
  if (OX) {
    window.XMLHttpRequest = function(){
      var xhr = new OX(), sentinelKey = null;
      var open = xhr.open;
      xhr.open = function(m, u){ sentinelKey = keyFor(u); return open.apply(xhr, arguments); };
      var send = xhr.send;
      xhr.send = function(){
        if (has(sentinelKey)) {
          var body = JSON.stringify(DATA[sentinelKey]);
          try {
            Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true });
            Object.defineProperty(xhr, 'status', { value: 200, configurable: true });
            Object.defineProperty(xhr, 'responseText', { value: body, configurable: true });
            Object.defineProperty(xhr, 'response', { value: body, configurable: true });
          } catch (e) {}
          setTimeout(function(){
            if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
            if (typeof xhr.onload === 'function') xhr.onload();
          }, 0);
          return;
        }
        return send.apply(xhr, arguments);
      };
      return xhr;
    };
  }
})();</script>`;
}

function injectIntoHead(html, snippet) {
  // Install the shim before the template's own scripts run: right after the
  // opening <head>. Fall back to after <html>, then to the very front.
  const head = html.match(/<head[^>]*>/i);
  if (head) {
    const i = head.index + head[0].length;
    return html.slice(0, i) + snippet + html.slice(i);
  }
  const htmlTag = html.match(/<html[^>]*>/i);
  if (htmlTag) {
    const i = htmlTag.index + htmlTag[0].length;
    return html.slice(0, i) + snippet + html.slice(i);
  }
  return snippet + html;
}

// From RENDERED display HTML (where `{{slot:KEY.readUrl}}` was already replaced
// with real public read URLs), discover the unique data-slot slugs + their read
// URLs. Used by the per-display "Inhalte" tab to find which slots feed a display
// without re-sending. Also matches leftover `{{slot:KEY.prop}}` placeholders for
// content that was never sent through a slot.
//
// Public slot read URLs follow `…/data/<slug>/public` (see player runtime's
// resolveDefaultSlotUrl) and the server's `…/data/u/<token>/<slug>…` variant.
export function extractSlotRefs(html) {
  const src = String(html ?? '');
  const out = new Map(); // slug → { slug, url }
  const urlRe = /https?:\/\/[^\s"'<>()]*?\/data\/(?:u\/[^/"'<>]+\/)?([a-zA-Z0-9_-]+)(?:\/[a-zA-Z0-9_.-]*)?/g;
  let m;
  while ((m = urlRe.exec(src))) {
    const slug = m[1];
    if (slug && slug !== 'quota' && slug !== 'public' && !out.has(slug)) {
      out.set(slug, { slug, url: m[0] });
    }
  }
  const phRe = /\{\{\s*slot:([a-zA-Z0-9_-]+)\.[a-zA-Z0-9_]+\s*\}\}/g;
  while ((m = phRe.exec(src))) {
    const slug = m[1];
    if (!out.has(slug)) out.set(slug, { slug, url: null });
  }
  return [...out.values()];
}
