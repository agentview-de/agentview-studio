// Central plugin registry.
// Plugins register themselves by import order (side-effect-free side-effect:
// they call register() at module top level). The registry collects them and
// exposes lookups.

import { validatePlugin } from '../plugin-contract.js';

const _plugins = new Map();
const _groups = new Map();

export function register(plugin) {
  validatePlugin(plugin);
  if (_plugins.has(plugin.type)) {
    console.warn(`Plugin type "${plugin.type}" registered twice, second wins.`);
  }
  _plugins.set(plugin.type, plugin);
  const group = plugin.group ?? 'misc';
  if (!_groups.has(group)) _groups.set(group, []);
  _groups.get(group).push(plugin);
  return plugin;
}

export function get(type) {
  return _plugins.get(type);
}

export function has(type) {
  return _plugins.has(type);
}

export function list() {
  return [..._plugins.values()];
}

export function listByGroup() {
  return [..._groups.entries()].map(([g, ps]) => ({ group: g, plugins: ps }));
}

export function listTypes() {
  return [..._plugins.keys()];
}
