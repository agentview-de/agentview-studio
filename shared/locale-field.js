// Schema-field factory for the audience-language select — return it straight
// into a plugin's schema().fields. Signage boxes routinely run an OS locale
// different from the AUDIENCE language (an English-locale player in a German
// foyer), so every widget that formats dates, weekday/month names or numbers
// via Intl offers this ONE field instead of silently following the device.
//
// The stored value is a BCP-47 tag or '' (= browser/device default). Render
// side: pass `safeLocale(c.locale)` as the first argument to every Intl.* call
// / toLocale*String — never the raw value, and never `??` (the empty string has
// to fall through to the device default).

// Option labels are native-language endonyms ('Deutsch', 'Français') so a
// user recognises their own language regardless of the Studio UI language —
// they are deliberately NOT translated via the overlay.
// The render-side gate for a stored tag.
//
// The field below is a select, but a playlist is JSON: an import, a hand edit,
// or an export from a system that writes POSIX names ("de_DE") can put a tag in
// here that Intl REFUSES. `new Intl.DateTimeFormat('de_DE')` does not fall back
// to the device — it throws RangeError, and the widget's whole render goes down
// with it, on a screen nobody is standing in front of. One gate, so a typo in
// an optional field costs the audience's language and nothing else.
//
// Cached: clock-like widgets re-render every second, and a rejected tag would
// otherwise pay for a thrown exception every time.
const CHECKED = new Map();
export function safeLocale(tag) {
  const t = typeof tag === 'string' ? tag.trim() : '';
  if (!t) return undefined;
  if (CHECKED.has(t)) return CHECKED.get(t);
  let ok;
  try { Intl.DateTimeFormat.supportedLocalesOf(t); ok = t; } catch { ok = undefined; }
  CHECKED.set(t, ok);
  return ok;
}

export const LOCALE_OPTIONS = [
  { value: '',      label: 'Browser default' },
  { value: 'de',    label: 'Deutsch' },
  { value: 'de-AT', label: 'Deutsch (Österreich)' },
  { value: 'de-CH', label: 'Deutsch (Schweiz)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'fr',    label: 'Français' },
  { value: 'it',    label: 'Italiano' },
  { value: 'es',    label: 'Español' },
  { value: 'nl',    label: 'Nederlands' },
  { value: 'pl',    label: 'Polski' },
  { value: 'tr',    label: 'Türkçe' },
  { value: 'cs',    label: 'Čeština' },
  { value: 'da',    label: 'Dansk' },
  { value: 'sv',    label: 'Svenska' },
  { value: 'no',    label: 'Norsk' },
  { value: 'fi',    label: 'Suomi' },
  { value: 'pt',    label: 'Português' },
  { value: 'ja',    label: '日本語' },
  { value: 'zh-CN', label: '中文（简体）' },
];

// Pass a custom label where a widget wants more than the bare 'Language'.
// `search: true` upgrades the long list to the searchable combobox once the
// inspector supports it; the plain select renderer ignores the flag.
export function localeField(label = 'Language') {
  return {
    key: 'locale', type: 'select', label, options: LOCALE_OPTIONS, search: true,
    help: 'Dates, weekday names and numbers follow this language — independent of the player device’s OS language.',
  };
}
