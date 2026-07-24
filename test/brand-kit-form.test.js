// Tests for admin/ui/brand-kit-form.js — the brand-kit colour grid shared by the
// slide, playlist and org editors (three near-identical hand-rolled copies
// before). The grid markup is pure (t + escapeHtml), so it runs headlessly here;
// readBrandKitGrid needs a real DOM and is covered by the browser suite.
import { describe, test, expect } from './runner.js';
import { brandKitGrid } from '../admin/ui/brand-kit-form.js';

describe('brand-kit-form · brandKitGrid', () => {
  test('renders the four fields with prefix-scoped ids + defaults', () => {
    const html = brandKitGrid({}, { prefix: 'bk' });
    for (const id of ['bk-bg', 'bk-fg', 'bk-accent', 'bk-font']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('type="color"');
    expect(html).toContain('#0f1218');       // bg default
    expect(html).toContain('data-bk="bg"');  // read-back fallback attribute
  });

  test('kit values override the defaults', () => {
    const html = brandKitGrid({ colors: { bg: '#123456' }, font: 'Roboto' }, { prefix: 'bk' });
    expect(html).toContain('#123456');
    expect(html).toContain('value="Roboto"');
    expect(html).notToContain('#0f1218'); // bg default overridden
  });

  test('a custom prefix scopes every id + hexLabels adds the reflectors', () => {
    const html = brandKitGrid({}, { prefix: 'pbk', hexLabels: true });
    expect(html).toContain('id="pbk-bg"');
    expect(html).toContain('id="pbk-bg-hex"');
    expect(html).toContain('avs-bk-row');
    expect(html).notToContain('id="bk-bg"');
  });

  test('the plain (non-hex) variant omits reflectors + row wrapper', () => {
    const html = brandKitGrid({}, { prefix: 'bk' });
    expect(html).notToContain('-hex"');
    expect(html).notToContain('avs-bk-row');
  });

  test('fontDefault seeds the font field when the kit has none', () => {
    expect(brandKitGrid({}, { prefix: 'bk', fontDefault: 'Inter, sans-serif' })).toContain('value="Inter, sans-serif"');
  });
});
