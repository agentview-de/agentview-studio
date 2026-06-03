import { t } from '../../i18n.js';
import { searchableSelect } from './_combo.js';

function tzOptions() {
  let zones = [];
  try { zones = Intl.supportedValuesOf('timeZone'); } catch {}
  if (!zones.length) zones = ['UTC', 'Europe/Berlin', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney'];
  return zones.map(z => ({ value: z, label: z.replace(/_/g, ' ') }));
}

export function localTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export function renderTimezone(f, v, set) {
  return searchableSelect({
    options: tzOptions(),
    value: v ?? localTz(),
    placeholder: t('field.tzPlaceholder'),
    onChange: set,
  });
}
