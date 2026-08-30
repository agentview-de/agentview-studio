// Change Case — the character transform behind the Aa button.
//
// Worth testing properly because two of the four modes have rules you cannot
// eyeball ("what counts as a word", "what counts as a sentence"), and because
// the locale-aware paths change the LENGTH of the string, which is exactly where
// a naive implementation quietly corrupts somebody's headline.

import { test, expect, describe } from './runner.js';
import { changeCase, nextCaseMode, CASE_MODES } from '../shared/utils/text-case.js';

describe('upper / lower', () => {
  test('the obvious cases', () => {
    expect(changeCase('hello world', 'upper')).toBe('HELLO WORLD');
    expect(changeCase('HELLO WORLD', 'lower')).toBe('hello world');
  });

  test('German ß uppercases to SS — the string gets longer', () => {
    // A transform that assumed 1:1 character mapping would either truncate this
    // or leave the ß in a line of capitals.
    expect(changeCase('straße', 'upper')).toBe('STRASSE');
  });

  test('accents survive both directions', () => {
    expect(changeCase('Müllerstraße Öl', 'upper')).toBe('MÜLLERSTRASSE ÖL');
    expect(changeCase('MÜNCHEN', 'lower')).toBe('münchen');
  });

  test('a locale changes the answer where it should', () => {
    // Turkish dotless ı / dotted İ. Without the locale, "i" uppercases to "I",
    // which is a different letter in Turkish.
    expect(changeCase('istanbul', 'upper', 'tr')).toBe('İSTANBUL');
    expect(changeCase('istanbul', 'upper', 'en')).toBe('ISTANBUL');
  });
});

describe('title', () => {
  test('each word gets a capital', () => {
    expect(changeCase('opening hours today', 'title')).toBe('Opening Hours Today');
  });

  test('SHOUTED input becomes Title Case rather than staying shouted', () => {
    // "Capitalize each word" on all-caps has to do something; leaving it alone
    // is the one answer nobody wants.
    expect(changeCase('LIFT B OUT OF SERVICE', 'title')).toBe('Lift B Out Of Service');
  });

  test('an apostrophe does not start a new word', () => {
    // "Don'T" is the classic bug.
    expect(changeCase("don't panic", 'title')).toBe("Don't Panic");
    expect(changeCase('o’brien’s bar', 'title')).toBe('O’brien’s Bar');
  });

  test('hyphens and slashes DO start a new word', () => {
    expect(changeCase('drop-off point', 'title')).toBe('Drop-Off Point');
    expect(changeCase('open/closed', 'title')).toBe('Open/Closed');
  });

  test('a word after a digit or a bracket still capitalises', () => {
    expect(changeCase('room 3 open', 'title')).toBe('Room 3 Open');
    expect(changeCase('(closed today)', 'title')).toBe('(Closed Today)');
  });

  test('leading whitespace does not eat the first capital', () => {
    expect(changeCase('  hello', 'title')).toBe('  Hello');
  });
});

describe('sentence', () => {
  test('one sentence gets one capital', () => {
    expect(changeCase('maintenance until friday.', 'sentence')).toBe('Maintenance until friday.');
  });

  test('every sentence after . ! ? gets one', () => {
    expect(changeCase('one. two! three? four', 'sentence')).toBe('One. Two! Three? Four');
  });

  test('an ellipsis ends a sentence too', () => {
    expect(changeCase('wait… then go', 'sentence')).toBe('Wait… Then go');
  });

  test('a closing quote or bracket between the stop and the next word', () => {
    expect(changeCase('"stop." then go', 'sentence')).toBe('"stop." Then go');
  });

  test('a full stop with no space after is NOT a sentence break', () => {
    // Otherwise every decimal and every filename would start a new sentence.
    expect(changeCase('version 1.2 is out', 'sentence')).toBe('Version 1.2 is out');
  });

  test('SHOUTED input comes back readable', () => {
    expect(changeCase('LIFT B OUT OF SERVICE. USE LIFT A.', 'sentence'))
      .toBe('Lift b out of service. Use lift a.');
  });
});

