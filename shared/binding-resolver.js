// Slot-binding resolver — substitutes widget content fields from data slots.
// Used by both the player runtime and the editor preview.
//
// Schema: widget.bindings = { [fieldPath]: { slot, jsonPath?, fallback? } }
//   fieldPath ─ dotted path into widget.content (e.g. "title", "items.0.label")
//   slot      ─ public slot slug to fetch
//   jsonPath  ─ optional dotted path into the slot value (e.g. "data.events[0].title")
//   fallback  ─ optional literal returned if slot missing / path miss / parse error
//
// Runtime usage pattern:
//   const slugs = collectUniqueSlots(playlist);             // start poll loops
//   const data  = { [slug]: parsedJsonValue, … };           // populated by loops
//   const resolvedWidget = applyBindings(widget, data);     // before plugin render

const SAFE_KEYS = /^[a-zA-Z0-9_$-]+$/;

// Walk a dotted path with array-bracket support: "items[2].name" or "items.2.name".
export function getByPath(root, path) {
  if (root == null) return undefined;
  if (!path) return root;
  const tokens = String(path)
    .replace(/\[(['"]?)([^\]'"]+)\1\]/g, '.$2')
    .split('.')
    .filter(Boolean);
  let cur = root;
  for (const tok of tokens) {
    if (cur == null) return undefined;
    if (!SAFE_KEYS.test(tok)) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(tok)) cur = cur[+tok];
    else if (typeof cur === 'object') cur = cur[tok];
    else return undefined;
  }
  return cur;
}

// Set value at dotted path. Creates intermediate objects/arrays as needed.
// Returns a NEW root (does not mutate the original).
function setByPath(root, path, value) {
  const tokens = String(path)
    .replace(/\[(['"]?)([^\]'"]+)\1\]/g, '.$2')
    .split('.')
    .filter(Boolean);
  if (!tokens.length) return value;
  const cloneRoot = root && typeof root === 'object' ? (Array.isArray(root) ? [...root] : { ...root }) : {};
  let cur = cloneRoot;
  for (let i = 0; i < tokens.length - 1; i++) {
    const k = tokens[i];
    const nextKey = tokens[i + 1];
    const wantArr = /^\d+$/.test(nextKey);
    const existing = cur[k];
    const clone = existing && typeof existing === 'object'
      ? (Array.isArray(existing) ? [...existing] : { ...existing })
      : (wantArr ? [] : {});
    cur[k] = clone;
    cur = clone;
  }
  cur[tokens[tokens.length - 1]] = value;
  return cloneRoot;
}

// Collect every unique slot slug a playlist binds to. Used to set up polling.
export function collectUniqueSlots(playlist) {
  const slugs = new Set();
  if (!playlist?.slides) return [];
  for (const slide of playlist.slides) {
    walkWidgets(slide.widgets, w => collectFromWidget(w, slugs));
    if (Array.isArray(slide.abVariants)) for (const v of slide.abVariants) walkWidgets(v.widgets, w => collectFromWidget(w, slugs));
    if (slide.langs) for (const k of Object.keys(slide.langs)) walkWidgets(slide.langs[k]?.widgets, w => collectFromWidget(w, slugs));
  }
  return [...slugs];
}

function walkWidgets(widgets, fn) {
  if (!Array.isArray(widgets)) return;
  for (const w of widgets) if (w) fn(w);
}

function collectFromWidget(widget, slugs) {
  if (!widget?.bindings) return;
  for (const k of Object.keys(widget.bindings)) {
    const b = widget.bindings[k];
    if (b?.slot) slugs.add(String(b.slot));
  }
}

// Apply bindings to one widget. `slotData` is a map { slug → parsed value }.
// Returns either the same widget (no bindings) or a shallow-cloned widget with
// resolved content.
export function applyBindings(widget, slotData) {
  if (!widget?.bindings || !Object.keys(widget.bindings).length) return widget;
  let content = widget.content;
  for (const fieldPath of Object.keys(widget.bindings)) {
    const b = widget.bindings[fieldPath];
    if (!b?.slot) continue;
    const slotValue = slotData?.[b.slot];
    let val;
    if (slotValue !== undefined) {
      val = b.jsonPath ? getByPath(slotValue, b.jsonPath) : slotValue;
    }
    if (val === undefined) val = b.fallback !== undefined ? b.fallback : undefined;
    if (val !== undefined) {
      content = setByPath(content ?? {}, fieldPath, val);
    }
  }
  return { ...widget, content };
}

// Apply bindings to a list of widgets, returning a (possibly cloned) list.
export function applyBindingsToWidgets(widgets, slotData) {
  if (!Array.isArray(widgets) || !widgets.length) return widgets;
  return widgets.map(w => applyBindings(w, slotData));
}
