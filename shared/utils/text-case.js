// Change Case — UPPER / lower / Title / Sentence, on a run of text.
//
// PowerPoint's Aa button, and the reason it exists there rather than as a CSS
// `text-transform`: the characters themselves change, so the text stays that way
// when it is copied out, exported, or read by a screen reader. A CSS transform
// looks identical on screen and is a lie everywhere else.
//
// Pure and locale-aware. Locale matters more than it looks: German ß uppercases
// to SS (so the string gets LONGER), and Turkish i/İ is a different letter from
// the ASCII one. Passing the UI locale through means the button does the right
// thing for the language the text is actually in, rather than for English.

export const CASE_MODES = Object.freeze(['upper', 'lower', 'title', 'sentence']);

// A "word" starts after anything that is not a letter, a digit, or an
// apostrophe. Apostrophes are excluded from the boundary on purpose: "o'brien"
// is one word and should title-case to "O'Brien", not "O'Brien" via two words —
// which is the same result here, but "don't" must not become "Don'T".
const WORD_START = /(^|[^\p{L}\p{N}'’])(\p{L})/gu;

// A sentence starts at the beginning, or after . ! ? … followed by space.
// Deliberately not clever about abbreviations: "e.g. this" becoming "E.g. This"
// is the price of a rule you can predict, and predictable beats usually-right
// for a button you press on your own text and then read.
const SENTENCE_START = /(^\s*|[.!?…]["'”’)\]]?\s+)(\p{L})/gu;

// Does `text` begin a new word / sentence, given what came immediately before it?
//
// This is the whole reason `prefix` exists. A rich-text selection is not one
// string — it is a run of text nodes with markup between them — and transforming
// each node on its own makes every fragment look like the start of the text.
// "lift <b>b</b> out of service." sentence-cased per node came out as
// "Lift <b>B</b> Out of service.": three fragments, three capitals.
function opensBoundary(prefix, mode) {
  if (!prefix) return true;
  if (mode === 'title') return !/[\p{L}\p{N}'’]$/u.test(prefix);
  return /^\s*$/.test(prefix) || /[.!?…]["'”’)\]]?\s+$/u.test(prefix);
}

/**
 * @param text   the run to transform
 * @param mode   one of CASE_MODES
 * @param opts   { locale, prefix } — `prefix` is the text immediately BEFORE
 *               this run, used only to decide whether the run starts a word or
 *               a sentence. It is never part of the result.
 */
export function changeCase(text, mode, opts = {}) {
  // Always a string out. `text ?? ''` looked equivalent and was not: a number in
  // came a number back, so a caller that fed this a value it had not checked got
  // a non-string where it was about to call .length or splice it into HTML.
  if (typeof text !== 'string') return '';
  if (!text) return text;
  // A bare locale string is still accepted — it is the common call and reads
  // better than `{ locale: 'de' }` at the only two sites that need it.
  const { locale, prefix = '' } = typeof opts === 'string' ? { locale: opts } : (opts ?? {});
  const up = (s) => (locale ? s.toLocaleUpperCase(locale) : s.toUpperCase());
  const low = (s) => (locale ? s.toLocaleLowerCase(locale) : s.toLowerCase());

  if (mode === 'upper') return up(text);
  if (mode === 'lower') return low(text);
  if (mode !== 'title' && mode !== 'sentence') return text;

  // When the run does NOT start a boundary, transform it with a single letter
  // glued to the front and drop that letter again. The letter makes the regexes
  // see a continuing word / a mid-sentence position without either of them
  // having to learn about fragments — and 'a' is one character in every case
  // mapping, so the offset to strip is always 1.
  const open = opensBoundary(prefix, mode);
  const subject = open ? text : 'a' + text;
  // Lowercase first, so SHOUTED text becomes Title/Sentence case rather than
  // staying shouted — that transform on all-caps input has to do something, and
  // leaving it untouched is the one answer nobody wants.
  const re = mode === 'title' ? WORD_START : SENTENCE_START;
  const out = low(subject).replace(re, (_, before, ch) => before + up(ch));
  return open ? out : out.slice(1);
}

// What pressing the button AGAIN should do.
//
// PowerPoint cycles Sentence → UPPER → lower → Title with repeated presses of
// Shift+F3, which is how people actually use it: you press until it looks right
// rather than deciding the mode first. Returns the next mode in that cycle.
export function nextCaseMode(mode) {
  const i = CASE_MODES.indexOf(mode);
  return CASE_MODES[(i + 1) % CASE_MODES.length];
}
