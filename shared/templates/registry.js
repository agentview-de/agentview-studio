// Slide-set template registry — the catalog behind the Template Store.
//
// Mirrors the plugin registry deliberately: templates self-register at module
// load (see ./all.js), the registry only collects and looks up, and nothing in
// here knows about the DOM, the network or the agentView API. That keeps the
// whole catalog unit-testable under Node and lets the store UI be a thin view.
//
// A template is:
// {
//   id, category, accent,
//   name: L(en, de), description: L(en, de),
//   tags?: [L(en, de) | string],
//   canvas?: { w, h, fit },              default 1920×1080 fill
//   defaults?: { theme, transition, duration },
//   build: () => [SlideSpec]             pure; called once per instantiation
// }

import { createPlaylist, createSlide, createWidget, normalizeRect } from '../slide-schema.js';
import { get as getPluginFromRegistry } from '../plugins/registry.js';
import { localize } from './lib.js';

// Industry buckets. `blank` is not an industry — it is the "start from
// nothing" entry, pinned first everywhere so the store never reads as a
// mandatory step between the user and an empty canvas.
export const TEMPLATE_CATEGORIES = Object.freeze([
  { id: 'blank',      en: 'Start empty',        de: 'Leer starten',            icon: '⬚' },
  { id: 'generic',    en: 'Universal',          de: 'Universell',              icon: '✦' },
  { id: 'gastro',     en: 'Food & drink',       de: 'Gastronomie',             icon: '🍽' },
  { id: 'retail',     en: 'Retail',             de: 'Einzelhandel',            icon: '🛍' },
  { id: 'health',     en: 'Health & practice',  de: 'Gesundheit & Praxis',     icon: '⚕' },
  { id: 'corporate',  en: 'Office & corporate', de: 'Büro & Unternehmen',      icon: '🏢' },
  { id: 'industry',   en: 'Industry & logistics', de: 'Industrie & Logistik',  icon: '⚙' },
  { id: 'education',  en: 'Education',          de: 'Bildung',                 icon: '🎓' },
  { id: 'hospitality', en: 'Hotel & events',    de: 'Hotel & Events',          icon: '🛎' },
  { id: 'fitness',    en: 'Fitness & wellness', de: 'Fitness & Wellness',      icon: '🏋' },
  { id: 'public',     en: 'Public sector',      de: 'Öffentlicher Sektor',     icon: '🏛' },
  { id: 'realestate', en: 'Real estate',        de: 'Immobilien',              icon: '🏠' },
  { id: 'automotive', en: 'Automotive',         de: 'Automotive',              icon: '🚗' },
]);

const CATEGORY_IDS = new Set(TEMPLATE_CATEGORIES.map(c => c.id));

// A category's label in `lang`. The catalog carries both forms inline (rather
// than i18n keys) so adding an industry is one edit in one file — the same
// bargain the templates themselves make with L().
export function localizeCategory(cat, lang = 'en') {
  return cat?.[lang] ?? cat?.en ?? cat?.id ?? '';
}
const _templates = new Map();

export function registerTemplate(tpl) {
  if (!tpl || typeof tpl !== 'object') throw new Error('[templates] register() needs an object');
  for (const k of ['id', 'category', 'name', 'build']) {
    if (!tpl[k]) throw new Error(`[templates] "${tpl.id ?? '<?>'}" is missing ${k}`);
  }
  if (typeof tpl.build !== 'function') throw new Error(`[templates] "${tpl.id}".build must be a function`);
  if (!CATEGORY_IDS.has(tpl.category)) throw new Error(`[templates] "${tpl.id}" has unknown category "${tpl.category}"`);
  if (_templates.has(tpl.id)) console.warn(`[templates] duplicate id "${tpl.id}", second wins.`);
  _templates.set(tpl.id, tpl);
  return tpl;
}

export function listTemplates() {
  // Category order follows TEMPLATE_CATEGORIES, so the store grid and the
  // sidebar can never disagree about where a card belongs.
  const order = new Map(TEMPLATE_CATEGORIES.map((c, i) => [c.id, i]));
  return [..._templates.values()].sort((a, b) =>
    (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) || a.id.localeCompare(b.id));
}

export function getTemplate(id) {
  return _templates.get(id);
}

export function templateCount() {
  return _templates.size;
}

// Category ids that actually have at least one template, in catalog order.
export function usedCategories() {
  const have = new Set([..._templates.values()].map(t => t.category));
  return TEMPLATE_CATEGORIES.filter(c => have.has(c.id));
}

// Everything a template can be found by, lower-cased, in BOTH languages — so a
// German user searching "Wartezimmer" and an English one searching "waiting
// room" both land on the practice template.
export function searchHaystack(tpl) {
  const parts = [tpl.id, tpl.category];
  for (const field of ['name', 'description']) {
    const v = tpl[field];
    if (typeof v === 'string') parts.push(v);
    else if (v) parts.push(v.en ?? '', v.de ?? '');
  }
  for (const tag of tpl.tags ?? []) {
    if (typeof tag === 'string') parts.push(tag);
    else if (tag) parts.push(tag.en ?? '', tag.de ?? '');
  }
  // Widget types are searchable too: "queue" finds every template with a
  // queue-call widget on it, without anyone having to remember to tag it.
  for (const t of templateWidgetTypes(tpl)) parts.push(t);
  return parts.join(' ').toLowerCase();
}

