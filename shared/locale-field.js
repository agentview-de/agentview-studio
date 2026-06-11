// Schema-field factory for the audience-language select — return it straight
// into a plugin's schema().fields. Signage boxes routinely run an OS locale
// different from the AUDIENCE language (an English-locale player in a German
// foyer), so every widget that formats dates, weekday/month names or numbers
// via Intl offers this ONE field instead of silently following the device.
//
// The stored value is a BCP-47 tag or '' (= browser/device default). Render
// side: pass `c.locale || undefined` as the first argument to every Intl.*
// call / toLocale*String — `||`, never `??`, so the empty string falls through
// to the device default instead of throwing on an invalid tag.

// Option labels are native-language endonyms ('Deutsch', 'Français') so a
// user recognises their own language regardless of the Studio UI language —
// they are deliberately NOT translated via the overlay.
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
