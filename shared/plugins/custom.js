import { register } from './registry.js';
import { composeDispose } from '../plugin-contract.js';
import { themeColorSection, colorOverrideDefaults, applyColorOverrides } from '../widget-color.js';
import { renderCustom } from '../custom-template.js';

// Custom Widget — the one generic, user-designed plugin. Where every other
// plugin hard-codes its render() in JS, this one renders an author-supplied
// SHAPE: an HTML template with {{tokens}}, scoped CSS, and a set of inspector
// fields the author chooses to expose. Because the shape is pure data (no code),
// a designed widget is editable in the normal inspector, savable to "My
// widgets", and exportable as a JSON file that is safe to share — see
// shared/custom-template.js for the sanitization contract.
//
// content shape:
//   {
//     template: '<div class="card">{{title}}</div>',   author HTML + {{tokens}}
//     css:      '.card { … }',                          author CSS (scoped on render)
//     fields:   [ { key, type, label, … }, … ],         the user-facing inspector form
//     <each field key>: <value>,                        the values those fields edit
//     theme, textColor, accentColor                     standard theming knobs
//   }
// The field keys live at the TOP LEVEL of content (not nested) so the normal
// buildForm() drives them with zero special-casing: the schema below simply
// returns the author's fields verbatim.

const STARTER_TEMPLATE =
`<div class="cw">
  <div class="cw-label">{{label}}</div>
  <div class="cw-value">{{value}}</div>
</div>`;

const STARTER_CSS =
`.cw {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.3em;
  width: 100%;
  height: 100%;
  text-align: center;
}
.cw-label {
  font-size: clamp(14px, 4cqmin, 40px);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.7;
}
.cw-value {
  font-size: clamp(28px, 14cqmin, 160px);
  font-weight: 800;
  line-height: 1;
  color: var(--bb-st-accent, #8b5cf6);
}`;

const STARTER_FIELDS = [
  { key: 'label', type: 'text', label: 'Label' },
  { key: 'value', type: 'text', label: 'Value' },
];

const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

export default register({
  type: 'custom',
  label: 'Custom Widget',
  group: 'basic',
  icon: '🎨',
  schemaVersion: 1,

  defaults: () => ({
    template: STARTER_TEMPLATE,
    css: STARTER_CSS,
    fields: clone(STARTER_FIELDS),
    label: 'Custom widget',
    value: '42',
    ...colorOverrideDefaults(),
    theme: 'minimal-dark',
  }),

  // The schema is DYNAMIC: a custom widget's user-facing form IS the set of
  // fields its author defined. The inspector calls plugin.schema(content) (see
  // admin/panels/inspector.js) — other plugins ignore the arg, this one needs
  // it. When called with no content (e.g. the schema-shape test) it degrades to
  // just the theme/colour section, which is a valid { fields: [...] }.
  schema: (content) => {
    const authorFields = Array.isArray(content?.fields)
      ? content.fields.filter(f => f && f.key && f.type)
      : [];
    return {
      fields: [
        ...(authorFields.length
          ? [{ type: 'section', key: 'content', label: 'Content' }, ...authorFields]
          : []),
        ...themeColorSection(),
      ],
    };
  },

  render(slide, container) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    root.className = `bb-slide bb-slide-custom bb-theme-${c.theme ?? 'minimal-dark'}`;
    applyColorOverrides(root, c);

    // Per-instance scope so the author CSS can never leak to other widgets:
    // every selector is prefixed with [data-cw="<id>"] and the inner wrapper
    // carries that attribute. slide.id is the widget id (via widgetAsSlide).
    const scopeId = String(slide.id ?? `cw_${Math.random().toString(36).slice(2, 8)}`)
      .replace(/[^\w-]/g, '');
    const inner = document.createElement('div');
    inner.className = 'bb-custom-root';
    inner.setAttribute('data-cw', scopeId);
    // Establish a container query + positioning context so the cqmin units the
    // starter CSS uses resolve against the widget box, not the viewport.
    inner.style.cssText = 'width:100%;height:100%;container-type:size;position:relative;';

    const { html, css } = renderCustom(c, `[data-cw="${scopeId}"]`);
    inner.innerHTML = html;
    root.appendChild(inner);
    if (css) {
      const style = document.createElement('style');
      style.textContent = css;
      root.appendChild(style);
    }
    container.appendChild(root);
    return composeDispose(() => root.remove());
  },
});
