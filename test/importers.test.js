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
import * as urlPaste from '../admin/importers/url-paste.js';
import { parseCsv } from '../admin/importers/csv.js';
import { chartDataFromJson } from '../admin/importers/json.js';
import { stripExt, labelValuePairs, barChartContent } from '../admin/importers/_helpers.js';

// A minimal File stand-in for the pure text importers (csv/json/ics only read
// .text()/.name/.type — no DOM, no vendored lib).
const textFile = (name, type, text) => ({ name, type, text: async () => text });
// The one widget every single-content importer must produce. Guards the bug
// where createSlide(type, props) dropped its props and yielded widgets: [].
const onlyWidget = (result) => {
  expect(result.slides).toHaveLength(1);
  expect(result.slides[0].widgets).toHaveLength(1);
  return result.slides[0].widgets[0];
};

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

describe('importers · _helpers', () => {
  test('stripExt drops the final extension, keeps intermediate dots', () => {
    expect(stripExt('sales.csv')).toBe('sales');
    expect(stripExt('report.2024.q1.xlsx')).toBe('report.2024.q1');
    expect(stripExt('noext')).toBe('noext');
  });

  test('stripExt returns the fallback for empty / extension-only names', () => {
    expect(stripExt('', 'PDF')).toBe('PDF');
    expect(stripExt(null, 'PDF')).toBe('PDF');
    expect(stripExt('.gitignore', 'X')).toBe('X'); // nothing before the dot
  });

  test('labelValuePairs zips parallel arrays, missing values → 0', () => {
    expect(labelValuePairs(['a', 'b', 'c'], [1, 2])).toEqual([
      { label: 'a', value: 1 }, { label: 'b', value: 2 }, { label: 'c', value: 0 },
    ]);
  });

  test('barChartContent wraps pairs in the shared chart shape', () => {
    const c = barChartContent([{ label: 'a', value: 1 }]);
    expect(c.kind).toBe('bar');
    expect(c.source).toBe('inline');
    expect(c.theme).toBe('corporate-blue');
    expect(c.data).toEqual([{ label: 'a', value: 1 }]);
  });
});

// Regression guard for the createSlide(type, props) drift: importers must build
// a Slide with a real widget carrying the parsed content — not an empty slide.
// Only the DOM-free importers (url-paste string input; csv/json/ics via a File
// stand-in) run here; the vendored binary importers are covered in the browser.
describe('importers · convert() builds a populated slide', () => {
  test('url-paste routes each URL to the right widget type + content', async () => {
    const yt = onlyWidget(await urlPaste.convert('https://youtu.be/abc'));
    expect(yt.type).toBe('youtube');
    expect(yt.content.url).toBe('https://youtu.be/abc');
    expect(yt.content.provider).toBe('youtube');

    expect(onlyWidget(await urlPaste.convert('https://x.test/a.png')).type).toBe('image');
    expect(onlyWidget(await urlPaste.convert('https://x.test/a.mp4')).type).toBe('video');
    expect(onlyWidget(await urlPaste.convert('https://x.test/a.pdf')).type).toBe('pdf');
    expect(onlyWidget(await urlPaste.convert('https://x.test/feed.rss')).type).toBe('rss');
    expect(onlyWidget(await urlPaste.convert('https://x.test/data.json')).type).toBe('live-json');

    // Unknown URL falls back to a sandboxed iframe carrying the URL.
    const fb = onlyWidget(await urlPaste.convert('https://example.com/page'));
    expect(fb.type).toBe('iframe');
    expect(fb.content.url).toBe('https://example.com/page');
    expect(fb.content.sandbox).toBe(true);
  });

  test('url-paste returns null for an empty URL', async () => {
    expect(await urlPaste.convert('   ')).toBe(null);
  });

  test('csv → chart widget with the parsed series and a stripped title', async () => {
    const res = await csv.convert(textFile('sales.csv', 'text/csv', 'Region,Sales\nNorth,120\nSouth,80'));
    const w = onlyWidget(res);
    expect(w.type).toBe('chart');
    expect(w.content.kind).toBe('bar');
    expect(w.content.data).toEqual([{ label: 'North', value: 120 }, { label: 'South', value: 80 }]);
    expect(res.slides[0].name).toBe('sales');
    expect(res.slides[0].duration).toBe(12);
  });

  test('json chart-shaped → chart widget; otherwise → live-json viewer', async () => {
    const chartW = onlyWidget(await json.convert(textFile('d.json', 'application/json', '[{"label":"a","value":3}]')));
    expect(chartW.type).toBe('chart');
    expect(chartW.content.data).toEqual([{ label: 'a', value: 3 }]);

    const viewerW = onlyWidget(await json.convert(textFile('d.json', 'application/json', '{"unrelated":true}')));
    expect(viewerW.type).toBe('live-json');
  });

  test('ics → calendar widget carrying the parsed events', async () => {
    const ical = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Standup\nDTSTART:20990101T090000Z\nEND:VEVENT\nEND:VCALENDAR';
    const w = onlyWidget(await ics.convert(textFile('team.ics', 'text/calendar', ical)));
    expect(w.type).toBe('calendar');
    expect(w.content.heading).toBe('Upcoming Events');
    expect(w.content.items.length).toBeTruthy();
    expect(w.content.items[0].desc).toBe('Standup');
  });
});
