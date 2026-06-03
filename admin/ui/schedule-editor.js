// Day-parting / date-range schedule editor for a single slide.

import { t } from '../i18n.js';

// Localised short weekday names — pulled from Intl so the labels match the
// rest of the studio (rather than hardcoded German/English hybrid). Falls
// back to ISO 8601 ordering (Mon=1 … Sun=7) which is what scheduler-core
// expects in the daysOfWeek array.
function shortDows() {
  try {
    const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
    // 2024-01-01 is a Monday — anchor to a known ISO Monday so the array
    // always starts Mon and ends Sun.
    return [...Array(7)].map((_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  } catch {
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  }
}

export function renderScheduleEditor(host, slide, onChange) {
  slide.schedule = slide.schedule ?? {};
  const s = slide.schedule;
  const dows = shortDows();
  host.innerHTML = `
    <div class="bb-form-row">
      <label>${t('sched.dow')}</label>
      <div class="bb-dow">
        ${dows.map((d, i) => `
          <label><input type="checkbox" data-dow="${i+1}" ${(s.daysOfWeek ?? []).includes(i+1) ? 'checked' : ''}> ${d}</label>
        `).join('')}
      </div>
    </div>
    <div class="bb-form-row">
      <label>${t('sched.timeRanges')}</label>
      <div class="bb-tr-list" id="tr-list">
        ${(s.timeRanges ?? []).map((r, i) => trRow(r, i)).join('')}
      </div>
      <button class="bb-btn bb-btn-secondary bb-tr-add" type="button">+ ${t('sched.addWindow')}</button>
    </div>
    <div class="bb-form-row">
      <label>${t('sched.dateRange')}</label>
      <div class="bb-dr">
        <input type="date" id="dr-from" value="${s.dateRange?.from ?? ''}">
        <span>→</span>
        <input type="date" id="dr-to" value="${s.dateRange?.to ?? ''}">
      </div>
    </div>
  `;

  host.querySelectorAll('[data-dow]').forEach(cb => {
    cb.addEventListener('change', () => {
      s.daysOfWeek = s.daysOfWeek ?? [];
      const d = +cb.dataset.dow;
      const ix = s.daysOfWeek.indexOf(d);
      if (cb.checked && ix === -1) s.daysOfWeek.push(d);
      else if (!cb.checked && ix !== -1) s.daysOfWeek.splice(ix, 1);
      cleanup(slide);
      onChange?.(slide);
    });
  });
  host.querySelector('.bb-tr-add').addEventListener('click', () => {
    s.timeRanges = s.timeRanges ?? [];
    s.timeRanges.push({ start: '09:00', end: '17:00' });
    onChange?.(slide);
    renderScheduleEditor(host, slide, onChange);
  });
  host.querySelector('#tr-list').addEventListener('input', e => {
    if (e.target.dataset.idx !== undefined) {
      const i = +e.target.dataset.idx;
      const which = e.target.dataset.tr;
      s.timeRanges[i][which] = e.target.value;
      cleanup(slide);
      onChange?.(slide);
    }
  });
  host.querySelector('#tr-list').addEventListener('click', e => {
    if (e.target.dataset.act === 'rm') {
      const i = +e.target.dataset.idx;
      s.timeRanges.splice(i, 1);
      onChange?.(slide);
      renderScheduleEditor(host, slide, onChange);
    }
  });
  host.querySelector('#dr-from').addEventListener('input', e => {
    s.dateRange = { ...(s.dateRange ?? {}), from: e.target.value || undefined };
    cleanup(slide); onChange?.(slide);
  });
  host.querySelector('#dr-to').addEventListener('input', e => {
    s.dateRange = { ...(s.dateRange ?? {}), to: e.target.value || undefined };
    cleanup(slide); onChange?.(slide);
  });
}

function trRow(r, i) {
  // Inline ✕ keeps removal one tap away; no title needed because it's adjacent
  // to its own row and the icon is universally recognised.
  return `
    <div class="bb-tr-row">
      <input type="time" data-idx="${i}" data-tr="start" value="${r.start}">
      <span>→</span>
      <input type="time" data-idx="${i}" data-tr="end" value="${r.end}">
      <button type="button" class="bb-iconbtn" data-act="rm" data-idx="${i}" title="${t('common.delete')}">✕</button>
    </div>
  `;
}

// Remove empty schedule fields so the JSON stays clean.
function cleanup(slide) {
  const s = slide.schedule;
  if (s.daysOfWeek && s.daysOfWeek.length === 0) delete s.daysOfWeek;
  if (s.timeRanges && s.timeRanges.length === 0) delete s.timeRanges;
  if (s.dateRange && !s.dateRange.from && !s.dateRange.to) delete s.dateRange;
  if (Object.keys(s).length === 0) delete slide.schedule;
}
