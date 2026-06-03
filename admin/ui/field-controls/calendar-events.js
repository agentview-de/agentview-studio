// Calendar events editor — manual rows + one-time .ics import (local file
// or pasted text; never cross-origin fetch).
//
// Stores events as { start, end, summary, location, allDay } where start/end
// are datetime-local strings ("YYYY-MM-DDTHH:MM") — or date strings for all-day.

import { t, tx } from '../../i18n.js';
import { allEvents } from '../../../shared/ics-parse.js';
import { toast } from '../toast.js';
import { h } from './_shared.js';

const cpad = n => String(n).padStart(2, '0');
function dateToLocalInput(d, allDay) {
  const s = `${d.getFullYear()}-${cpad(d.getMonth() + 1)}-${cpad(d.getDate())}`;
  return allDay ? s : `${s}T${cpad(d.getHours())}:${cpad(d.getMinutes())}`;
}

export function renderCalendarEvents(f, v, set) {
  let events = Array.isArray(v) ? v.map(e => ({ ...e })) : [];
  const wrap = h('div', 'bb-cal-editor');
  const list = h('div', 'bb-cal-rows');
  const commit = () => set(events.map(e => ({ ...e })));

  const draw = () => {
    list.innerHTML = '';
    if (!events.length) { list.append(h('div', 'bb-cal-ed-empty', t('cal.empty'))); return; }
    events.forEach((ev, i) => {
      const allDay = !!ev.allDay;
      const start = h('input'); start.type = allDay ? 'date' : 'datetime-local'; start.value = ev.start ?? ''; start.title = t('cal.start');
      start.addEventListener('input', () => { ev.start = start.value; commit(); });
      const end = h('input'); end.type = allDay ? 'date' : 'datetime-local'; end.value = ev.end ?? ''; end.title = t('cal.end');
      end.addEventListener('input', () => { ev.end = end.value; commit(); });
      const title = h('input'); title.type = 'text'; title.placeholder = t('cal.title'); title.value = ev.summary ?? '';
      title.addEventListener('input', () => { ev.summary = title.value; commit(); });
      const loc = h('input'); loc.type = 'text'; loc.placeholder = t('cal.location'); loc.value = ev.location ?? '';
      loc.addEventListener('input', () => { ev.location = loc.value; commit(); });
      const adBox = h('input'); adBox.type = 'checkbox'; adBox.checked = allDay;
      adBox.addEventListener('change', () => {
        ev.allDay = adBox.checked;
        if (ev.start) ev.start = adBox.checked ? ev.start.slice(0, 10) : (ev.start.length <= 10 ? ev.start + 'T09:00' : ev.start);
        if (ev.end) ev.end = adBox.checked ? ev.end.slice(0, 10) : (ev.end.length <= 10 ? ev.end + 'T10:00' : ev.end);
        draw(); commit();
      });
      const ad = h('label', 'bb-cal-ed-allday'); ad.append(adBox, h('span', null, t('cal.allDay')));
      const del = h('button', 'bb-btn bb-btn-ghost', '✕'); del.type = 'button';
      del.setAttribute('aria-label', t('common.delete') + ' ' + tx('event') + ' ' + (i + 1));
      del.addEventListener('click', () => { events.splice(i, 1); draw(); commit(); });
      const top = h('div', 'bb-cal-ed-top'); top.append(title, del);
      const mid = h('div', 'bb-cal-ed-mid'); mid.append(start, end);
      const bot = h('div', 'bb-cal-ed-bot'); bot.append(loc, ad);
      const row = h('div', 'bb-cal-ed-row'); row.append(top, mid, bot);
      list.append(row);
    });
  };

  function importIcs(text) {
    let parsed; try { parsed = allEvents(text); } catch { parsed = []; }
    if (!parsed.length) { toast(t('cal.importNone'), { kind: 'warn' }); return; }
    events.push(...parsed.map(e => ({
      start: dateToLocalInput(e.start, e.allDay),
      end: e.end ? dateToLocalInput(e.end, e.allDay) : '',
      summary: e.summary || '', location: e.location || '', allDay: !!e.allDay,
    })));
    draw(); commit();
    toast(t('cal.imported', { n: parsed.length }), { kind: 'success' });
  }

  const toolbar = h('div', 'bb-cal-ed-toolbar');
  const fileBtn = h('button', 'bb-btn bb-btn-secondary bb-btn-sm', '📂 ' + t('cal.importFile')); fileBtn.type = 'button';
  const fileInp = h('input'); fileInp.type = 'file'; fileInp.accept = '.ics,text/calendar'; fileInp.style.display = 'none';
  fileBtn.addEventListener('click', () => fileInp.click());
  fileInp.addEventListener('change', async () => {
    const file = fileInp.files?.[0]; if (!file) return;
    try { importIcs(await file.text()); } catch { toast(t('cal.importFail'), { kind: 'error' }); }
    fileInp.value = '';
  });
  const pasteBtn = h('button', 'bb-btn bb-btn-secondary bb-btn-sm', '📋 ' + t('cal.importPaste')); pasteBtn.type = 'button';
  const addBtn = h('button', 'bb-btn bb-btn-secondary bb-btn-sm', '+ ' + t('cal.addEvent')); addBtn.type = 'button';
  addBtn.addEventListener('click', () => { events.push({ start: dateToLocalInput(new Date(Date.now() + 3600e3), false), summary: '' }); draw(); commit(); });
  toolbar.append(fileBtn, pasteBtn, addBtn, fileInp);

  const pastePanel = h('div', 'bb-table-paste'); pastePanel.hidden = true;
  const ta = h('textarea'); ta.placeholder = 'BEGIN:VCALENDAR…'; ta.rows = 5;
  const parseBtn = h('button', 'bb-btn bb-btn-primary bb-btn-sm', t('cal.importParse')); parseBtn.type = 'button';
  const cancelBtn = h('button', 'bb-btn bb-btn-ghost bb-btn-sm', t('common.cancel')); cancelBtn.type = 'button';
  const pasteActions = h('div', 'bb-table-paste-actions'); pasteActions.append(parseBtn, cancelBtn);
  pastePanel.append(ta, pasteActions);
  pasteBtn.addEventListener('click', () => { pastePanel.hidden = !pastePanel.hidden; if (!pastePanel.hidden) ta.focus(); });
  cancelBtn.addEventListener('click', () => { pastePanel.hidden = true; ta.value = ''; });
  parseBtn.addEventListener('click', () => { importIcs(ta.value); pastePanel.hidden = true; ta.value = ''; });

  wrap.append(toolbar, pastePanel, list);
  draw();
  return { el: wrap };
}
