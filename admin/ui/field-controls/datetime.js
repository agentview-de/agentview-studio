// Datetime + timezone picker → absolute instant. Value shape: { at: <epoch ms>, tz: <IANA> }.

import { t } from '../../i18n.js';
import { h } from './_shared.js';
import { renderTimezone, localTz } from './timezone.js';

function tzOffsetMs(epoch, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(epoch)).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - epoch;
}

export function wallToEpoch(wallStr, tz) {
  const [d, tm] = String(wallStr).split('T');
  if (!d || !tm) return null;
  const [Y, Mo, D] = d.split('-').map(Number);
  const [hh, mi] = tm.split(':').map(Number);
  const naive = Date.UTC(Y, Mo - 1, D, hh, mi);
  let epoch = naive - tzOffsetMs(naive, tz);
  epoch = naive - tzOffsetMs(epoch, tz); // second pass settles DST boundaries
  return epoch;
}

export function epochToWall(epoch, tz) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(epoch)).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function renderDatetime(f, v, set) {
  const val = (v && typeof v === 'object') ? { ...v } : {};
  if (val.at == null) { val.at = Date.now() + 3600e3; }
  if (!val.tz) val.tz = localTz();

  const wrap = h('div', 'bb-datetime');
  const dt = h('input');
  dt.type = 'datetime-local';
  dt.value = epochToWall(val.at, val.tz);

  const tzRow = h('div', 'bb-datetime-tz');
  const tzLabel = h('span', 'bb-datetime-tzlabel', t('field.timezone'));
  const tzCtrl = renderTimezone(f, val.tz, tz => {
    val.tz = tz;
    val.at = wallToEpoch(dt.value, val.tz);
    set({ ...val });
  });
  tzRow.append(tzLabel, tzCtrl.el);

  dt.addEventListener('input', () => {
    if (!dt.value) return;
    val.at = wallToEpoch(dt.value, val.tz);
    set({ ...val });
  });
  wrap.append(dt, tzRow);
  return { el: wrap };
}
