// Tests for admin/ui/field-controls/registry.js — the inspector field-control
// seam. Pure (no DOM): registration and lookup only.
import { describe, test, expect } from './runner.js';
import { registerControl, getControl, hasControl } from '../admin/ui/field-controls/registry.js';

describe('field-control-registry', () => {
  test('registers a control and retrieves it by type', () => {
    const fn = () => ({ el: 'x' });
    const ret = registerControl('unit-test-ctl', fn);
    expect(ret).toBe(fn);                 // returns the render fn (chainable)
    expect(getControl('unit-test-ctl')).toBe(fn);
    expect(hasControl('unit-test-ctl')).toBe(true);
  });

  test('unregistered types report absent', () => {
    expect(getControl('definitely-not-registered')).toBe(undefined);
    expect(hasControl('definitely-not-registered')).toBe(false);
  });

  test('registering a non-function throws', () => {
    expect(() => registerControl('bad', null)).toThrow(/must be a function/);
    expect(() => registerControl('bad', 'nope')).toThrow(/must be a function/);
  });

  test('re-registering a type overrides the previous control', () => {
    const a = () => ({ el: 'a' });
    const b = () => ({ el: 'b' });
    registerControl('dupe', a);
    registerControl('dupe', b);
    expect(getControl('dupe')).toBe(b);
  });
});
