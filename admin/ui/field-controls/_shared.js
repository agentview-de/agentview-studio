// Internal helpers shared across the field-controls/ directory. Re-exports
// the canonical escape helper so call sites can keep using the short `esc`
// alias the controls were built with.

export { escapeHtml as esc, escapeHtml as escAttr, escapeHtml as escText } from '../../../shared/utils/escape.js';

// Tiny element factory — the field-controls were written in a style that
// builds DOM with `h(tag, cls, html)` instead of full document.createElement
// boilerplate. Kept here so every section can import the same one.
export function h(tag, cls, html) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
}
