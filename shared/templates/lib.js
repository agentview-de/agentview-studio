// Template authoring kit — the small vocabulary every slide-set template is
// written in, plus the bilingual string primitive.
//
// A template is PURE DATA: it declares slides and widgets as plain specs and
// never touches the plugin registry, the DOM or the network. registry.js turns
// a spec into a real playlist (fresh ids, migrated content stamps) at the
// moment the user picks it, so the same template can be instantiated any
// number of times without two copies ever sharing an id.
//
// WHY THE SPECS AREN'T PLAYLISTS ALREADY: a template lives in the module graph
// for the whole session. If it were a finished playlist object, "use this
// template" twice would hand out two references to the SAME slides — editing
// one would edit the other, and both would collide on slide ids inside a
// single playlist. Specs are cloned and freshly identified on every build.

// ---------------------------------------------------------------------------
// Bilingual strings
// ---------------------------------------------------------------------------

// L('Daily menu', 'Tageskarte') marks a string that has a German form. Templates
// are the one place in the app where the CONTENT (not just the chrome) has to
// be translated: an English "Today's soup" on a Bavarian bakery screen is not a
// template anyone can use. localize() resolves the whole tree in one pass, so
// authors write L() anywhere a string appears — headings, table cells, RSS
// labels, menu items — without a per-widget translation mechanism.
const I18N = '$i18n';

export function L(en, de) {
  return { [I18N]: true, en, de };
}

export function isL(v) {
  return !!v && typeof v === 'object' && v[I18N] === true;
}

// Transform a value that MAY be an L() without collapsing it to one language.
// `mapL(L('Sale', 'Aktion'), s => '<h2>' + s + '</h2>')` stays bilingual.
//
// This exists because the obvious thing does not work: a template literal
// interpolating an L() calls String() on it and yields "[object Object]" —
// which is exactly what a headline rendered before this was here.
export function mapL(value, fn) {
  return isL(value) ? L(fn(value.en ?? ''), fn(value.de ?? value.en ?? '')) : fn(value ?? '');
}

// Deep-resolve every L() node for `lang`, returning a fresh structure. Non-L
// values are cloned so a built playlist never aliases the template's own data.
export function localize(node, lang = 'en') {
  if (isL(node)) return node[lang] ?? node.en ?? '';
  if (Array.isArray(node)) return node.map(v => localize(v, lang));
  if (node && typeof node === 'object') {
    const out = {};
    for (const k of Object.keys(node)) out[k] = localize(node[k], lang);
    return out;
  }
  return node;
}

// ---------------------------------------------------------------------------
// Slide / widget specs
// ---------------------------------------------------------------------------

// W('text', [10, 8, 80, 20], { body: … }, { anim: 'fade-up', delay: 200 })
//
// The rect is an [x, y, w, h] tuple in PERCENT of the slide — the same space
// the canvas and the player already work in, just terser than four named keys
// when a template file declares a hundred of them.
export function W(type, rect, content = {}, opts = {}) {
  const [x, y, w, h] = rect;
  const spec = { type, rect: { x, y, w, h }, content };
  if (opts.z != null) spec.z = opts.z;
  if (opts.title) spec.title = opts.title;
  if (opts.rotation) spec.rotation = opts.rotation;
  if (opts.background) spec.background = opts.background;
  if (opts.anim) spec.anim = { type: opts.anim, delay: opts.delay ?? 0, duration: opts.duration ?? 600 };
  if (opts.loop) spec.loop = opts.loop;
  return spec;
}

// The bottom band a full-width ticker owns, in percent. One number for the
// whole catalog: a strip that sits at 66 % on one slide, 78 % on the next and
// 88 % on a third reads as sloppiness even when each one is defensible alone.
// 13 % of 1080 is 140 px — enough for ticker type at the size a passer-by can
// actually read, and still a quiet edge rather than a second headline.
export const TICKER_BAND = Object.freeze({ y: 87, h: 13 });

