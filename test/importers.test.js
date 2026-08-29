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
import { looksLikeHeader, sniffCsvSep, parseNumberColumn } from '../admin/importers/_helpers.js';
import { chartDataFromJson } from '../admin/importers/json.js';
import { setLocale, getLocale } from '../admin/i18n.js';
import { stripExt, labelValuePairs, barChartContent, splitCsvLine } from '../admin/importers/_helpers.js';

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

  test('REGRESSION: a non-numeric cell keeps its row in step', () => {
    // This case used to assert values [10, 30] against labels [a, b, c] — the
    // mechanics, not the meaning. Zipped for the chart that produced
    // a=10, b=30, c=0: from the first bad cell on, every label carried the NEXT
    // row's number. Right names, wrong figures, nothing to notice.
    const out = parseCsv('L,V\na,10\nb,notanumber\nc,30');
    expect(out.labels).toEqual(['a', 'b', 'c']);
    expect(out.values).toEqual([10, 0, 30]);
    expect(labelValuePairs(out.labels, out.values)).toEqual([
      { label: 'a', value: 10 },
      { label: 'b', value: 0 },
      { label: 'c', value: 30 },
    ]);
  });

  test('REGRESSION: a quoted label may contain the separator', () => {
    // Every spreadsheet quotes such a field on export, so this is the normal
    // case, not the exotic one. Split naively it became three fields: the label
    // cut in half and the number one column too far right — parsed as NaN,
    // dropped, and from there the whole series slid out of step.
    const out = parseCsv('Ort,Umsatz\n"Berlin, Mitte",120\n"Köln",80');
    expect(out.labels).toEqual(['Berlin, Mitte', 'Köln']);
    expect(out.values).toEqual([120, 80]);
  });

  test('a semicolon file with quoted labels survives too', () => {
    const out = parseCsv('Ort;Umsatz\n"Berlin; Mitte";7');
    expect(out.labels).toEqual(['Berlin; Mitte']);
    expect(out.values).toEqual([7]);
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

describe('importers · splitCsvLine', () => {
  test('plain fields split and trim', () => {
    expect(splitCsvLine('a, b ,c', ',')).toEqual(['a', 'b', 'c']);
  });

  test('a quoted field keeps its separators', () => {
    expect(splitCsvLine('"Berlin, Mitte",120', ',')).toEqual(['Berlin, Mitte', '120']);
    expect(splitCsvLine('"a;b";c', ';')).toEqual(['a;b', 'c']);
  });

  test('doubled quotes collapse to one literal quote', () => {
    expect(splitCsvLine('"Say ""hi""",x', ',')).toEqual(['Say "hi"', 'x']);
  });

  test('a quote in the MIDDLE of an unquoted field stays a character', () => {
    // 5" is a measurement, not the start of a quoted field.
    expect(splitCsvLine('5" Display,9', ',')).toEqual(['5" Display', '9']);
  });

  test('empty fields survive as empty strings, so the columns keep their index', () => {
    expect(splitCsvLine('a,,c', ',')).toEqual(['a', '', 'c']);
    expect(splitCsvLine('', ',')).toEqual(['']);
  });
});

// A pasted URL picks its widget. The provider branches used to test the whole
// string — /youtu\.?be/ and /vimeo\.com/ match anywhere, including inside a
// path — so a PDF whose filename contains "youtube" became an empty video
// embed. Marketing files really are named like that.
describe('importers · url-paste routing', () => {
  const typeOf = async (u) => (await urlPaste.convert(u)).slides[0].widgets[0].type;

  test('real provider URLs still route to the video widget', async () => {
    expect(await typeOf('https://www.youtube.com/watch?v=abc')).toBe('youtube');
    expect(await typeOf('https://m.youtube.com/watch?v=abc')).toBe('youtube');
    expect(await typeOf('https://youtu.be/abc')).toBe('youtube');
    expect(await typeOf('https://vimeo.com/12345')).toBe('youtube');
    expect(await typeOf('https://player.vimeo.com/video/12345')).toBe('youtube');
  });

  test('a pasted address without a scheme still resolves', async () => {
    expect(await typeOf('youtube.com/watch?v=abc')).toBe('youtube');
  });

  test('REGRESSION: a provider name inside the PATH does not hijack the file', async () => {
    expect(await typeOf('https://firma.de/prospekt-youtube-tipps.pdf')).toBe('pdf');
    expect(await typeOf('https://cdn.example.com/vimeo.com-tutorial.mp4')).toBe('video');
    expect(await typeOf('https://firma.de/bild-youtube.png')).toBe('image');
  });

  test('the extension branches keep working', async () => {
    expect(await typeOf('https://firma.de/preise.pdf')).toBe('pdf');
    expect(await typeOf('https://firma.de/kamera.m3u8')).toBe('stream-cam');
    expect(await typeOf('https://firma.de/news.rss')).toBe('rss');
    expect(await typeOf('https://firma.de/daten.json')).toBe('live-json');
    expect(await typeOf('https://firma.de/termine.ics')).toBe('iframe');
  });

  test('anything else becomes a sandboxed iframe, and empty input nothing at all', async () => {
    expect(await typeOf('https://firma.de/aktion')).toBe('iframe');
    expect(await urlPaste.convert('')).toBe(null);
    expect(await urlPaste.convert(null)).toBe(null);
  });
});

// What an importer writes into the playlist is the operator's document — and
// one of these strings goes further than the slide rail: the calendar heading
// is rendered on the display. They were all English regardless of the language
// the Studio was running in.
describe('importers · they speak the Studio’s language', () => {
  const ICS = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Teambesprechung\nDTSTART:20991103T090000Z\nEND:VEVENT\nEND:VCALENDAR';

  test('REGRESSION: the calendar heading follows the locale', async () => {
    const before = getLocale();
    try {
      setLocale('de');
      const de = await ics.convert(textFile('termine.ics', 'text/calendar', ICS));
      expect(de.slides[0].widgets[0].content.heading).toBe('Nächste Termine');
      setLocale('en');
      const en = await ics.convert(textFile('termine.ics', 'text/calendar', ICS));
      expect(en.slides[0].widgets[0].content.heading).toBe('Upcoming Events');
    } finally { setLocale(before); }
  });

  test('a pasted video is titled in the current language', async () => {
    const before = getLocale();
    try {
      setLocale('de');
      const r = await urlPaste.convert('https://youtu.be/abc');
      // 'Video' happens to be the same word in both — what matters is that it
      // goes through the overlay at all, so a future translation lands.
      expect(typeof (r.slides[0].name ?? r.slides[0].title)).toBe('string');
      expect((r.slides[0].name ?? r.slides[0].title).length > 0).toBeTruthy();
    } finally { setLocale(before); }
  });
});

describe('importers · is the first row a header, or is it data?', () => {
  test('REGRESSION: a file without a header keeps its first row', () => {
    // Both CSV and XLSX started at row 1, always. A file exported without a
    // header — cut/awk output, a database dump, "header row" unticked, a list
    // someone typed — lost its first line silently: three numbers went in and
    // a two-bar chart came out.
    const out = parseCsv('North,120\nSouth,80\nEast,50');
    expect(out.labels).toEqual(['North', 'South', 'East']);
    expect(out.values).toEqual([120, 80, 50]);
    expect(out.headers).toBe(null);
  });

  test('REGRESSION: a single headerless line is not an empty chart', () => {
    const out = parseCsv('North,120');
    expect(out.labels).toEqual(['North']);
    expect(out.values).toEqual([120]);
  });

  test('a real header is still recognised and still skipped', () => {
    const out = parseCsv('Region,Sales\nNorth,120\nSouth,80');
    expect(out.headers).toEqual(['Region', 'Sales']);
    expect(out.labels).toEqual(['North', 'South']);
  });

  test('a header whose value column is blank is still a header', () => {
    expect(parseCsv('Region,\nNorth,120').labels).toEqual(['North']);
  });

  test('looksLikeHeader answers the question directly', () => {
    expect(looksLikeHeader([['Region', 'Sales'], ['a', '1']])).toBe(true);
    expect(looksLikeHeader([['a', '1'], ['b', '2']])).toBe(false);
    expect(looksLikeHeader([['a', '1']])).toBe(false);       // one row is data
    expect(looksLikeHeader([])).toBe(false);
    expect(looksLikeHeader(null)).toBe(false);
  });
});

describe('importers · which character separates the columns', () => {
  test('REGRESSION: a separator inside quotes is not the separator', () => {
    // `line0.includes(';')` was blind to quoting, so an ordinary comma file
    // whose first label read "Berlin; Mitte" was read as semicolon-separated:
    // one column, the number swallowed into the label, a chart of zeroes.
    const out = parseCsv('"Berlin; Mitte",120\n"Köln",80');
    expect(out.labels).toEqual(['Berlin; Mitte', 'Köln']);
    expect(out.values).toEqual([120, 80]);
  });

  test('…including a tab inside quotes', () => {
    const out = parseCsv('"Berlin\tMitte",120\n"Köln",80');
    expect(out.values).toEqual([120, 80]);
  });

  test('and the mirror case: a comma inside a semicolon file', () => {
    const out = parseCsv('"Berlin, Mitte";120\n"Köln";80');
    expect(out.labels).toEqual(['Berlin, Mitte', 'Köln']);
    expect(out.values).toEqual([120, 80]);
  });

  test('the old precedence survives: tab beats semicolon beats comma', () => {
    expect(sniffCsvSep(['A\tB;C,D', 'x\t1;2,3'])).toBe('\t');
    expect(sniffCsvSep(['A;B,C', 'x;1,2'])).toBe(';');
    expect(sniffCsvSep(['A,B', 'x,1'])).toBe(',');
    expect(sniffCsvSep(['nothing splits here'])).toBe(',');
    expect(sniffCsvSep([])).toBe(',');
  });
});

describe('importers · German numbers are numbers', () => {
  test('REGRESSION: 1.234,56 is not 1.234', () => {
    // The standard German Excel export. parseFloat read this as 1.234 and
    // "12.000" as 12 — a revenue chart on a wall, off by a factor of a
    // thousand, with nothing to show for it.
    const out = parseCsv('Region;Umsatz\nNord;1.234,56\nSüd;987,40\nOst;12.000');
    expect(out.values).toEqual([1234.56, 987.4, 12000]);
  });

  test('English files are unchanged', () => {
    expect(parseCsv('Region,Sales\nNorth,1234.56\nSouth,987.40').values).toEqual([1234.56, 987.4]);
    expect(parseCsv('Region,Sales\nNorth,"1,234"\nSouth,"12,000"').values).toEqual([1234, 12000]);
  });

  test('currency, percent and grouping spaces are not part of the number', () => {
    expect(parseCsv('A;B\nx;€ 1.234,56\ny;6,2%').values).toEqual([1234.56, 6.2]);
    expect(parseCsv('A;B\nx;1 234,56').values).toEqual([1234.56]);
  });

  test('a cell carrying both marks settles the column on its own', () => {
    expect(parseNumberColumn(['1.234,56', '99'])).toEqual([1234.56, 99]);
    expect(parseNumberColumn(['1,234.56', '99'])).toEqual([1234.56, 99]);
  });

  test('a column that cannot decide falls back to the caller hint', () => {
    // Every mark has exactly three digits behind it — grouping and decimal are
    // indistinguishable, so the file's own separator decides.
    expect(parseNumberColumn(['1.234', '12.000'], { commaDecimal: true })).toEqual([1234, 12000]);
    expect(parseNumberColumn(['1.234', '12.000'], { commaDecimal: false })).toEqual([1.234, 12]);
  });

  test('one unambiguous cell speaks for the whole column', () => {
    // "9,5" can only be a fraction, so "1.234" beside it is grouping.
    expect(parseNumberColumn(['1.234', '9,5'])).toEqual([1234, 9.5]);
    expect(parseNumberColumn(['1,234', '9.5'])).toEqual([1234, 9.5]);
  });

  test('a cell with no number in it stays out of the count', () => {
    const out = parseNumberColumn(['n/a', '', null, '12,5']);
    expect(Number.isNaN(out[0])).toBe(true);
    expect(out[3]).toBe(12.5);
  });
});
