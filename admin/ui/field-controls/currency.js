import { t } from '../../i18n.js';
import { CURRENCIES } from '../../../shared/data/currencies.js';
import { searchableSelect } from './_combo.js';

export function renderCurrency(f, v, set) {
  return searchableSelect({
    options: CURRENCIES.map(c => ({ value: c.code, label: `${c.code} — ${c.name}`, hint: c.symbol })),
    value: (v ?? 'EUR'),
    placeholder: t('field.currencyPlaceholder'),
    onChange: set,
  });
}