// S({ name, widgets: [...] }) — a slide spec. `duration`, `theme`, `transition`
// and `background` fall back to the template's defaults when omitted.
//
// One layout rule is enforced here rather than left to every author: THE TICKER
// OWNS THE BOTTOM BAND. A full-width ticker is snapped to TICKER_BAND, and any
// widget that would run underneath it is shortened to stop at its top edge.
// Hand-placed tickers had drifted across thirteen different bands, and half the
// slides had content running under the strip — invisible on the wall, and the
// kind of thing that is fixed once and then silently reintroduced by the next
// template. A rule cannot be reintroduced against.
export function S(spec) {
  const s = { widgets: [], ...spec };
  return { ...s, widgets: reserveTickerBand(s.widgets) };
}

function reserveTickerBand(widgets) {
  const list = Array.isArray(widgets) ? widgets : [];
  // Only a full-bleed ticker claims the band; a ticker used as a column or an
  // inset strip is a deliberate composition and is left alone.
  const band = list.find(w => w?.type === 'ticker' && w.rect?.x === 0 && w.rect?.w === 100);
  if (!band) return list;
  // A portrait canvas gets a proportionally shallower band — 13 % of a 1920-tall
  // slide would be a 250 px stripe. A ticker authored at 92 % or lower down is
  // taken as that case; everything else lands on the one landscape band.
  const y = band.rect.y >= 92 ? 92 : TICKER_BAND.y;
  return list.map(w => {
    if (w === band) return { ...w, rect: { ...w.rect, y, h: 100 - y } };
    const r = w?.rect;
    if (!r || r.y >= y) return w;
    return r.y + r.h <= y ? w : { ...w, rect: { ...r, h: +(y - r.y).toFixed(2) } };
  });
}

// ---------------------------------------------------------------------------
// Composition helpers
// ---------------------------------------------------------------------------

// The two text shapes templates reach for constantly. Both emit the rich-text
// HTML the `text` widget stores, so the WYSIWYG opens them without a migration.
//
// <h2>, NOT <h1>: the announcement widget's sanitizer allows H2/H3 and unwraps
// H1 (shared/sanitize-html.js), because H1 is reserved for the slide title the
// widget renders itself. An <h1> here survived as plain body text — a headline
// that was not one. The rich-text toolbar makes the same choice, so a user who
// opens a template heading in the WYSIWYG finds it on the "Heading" preset
// rather than on something the dropdown cannot name.
//
// The default text scale is 240, not 100. The app's rich-text sizes are tuned
// for a widget you are looking at on a laptop: an h2 is 4.6cqmin, which on a
// half-height widget of a 1080p design is ~28px — about 2.5 %% of the screen
// height. Signage wants a headline at 7-10 %%. The multiplier is the only lever
// (the clamp ceiling is 56px, so the scale is doing real work here), and every
// template exposes it in the inspector as "Text size" for anyone who disagrees.
export const headline = (html, opts = {}) => ({
  // mapL, not a template literal: `${L(…)}` stringifies to "[object Object]".
  body: mapL(html, s => `<h2>${s}</h2>`),
  font: opts.font ?? 'display',
  valign: opts.valign ?? 'middle',
  textScale: opts.textScale ?? 240,
  maxWidth: opts.maxWidth ?? 'full',
  priority: opts.priority ?? 'normal',
  theme: opts.theme ?? 'minimal-dark',
});

export const paragraph = (html, opts = {}) => ({
  body: html,
  font: opts.font ?? 'sans',
  valign: opts.valign ?? 'middle',
  textScale: opts.textScale ?? 150,
  maxWidth: opts.maxWidth ?? 'full',
  priority: opts.priority ?? 'normal',
  theme: opts.theme ?? 'minimal-dark',
});

// A full-bleed background image with a darkening overlay, so headline text on
// top of it stays legible whatever photo the user swaps in. Templates ship
// PHOTO-FREE by design (see PLACEHOLDER_IMAGE below) — this is the frame the
// user drops their own picture into.
export const backdrop = (url = '', overlay = 55) => ({
  url, alt: '', fit: 'cover', focusX: 50, focusY: 50,
  overlay, overlayStyle: 'gradient', kenBurns: false, cornerRadius: 0, refreshSec: 0,
});

// Templates never ship a photo. A remote URL would be a third-party request
// from every screen running the template (a DSGVO problem and a broken slide
// the day the host goes away), and a bundled JPEG would balloon a repo whose
// whole point is "static files, no build". An image widget with an empty url
// renders the studio's own placeholder and the inspector's asset picker is one
// click away — so the template teaches the composition, and the user brings the
// picture.
export const PLACEHOLDER_IMAGE = '';