export function matchesQuery(tpl, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  const hay = searchHaystack(tpl);
  return q.split(/\s+/).every(term => hay.includes(term));
}

// The distinct widget types a template uses — shown on the card as the "what's
// inside" line, and used by the search haystack above. Built from the SPEC,
// so it costs nothing and needs no rendering.
export function templateWidgetTypes(tpl) {
  const out = new Set();
  try {
    for (const s of tpl.build() ?? []) for (const w of s.widgets ?? []) out.add(w.type);
  } catch (e) {
    console.warn(`[templates] "${tpl.id}".build() threw while listing widgets:`, e);
  }
  return [...out];
}

export function templateSlideCount(tpl) {
  try { return (tpl.build() ?? []).length; } catch { return 0; }
}

// A THEMED widget with no background of its own paints its theme's --bb-st-bg
// (shared/background.js: that is what the "Theme background" option means). On
// a solid theme nobody notices. On a gradient — and most of the catalog's
// themes are gradients — every widget paints its OWN copy of the gradient,
// scaled to its own box, so a composed slide showed a grid of ghost rectangles
// that no one had drawn: the header a shade lighter than the slide behind it,
// the clock lighter again.
//
// The slide layer already paints the theme once, across the full frame, which
// is the look the theme was designed for. So a template widget is transparent
// unless it asks for a paint. Note the shape: `{ type: 'transparent' }` does
// NOT do this — that value still falls through to the theme background — so an
// explicit transparent COLOUR is what actually clears the layer.
const TRANSPARENT_BG = Object.freeze({ type: 'color', color: 'transparent' });

const DEFAULT_CANVAS = { w: 1920, h: 1080, fit: 'fill' };
const DEFAULT_DEFAULTS = { transition: 'fade', theme: 'minimal-dark', duration: 10 };

// Turn a template into a real, fully-identified playlist in `lang`.
//
// `getPlugin` is injectable purely so the catalog stays testable under Node
// without the plugin registry (which pulls in DOM-bound modules); callers in
// the app never pass it.
export function buildPlaylist(id, { lang = 'en', name, getPlugin = getPluginFromRegistry } = {}) {
  const tpl = getTemplate(id);
  if (!tpl) throw new Error(`[templates] unknown template "${id}"`);

  const pl = createPlaylist(name || localize(tpl.name, lang));
  pl.canvas = { ...DEFAULT_CANVAS, ...(tpl.canvas ?? {}) };
  pl.defaults = { ...DEFAULT_DEFAULTS, ...(tpl.defaults ?? {}) };
  pl.slides = buildSlides(tpl, { lang, getPlugin });
  // Provenance: which template a deck came from, so "reset to template" or a
  // future "template updated" hint has something to key on. Purely additive —
  // the player and every existing consumer ignore unknown metadata fields.
  pl.metadata = { ...pl.metadata, templateId: tpl.id, templateLang: lang };
  return pl;
}

// The slides alone — used by "insert into the current playlist", which must not
// touch canvas size or playlist defaults.
export function buildSlides(tplOrId, { lang = 'en', getPlugin = getPluginFromRegistry } = {}) {
  const tpl = typeof tplOrId === 'string' ? getTemplate(tplOrId) : tplOrId;
  if (!tpl) throw new Error(`[templates] unknown template "${tplOrId}"`);
  const defaults = { ...DEFAULT_DEFAULTS, ...(tpl.defaults ?? {}) };
  const specs = localize(tpl.build() ?? [], lang);

  return specs.map(spec => createSlide({
    name: spec.name || undefined,
    duration: spec.duration ?? defaults.duration,
    theme: spec.theme ?? defaults.theme,
    transition: spec.transition ?? defaults.transition,
    design: spec.design,
    schedule: spec.schedule,
    background: spec.background,
    widgets: (spec.widgets ?? []).map((w, i) => createWidget(w.type, {
      rect: normalizeRect(w.rect),
      z: w.z ?? i,
      title: w.title,
      rotation: w.rotation,
      background: w.background ?? TRANSPARENT_BG,
      anim: w.anim,
      loop: w.loop,
      // Content authored today is by definition current, so stamp the plugin's
      // schemaVersion. Without it applyWidgetMigrations() treats fresh template
      // content as v1 and runs every migrator over it on load — which for
      // menu (v4) or weather (v6) means six upgrade passes on data that was
      // already in the final shape.
      contentVersion: getPlugin?.(w.type)?.schemaVersion ?? 1,
      content: localeAware(w.content ?? {}, lang),
    })),
  }));
}

// A widget's `locale: ''` means "follow the device". That is the right default
// for a widget a user places by hand, and the wrong one for a template: the
// English "Opening hours" set rendered Montag/Dienstag/Mittwoch on a German
// machine, because the day names come from Intl and nothing had told it which
// language the CONTENT was written in. A template knows: it was built in one.
// Only an empty value is filled in, so a template that pins a locale keeps it,
// and the user can clear the field to get device-follows behaviour back.
// en-GB, not en: bare "en" is US English, so an English template printed
// "Sun, Sep 20, 10:00 AM" on a European agenda board. The catalog's audience is
// the same one agentView serves — a 24-hour clock and a day-before-month date.
// Anyone who wants US formatting picks it in the inspector.
const CONTENT_LOCALE = { en: 'en-GB', de: 'de-DE' };

function localeAware(content, lang) {
  return content.locale === ''
    ? { ...content, locale: CONTENT_LOCALE[lang] ?? lang }
    : content;
}
