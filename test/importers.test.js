// Tests for the importer pipeline's pure parts: the file-type `sniff` routing
// (which importer claims a dropped file — order/precedence matters in index.js)
// and the two pure parse cores (CSV → label/value series, JSON → chart data).
// The binary converters (pdf/docx/xlsx/pptx) need their vendored libraries + a
// DOM, so only their sniff is exercised here.

import { test, expect, describe } from './runner.js';
import * as image from '../admin/importers/image-batch.js';
import * as pdf from '../admin/importers/pdf.js';
import * as csv from '../admin/importers/csv.js';
import * as docx from '../admin/importers/docx.js';
import * as xlsx from '../admin/importers/xlsx.js';
import * as ics from '../admin/importers/ics.js';
import * as json from '../admin/importers/json.js';
import * as pptx from '../admin/importers/pptx.js';
import { parseCsv } from '../admin/importers/csv.js';
import { chartDataFromJson } from '../admin/importers/json.js';

// index.js dispatch order — the first sniff that matches wins.
const ROUTER = [image, pdf, csv, docx, xlsx, ics, json, pptx];
const f = (name, type = '') => ({ name, type });
// Which importer (by id) claims this file under router precedence?
const routeOf = (file) => ROUTER.find(i => i.sniff?.(file))?.id ?? null;

describe('importers · sniff routing (by extension)', () => {
  test('each extension routes to exactly its importer', () => {
    expect(routeOf(f('a.csv'))).toBe('csv');
    expect(routeOf(f('a.json'))).toBe('json');
    expect(routeOf(f('a.pdf'))).toBe('pdf');
    expect(routeOf(f('a.docx'))).toBe('docx');
    expect(routeOf(f('a.xlsx'))).toBe('xlsx');
    expect(routeOf(f('a.ics'))).toBe('ics');
    expect(routeOf(f('a.pptx'))).toBe('pptx');
    expect(routeOf(f('photo.PNG'))).toBe('image-batch');   // case-insensitive
    expect(routeOf(f('photo.jpeg'))).toBe('image-batch');
  });

  test('unknown extension routes nowhere', () => {
    expect(routeOf(f('a.bin'))).toBe(null);
    expect(routeOf(null)).toBe(null);
  });

  test('routes by MIME type when the name has no extension', () => {
    expect(routeOf(f('blob', 'text/csv'))).toBe('csv');
    expect(routeOf(f('blob', 'application/json'))).toBe('json');
    expect(routeOf(f('blob', 'application/pdf'))).toBe('pdf');
    expect(routeOf(f('blob', 'image/webp'))).toBe('image-batch');
    expect(routeOf(f('blob', 'text/calendar'))).toBe('ics');
    expect(routeOf(f('blob', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBe('docx');
  });

  test('no importer double-claims a given file', () => {
    for (const name of ['a.csv', 'a.json', 'a.pdf', 'a.docx', 'a.xlsx', 'a.ics', 'a.pptx', 'a.png']) {
      const claims = ROUTER.filter(i => i.sniff?.(f(name)));
      expect(claims).toHaveLength(1);
    }
  });
});

describe('importers · parseCsv', () => {
  test('comma-separated with header → label col + numeric value col', () => {
    const out = parseCsv('Region,Sales\nNorth,120\nSouth,80');
    expect(out.labels).toEqual(['North', 'South']);
    expect(out.values).toEqual([120, 80]);
    expect(out.headers).toEqual(['Region', 'Sales']);
  });

  test('auto-detects semicolon and tab separators', () => {
    expect(parseCsv('A;B\nx;5').values).toEqual([5]);
    expect(parseCsv('A\tB\nx\t7').values).toEqual([7]);
  });

  test('skips non-numeric value cells but keeps their labels', () => {
    const out = parseCsv('L,V\na,10\nb,notanumber\nc,30');
    expect(out.labels).toEqual(['a', 'b', 'c']);
    expect(out.values).toEqual([10, 30]); // 'notanumber' dropped
  });

  test('handles CRLF line endings and ignores blank lines', () => {
    const out = parseCsv('L,V\r\na,1\r\n\r\nb,2\r\n');
    expect(out.labels).toEqual(['a', 'b']);
    expect(out.values).toEqual([1, 2]);
  });

  test('empty input → empty series', () => {
    expect(parseCsv('')).toEqual({ labels: [], values: [] });
  });
});

describe('importers · chartDataFromJson', () => {
  test('array of {label,value} normalises straight through', () => {
    expect(chartDataFromJson([{ label: 'a', value: 3 }, { label: 'b', value: 5 }]))
      .toEqual([{ label: 'a', value: 3 }, { label: 'b', value: 5 }]);
  });

  test('array falls back to {name} for the label and 0 for bad values', () => {
    expect(chartDataFromJson([{ name: 'x', value: 'NaN' }]))
      .toEqual([{ label: 'x', value: 0 }]);
  });

  test('{ labels, values } pair is zipped by index', () => {
    expect(chartDataFromJson({ labels: ['a', 'b'], values: [1, 2] }))
      .toEqual([{ label: 'a', value: 1 }, { label: 'b', value: 2 }]);
  });

  test('returns null for shapes that are not chart-like', () => {
    expect(chartDataFromJson(null)).toBe(null);
    expect(chartDataFromJson({ foo: 'bar' })).toBe(null);
    expect(chartDataFromJson('a string')).toBe(null);
  });
});