// A ticker strip along the bottom edge — the single most repeated element
// across the whole catalog.
export const tickerBar = (items, opts = {}) => W('ticker', opts.rect ?? [0, 88, 100, 12], {
  items: items.map(text => (typeof text === 'string' || isL(text) ? { text } : text)),
  leadLabel: opts.lead ?? '',
  speed: opts.speed ?? 70,
  separator: opts.separator ?? '•',
  direction: 'ltr',
  pauseOnHover: false,
  solidBackground: opts.solid ?? true,
  textScale: opts.textScale ?? 100,
  font: 'theme',
  fontWeight: 'bold',
  uppercase: opts.uppercase ?? false,
  letterSpacing: 'normal',
  barHeight: 'full',
  barPosition: 'middle',
  theme: opts.theme ?? 'minimal-dark',
}, { z: opts.z ?? 5 });

// A small corner clock — the other element every second template wants.
export const cornerClock = (opts = {}) => W('clock', opts.rect ?? [76, 3, 21, 12], {
  timezone: opts.tz ?? 'Europe/Berlin',
  label: opts.label ?? '',
  locale: '',
  showOffset: false,
  display: opts.display ?? 'time',
  style: 'digital',
  faceStyle: 'ticks',
  hour12: false,
  align: opts.align ?? 'right',
  textScale: opts.textScale ?? 100,
  showOpenBadge: false,
  openFrom: '08:00', openTo: '18:00', openText: '', closedText: '',
  theme: opts.theme ?? 'minimal-dark',
}, { z: opts.z ?? 4 });

// Curated feeds used by the catalog. Kept here rather than typed into each
// template so a dead feed is fixed in ONE place — and so every template that
// wants "general news" reaches for the same, verifiable source.
export const FEEDS = Object.freeze({
  deNews:    'https://www.tagesschau.de/index~rss2.xml',
  deTech:    'https://www.heise.de/rss/heise-atom.xml',
  worldNews: 'https://feeds.bbci.co.uk/news/rss.xml',
  business:  'https://feeds.bbci.co.uk/news/business/rss.xml',
  science:   'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
});

// Cities used by the weather / clock widgets in the catalog.
export const PLACES = Object.freeze({
  munich:  { name: 'Munich', lat: 48.137, lng: 11.575 },
  berlin:  { name: 'Berlin', lat: 52.520, lng: 13.405 },
  hamburg: { name: 'Hamburg', lat: 53.551, lng: 9.994 },
  vienna:  { name: 'Vienna', lat: 48.208, lng: 16.373 },
  zurich:  { name: 'Zurich', lat: 47.377, lng: 8.542 },
});

// Relative epoch helpers. Templates must not bake an absolute date — a
// countdown to a day in 2026 is broken scenery by 2027. These are evaluated at
// BUILD time (the moment the user picks the template), so every instantiation
// lands a sensible distance from today.
export const inDays = (n) => Date.now() + n * 86400000;
export const daysAgo = (n) => Date.now() - n * 86400000;

// Calendar events are stored as a LOCAL "YYYY-MM-DDTHH:mm" string (the shape a
// <input type="datetime-local"> round-trips). `at(1, '09:30')` is tomorrow at
// half past nine, in the authoring machine's — i.e. the user's — local time.
const pad = n => String(n).padStart(2, '0');

// `onWeekday(0, '09:00')` is MONDAY OF THE CURRENT WEEK at nine — not "in one
// day". The calendar's week grid draws the week `today` falls in, so a demo
// event placed with at(+1) lands in next week's grid whenever the template is
// opened late in the week: on a Saturday the whole board rendered as five empty
// columns. Anchoring to the week itself is the only placement that survives
// being looked at on a Saturday.
export function onWeekday(index, hhmm = '09:00') {
  const now = new Date();
  const mondayOffset = -(((now.getDay() + 6) % 7)) + index;
  return at(mondayOffset, hhmm);
}

export function at(dayOffset, hhmm = '09:00') {
  const d = new Date(Date.now() + dayOffset * 86400000);
  const [h, m] = String(hhmm).split(':');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(+h || 0)}:${pad(+m || 0)}`;
}
