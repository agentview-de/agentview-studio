// Collapsible inspector-section persistence — the convention shared by the
// schema-form builder (admin/ui/inspector.js → buildSection) and the widget
// inspector's below-form blocks (admin/panels/inspector.js → foldSection).
//
// Both build their OWN section DOM (they legitimately differ in richness —
// buildSection adds closed-state summaries, search integration and per-field
// reset; foldSection is a plain header+body), so the DOM stays per-caller. What
// MUST stay identical is the collapse-state storage key: a section folded via
// one builder has to restore when re-rendered via the other. That single format
// lives here so it can never drift between the two.
//
// Key: `avs_section_<formKey>_<sectionKey>`. formKey is typically the widget
// type; without one, persistence is skipped (state resets on re-render).

const SECTION_STORE_PREFIX = 'avs_section_';

export function sectionStoreKey(formKey, sectionKey) {
  return `${SECTION_STORE_PREFIX}${formKey}_${sectionKey}`;
}

// Read a section's persisted collapsed state, falling back to `defaultCollapsed`
// when there's no formKey, no stored value, or storage is unavailable.
export function loadCollapsed(formKey, sectionKey, defaultCollapsed = false) {
  if (!formKey) return defaultCollapsed;
  try {
    const v = localStorage.getItem(sectionStoreKey(formKey, sectionKey));
    if (v === null) return defaultCollapsed;
    return v === '1';
  } catch { return defaultCollapsed; }
}

// Persist a section's collapsed state. No-op without a formKey or when storage
// throws (private mode / quota), matching the previous inline behaviour.
export function saveCollapsed(formKey, sectionKey, collapsed) {
  if (!formKey) return;
  try { localStorage.setItem(sectionStoreKey(formKey, sectionKey), collapsed ? '1' : '0'); } catch {}
}
