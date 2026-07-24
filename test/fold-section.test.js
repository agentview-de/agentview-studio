// Tests for admin/ui/fold-section.js — the collapse-state storage convention the
// schema-form builder and the widget inspector's below-form blocks now share.
// The key format is the load-bearing part: if it drifted between the two, a
// section folded in one wouldn't restore in the other. Pure/DOM-free (storage
// access is guarded), so it runs headlessly.
import { describe, test, expect } from './runner.js';
import { sectionStoreKey, loadCollapsed, saveCollapsed } from '../admin/ui/fold-section.js';

describe('fold-section · storage convention', () => {
  test('storage key format is stable — avs_section_<formKey>_<sectionKey>', () => {
    expect(sectionStoreKey('weather', '_anim')).toBe('avs_section_weather__anim');
    expect(sectionStoreKey('text', 'appearance')).toBe('avs_section_text_appearance');
  });

  test('loadCollapsed returns the default when there is no formKey', () => {
    expect(loadCollapsed('', 'k', true)).toBe(true);
    expect(loadCollapsed(null, 'k', false)).toBe(false);
    expect(loadCollapsed(undefined, 'k', true)).toBe(true);
  });

  test('loadCollapsed returns the default when nothing is stored', () => {
    // No prior saveCollapsed for this key (and storage may be absent in node) →
    // fall back to the caller's default either way.
    expect(loadCollapsed('never-seen', 'k', true)).toBe(true);
    expect(loadCollapsed('never-seen', 'k', false)).toBe(false);
  });

  test('saveCollapsed without a formKey is a silent no-op', () => {
    saveCollapsed('', 'k', true); // must not throw
    expect(true).toBe(true);
  });
});
