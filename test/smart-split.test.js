// "Text in Slides aufteilen" — paste a document, get one slide per heading.
//
// It cut at the right places and named every card correctly, and then threw the
// headline away: the heading line was stripped out of the markdown body and
// kept only as `opts.title`, which createSlideWithWidget is explicit about —
// it becomes the SLIDE's rail name and "never paints an <h1>". So the editor
// looked perfect (a tidy list of cards, each named after its section) and every
// slide on the wall was missing its own title.
//
// The degenerate case is worse than untidy: a section that is nothing but a
// heading — the last line of half the documents anyone pastes — was left with
// an empty body. A blank slide, correctly labelled in the rail.
//
// Pure: text in, slide objects out.

import { test, expect, describe } from './runner.js';
import { splitText } from '../admin/ai/smart-split.js';

const bodies = (slides) => slides.map(s => s.widgets[0].content.body);
const names = (slides) => slides.map(s => s.name ?? '');

const DOC = [
  '# Willkommen',
  'Hallo Welt.',
  '',
  '## Öffnungszeiten',
  'Mo–Fr 9–18',
  '',
  '## Kontakt',
].join('\n');

describe('smart split · the headline stays on the slide', () => {
  test('REGRESSION: every slide keeps the heading it was cut at', () => {
    const slides = splitText(DOC);
    expect(slides).toHaveLength(3);
    // The rail name is the heading text…
    expect(names(slides)).toEqual(['Willkommen', 'Öffnungszeiten', 'Kontakt']);
    // …and so is the first line of what the audience actually reads.
    expect(bodies(slides)[0]).toContain('# Willkommen');
    expect(bodies(slides)[0]).toContain('Hallo Welt.');
    expect(bodies(slides)[1]).toContain('## Öffnungszeiten');
  });

  test('REGRESSION: a section that is only a heading is not a blank slide', () => {
    const slides = splitText(DOC);
    expect(bodies(slides)[2]).toBe('## Kontakt');
    expect(bodies(slides).some(b => b.trim() === '')).toBeFalsy();
  });

  test('the heading level survives — h1 and h3 are not the same headline', () => {
    const slides = splitText('# Gross\neins\n\n### Klein\nzwei');
    expect(bodies(slides)).toEqual(['# Gross\neins', '### Klein\nzwei']);
  });

  test('text without headings stays one slide, unchanged', () => {
    const slides = splitText('Nur ein Absatz.\nUnd noch einer.');
    expect(slides).toHaveLength(1);
    expect(bodies(slides)[0]).toBe('Nur ein Absatz.\nUnd noch einer.');
    expect(names(slides)[0]).toBe('');
  });

  test('a preamble before the first heading becomes its own slide', () => {
    const slides = splitText('Vorwort.\n\n# Erstes\ninhalt');
    expect(slides).toHaveLength(2);
    expect(bodies(slides)[0]).toBe('Vorwort.');
    expect(names(slides)[0]).toBe('');            // no heading, no rail name
    expect(names(slides)[1]).toBe('Erstes');
  });

  test('empty input still yields one usable slide', () => {
    for (const v of ['', null, undefined]) {
      const slides = splitText(v);
      expect(slides).toHaveLength(1);
      expect(slides[0].widgets).toHaveLength(1);
      expect(slides[0].widgets[0].type).toBe('markdown');
    }
  });

  test('the caller decides duration and theme, and every slide gets them', () => {
    const slides = splitText(DOC, { defaultTheme: 'gradient-blue', durationPerSlide: 25 });
    expect(slides.every(s => s.duration === 25)).toBeTruthy();
    expect(slides.every(s => s.widgets[0].content.theme === 'gradient-blue')).toBeTruthy();
    // …and a full-bleed rect, because a split document is the whole slide.
    expect(slides[0].widgets[0].rect).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  test('a heading deeper than h3 is body text, not a cut', () => {
    // The splitter deliberately cuts at #, ## and ### only.
    const slides = splitText('# Eins\n#### Nicht schneiden\ntext');
    expect(slides).toHaveLength(1);
    expect(bodies(slides)[0]).toContain('#### Nicht schneiden');
  });
});
