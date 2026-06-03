// Tests for the pure table-HTML builder extracted from rich-text.js. The editor
// wraps this with selection restore + execCommand('insertHTML') + commit; the
// markup shape itself is pure and worth pinning (header vs no-header, cell count,
// the trailing escape paragraph that lets the caret leave the table).

import { test, expect, describe } from './runner.js';
import { buildTableHtml } from '../admin/ui/field-controls/rich-text-table.js';

describe('rich-text-table · buildTableHtml', () => {
  test('header variant: one <th> row in <thead>, the rest <td> in <tbody>', () => {
    const html = buildTableHtml(3, 2, true);
    expect(html).toContain('<thead><tr><th><br></th><th><br></th></tr></thead>');
    // 3 rows total minus the header row = 2 body rows.
    const bodyRows = html.match(/<tr>/g).length;
    expect(bodyRows).toBe(3); // 1 header + 2 body
    expect((html.match(/<td><br><\/td>/g) || []).length).toBe(4); // 2 body rows × 2 cols
  });

  test('no-header variant: all rows are <td> in <tbody>, no <thead>', () => {
    const html = buildTableHtml(2, 3, false);
    expect(html).notToContain('<thead>');
    expect(html).notToContain('<th>');
    expect((html.match(/<tr>/g) || []).length).toBe(2);
    expect((html.match(/<td><br><\/td>/g) || []).length).toBe(6); // 2×3
  });

  test('always ends with a trailing escape paragraph so the caret can leave', () => {
    expect(buildTableHtml(1, 1, false)).toMatch(/<\/table><p><br><\/p>$/);
  });

  test('header table with a single row produces an empty tbody (rows-1 → 0)', () => {
    const html = buildTableHtml(1, 2, true);
    expect(html).toContain('<tbody></tbody>');
    expect(html).toContain('<thead><tr><th><br></th><th><br></th></tr></thead>');
  });
});