describe('edges', () => {
  test('empty and missing input come back as an empty string, not a crash', () => {
    for (const mode of CASE_MODES) {
      expect(changeCase('', mode)).toBe('');
      expect(changeCase(null, mode)).toBe('');
      expect(changeCase(undefined, mode)).toBe('');
      expect(changeCase(42, mode)).toBe('');
    }
  });

  test('an unknown mode returns the text untouched', () => {
    expect(changeCase('Hello There', 'sideways')).toBe('Hello There');
  });

  test('whitespace-only text is preserved exactly', () => {
    expect(changeCase('   \n  ', 'title')).toBe('   \n  ');
  });

  test('text with no letters is preserved exactly', () => {
    expect(changeCase('123 — 456', 'title')).toBe('123 — 456');
    expect(changeCase('123 — 456', 'sentence')).toBe('123 — 456');
  });
});

describe('fragments · the `prefix` option', () => {
  // A rich-text selection is a RUN of text nodes with markup between them, so
  // each piece is transformed separately. Without the prefix, every piece looks
  // like the start of the text: "lift <b>b</b> out of service." sentence-cased
  // to "Lift <b>B</b> Out of service." — one capital per fragment.
  const fragments = ['lift ', 'b', ' out of service. use lift a.'];
  const join = (mode) => {
    let prefix = '';
    return fragments.map(f => {
      const out = changeCase(f, mode, { prefix });
      prefix += f;
      return out;
    }).join('');
  };

  test('REGRESSION: sentence case across fragments capitalises SENTENCES, not pieces', () => {
    expect(join('sentence')).toBe('Lift b out of service. Use lift a.');
  });

  test('title case across fragments still capitalises every word once', () => {
    expect(join('title')).toBe('Lift B Out Of Service. Use Lift A.');
  });

  test('a fragment that continues a word does not get a capital', () => {
    // "light" split as "lig" + "ht" must not become "LigHt".
    expect(changeCase('ht', 'title', { prefix: 'lig' })).toBe('ht');
    expect(changeCase('ht', 'sentence', { prefix: 'lig' })).toBe('ht');
  });

  test('a fragment right after a space DOES start a word', () => {
    expect(changeCase('house', 'title', { prefix: 'the ' })).toBe('House');
  });

  test('a fragment right after a full stop DOES start a sentence', () => {
    expect(changeCase('then go', 'sentence', { prefix: 'stop. ' })).toBe('Then go');
  });

  test('an empty prefix behaves exactly as no prefix at all', () => {
    for (const mode of CASE_MODES) {
      expect(changeCase('hello there', mode, { prefix: '' })).toBe(changeCase('hello there', mode));
    }
  });

  test('upper and lower ignore the prefix — they have no boundaries', () => {
    expect(changeCase('abc', 'upper', { prefix: 'xyz' })).toBe('ABC');
    expect(changeCase('ABC', 'lower', { prefix: 'xyz' })).toBe('abc');
  });

  test('a length-changing transform still only strips the one glued character', () => {
    // 'ß' uppercases to 'SS'; the glued 'a' must not take a real character with
    // it when it is removed.
    expect(changeCase('ßab', 'title', { prefix: 'x' })).toBe('ßab');
  });
});

describe('the options argument', () => {
  test('a bare locale string is still accepted', () => {
    expect(changeCase('istanbul', 'upper', 'tr')).toBe('İSTANBUL');
    expect(changeCase('istanbul', 'upper', { locale: 'tr' })).toBe('İSTANBUL');
  });
  test('a missing or null options object is not a crash', () => {
    expect(changeCase('hello', 'upper', null)).toBe('HELLO');
    expect(changeCase('hello', 'upper', undefined)).toBe('HELLO');
    expect(changeCase('hello', 'upper')).toBe('HELLO');
  });
});

describe('nextCaseMode', () => {
  test('it cycles through every mode and comes back round', () => {
    const seen = [];
    let m = CASE_MODES[0];
    for (let i = 0; i < CASE_MODES.length; i++) { seen.push(m); m = nextCaseMode(m); }
    expect(seen).toEqual([...CASE_MODES]);
    expect(m).toBe(CASE_MODES[0]);
  });

  test('an unknown mode enters the cycle rather than sticking', () => {
    // indexOf gives -1, so the next one is index 0 — the cycle starts.
    expect(nextCaseMode('nonsense')).toBe(CASE_MODES[0]);
  });
});
