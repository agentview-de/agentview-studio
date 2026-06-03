// Registry of inspector field controls — the seam the schema→form renderer
// (admin/ui/inspector.js → renderField) dispatches through, mirroring the widget
// plugin registry (shared/plugins/registry.js). One mental model for everything
// pluggable in the app: a register() call, not a new switch arm.
//
// A control is a function (field, value, set, opts) => { el }, where:
//   field — the schema field descriptor ({ key, type, label, … })
//   value — the current value for field.key
//   set   — (newValue) => void, called on edit
//   opts  — { assetPicker, assetsPicker, codePicker } (only some controls use it)
//
// Registering a type is how a new control plugs in; re-registering overrides it.

const controls = new Map();

export function registerControl(type, render) {
  if (typeof render !== 'function') {
    throw new Error(`field control "${type}" render must be a function`);
  }
  controls.set(type, render);
  return render;
}

export function getControl(type) {
  return controls.get(type);
}

export function hasControl(type) {
  return controls.has(type);
}
