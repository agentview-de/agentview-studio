// Generic form renderer driven by a plugin's schema(). Returns a
// { root, value, setValue, dispose } — dispose() tears down every control
// that holds document-level listeners or timers (rich-text et al).
//
// Each field type maps to one input control. The whole form is reactive:
// whenever any input changes, the supplied onChange(newValue) fires with the
// current values object.

import {
  renderLocation, renderDatetime, renderTimezone, renderDuration, renderCurrency, renderTable, renderFeed, renderFeedList,
  renderTheme, renderPlace, renderIcon, renderShape, renderCalendarEvents, renderRichText,
} from './field-controls.js';
import { renderAlign } from './field-controls/align.js';
import { searchableSelect } from './field-controls/_combo.js';
import { probeUrl } from './probe.js';
import { openModal } from './modal.js';
import { sanitizeHtml } from '../../shared/sanitize-html.js';
import { t, tx } from '../i18n.js';
import { registerControl, getControl } from './field-controls/registry.js';
import { filterFieldsByTier } from './tier-filter.js';
import { loadCollapsed, saveCollapsed } from './fold-section.js';
import { escapeHtml as esc } from '../../shared/utils/escape.js';
import { uiIconSvg } from '../../shared/data/ui-icons.js';

// Register the rich field controls (each its own module) into the control
// registry — the seam renderField() dispatches through first, mirroring the
// widget-plugin registry. Adding or overriding one of these is now a
// registration, not a new switch arm; a plugin could register its own. The
// simple native inputs (text/number/select/toggle/…) stay inline in
// renderField() below as the built-in fast path.
registerControl('location', renderLocation);
registerControl('datetime', renderDatetime);
registerControl('timezone', renderTimezone);
registerControl('duration', renderDuration);
registerControl('currency', renderCurrency);
registerControl('table', renderTable);
registerControl('calendar-events', renderCalendarEvents);
registerControl('feed', renderFeed);
registerControl('feed-list', renderFeedList);
registerControl('rich-text', renderRichText);
registerControl('theme', renderTheme);
registerControl('place', renderPlace);
registerControl('icon', renderIcon);
registerControl('shape', renderShape);
registerControl('align', renderAlign);

// Collapse-state persistence (loadCollapsed / saveCollapsed) is shared with the
// widget inspector's below-form blocks — see admin/ui/fold-section.js for the
// storage-key convention both must agree on.

// Stable section identifier — explicit `key` wins, else fall back to the label
// (slugified). Avoids storage-key collisions between different schemas.
function sectionKeyFor(f) {
  if (f.key) return f.key;
  return String(f.label ?? 'unnamed').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

// Controls taller than ~2 rows. Only these get auto-wrapped into their own
// collapsible fold when they sit outside an explicit section — light scalar
// inputs (text, number, select, toggle, …) render as plain labelled groups so
// flat schemas stop reading as N single-field folds. Field-level `fold: true`
// forces the fold; the buildForm option `autoFold: 'all'` restores the old
// wrap-everything behavior verbatim.
const HEAVY_FIELD_TYPES = new Set([
  'rich-text', 'table', 'list', 'feed-list', 'calendar-events',
  'markdown', 'code', 'textarea', 'location', 'icon', 'shape', 'theme',
]);

export function buildForm({ schema, value, onChange, assetPicker, assetsPicker, codePicker, formKey, defaults, autoFold, tierFilter }) {
  const root = document.createElement('div');
  root.className = 'bb-form';
  const refs = new Map(); // key → control element

  const cur = structuredCloneSafe(value);
  const groups = [];
  const sections = [];        // every fold (explicit + auto) → expand/collapse all
  const summaryUpdaters = []; // closed-state header summaries, re-run on change
  const validators = [];      // ALL field validators — cross-field rules need every change
  const resetUpdaters = [];   // per-field ↺ visibility, re-run on change
  let searchTerm = '';        // active field-filter (lowercased), '' = off
  let noResults = null;       // "No matching settings" hint, toggled by search
  let disposed = false;

  // Wrap any element in a `.bb-form-section` with a clickable header. Used
  // both for explicit `type: 'section'` schema entries and for auto-wrapping
  // heavy content fields below. `def` carries the optional header extras:
  //   icon    — emoji or raw SVG markup rendered before the label
  //   help    — muted line at the top of the body (visible while open)
  //   summary — (content) => string, right-aligned muted header text while
  //             collapsed; re-evaluated on every value change + on toggle
  // Auto-folds get a modifier class so explicit sections keep visual seniority.
  function buildSection(def, { auto = false } = {}) {
    const section = document.createElement('section');
    section.className = auto ? 'bb-form-section bb-form-section-auto' : 'bb-form-section';
    const initial = loadCollapsed(formKey, def.key, !!def.collapsed);
    if (initial) section.classList.add('bb-form-section-closed');
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'bb-form-section-head';
    const icon = def.icon
      ? `<span class="bb-form-section-icon">${String(def.icon).trimStart().startsWith('<') ? def.icon : esc(def.icon)}</span> `
      : '';
    head.innerHTML = `<span class="bb-form-section-chev">▾</span> ${icon}<span class="bb-form-section-label">${esc(def.label ?? '')}</span>`;
    if (typeof def.summary === 'function') {
      const sum = document.createElement('span');
      sum.className = 'bb-form-section-summary';
      head.appendChild(sum);
      const update = () => {
        if (!section.classList.contains('bb-form-section-closed')) { sum.textContent = ''; return; }
        try { sum.textContent = def.summary(cur) ?? ''; } catch { sum.textContent = ''; }
      };
      summaryUpdaters.push(update);
      update();
    }
    const body = document.createElement('div');
    body.className = 'bb-form-section-body';
    if (def.help) {
      const help = document.createElement('p');
      help.className = 'bb-form-help bb-form-section-help';
      help.textContent = tx(def.help);
      body.appendChild(help);
    }
    const setCollapsed = collapsed => {
      section.classList.toggle('bb-form-section-closed', collapsed);
      saveCollapsed(formKey, def.key, collapsed);
      for (const u of summaryUpdaters) u();
    };
    head.addEventListener('click', () => setCollapsed(!section.classList.contains('bb-form-section-closed')));
    section.append(head, body);
    sections.push({ setCollapsed });
    return { section, body };
  }

  // Build a single field-group node (label + control + help + msg). Extracted
  // so the section and row layouts can re-use it without duplicating logic.
  // `suppressLabel` skips the field's own <label> — used when the field lives
  // inside an auto-section whose header already shows the label.
  // `suppressHelp` skips the field's own help line — used by row clusters,
  // which render one combined help line below the cluster instead.
  function mountField(f, { suppressLabel = false, suppressHelp = false } = {}) {
    const group = document.createElement('div');
    group.className = `bb-form-group bb-form-${f.type}`;
    // Tag the wrapper with its content key so a host (e.g. the Widget Designer)
    // can bridge controls to the rendered element they drive — hover a control
    // to glow the matching [data-field] in the preview, click the element to
    // focus its control. Purely additive; ignored everywhere else.
    if (f.key != null) group.dataset.fieldKey = f.key;

    // Per-field reset: a small ghost ↺ next to the label (hover-revealed)
    // whenever the value differs from the caller-supplied defaults. Resets
    // through the normal commit path, so canvas refresh + undo behave like
    // any other edit — no confirm needed.
    const wantReset = !!defaults && f.key != null;
    let resetBtn = null, labelRow = null;
    if (!suppressLabel || wantReset) {
      labelRow = document.createElement('div');
      labelRow.className = 'bb-form-labelrow';
      if (!suppressLabel) {
        const lbl = document.createElement('label');
        lbl.textContent = tx(f.label) ?? f.key;
        labelRow.appendChild(lbl);
      }
      if (wantReset) {
        resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'bb-field-reset';
        resetBtn.title = tx('Reset to default');
        resetBtn.setAttribute('aria-label', tx('Reset to default'));
        resetBtn.textContent = '↺';
        resetBtn.hidden = true;
        labelRow.appendChild(resetBtn);
      }
      group.appendChild(labelRow);
    }

    // Inline validation / probe message slot (shared by validate() + Test).
    const msg = document.createElement('div');
    msg.className = 'bb-field-msg';
    msg.hidden = true;
    const showMsg = res => {
      // Tint the control itself (red/amber border via has-error/has-warn) so an
      // invalid field reads as a problem even before the message is spotted.
      const level = res?.level ?? null;
      group.classList.toggle('has-error', level === 'error');
      group.classList.toggle('has-warn', level === 'warn');
      if (!res) { msg.hidden = true; msg.textContent = ''; return; }
      msg.hidden = false;
      // validate() messages are English source strings (plugins are i18n-free
      // by design) — route them through the overlay like labels/help. Probe
      // messages arrive pre-localized and pass through unchanged.
      msg.textContent = tx(res.message);
      msg.dataset.level = res.level;
    };
    const runValidate = () => { if (typeof f.validate === 'function') showMsg(f.validate(cur[f.key], cur)); };
    if (typeof f.validate === 'function') validators.push(runValidate);

    // Shared commit path — every edit (typed, clicked or reset) flows through
    // here so visibility, summaries, reset buttons, validation and onChange
    // stay in sync. validate(value, content) invites cross-field rules, so
    // ALL validators re-run on every change, not just the edited field's.
    const commit = v => {
      cur[f.key] = v;
      applyVisibility();
      for (const run of validators) run();
      onChange?.(cur);
    };

    let ctrl = renderField(f, cur[f.key], commit, { assetPicker, assetsPicker, codePicker });
    refs.set(f.key, ctrl.el);
    group.appendChild(ctrl.el);

    if (resetBtn) {
      const updateReset = () => {
        const differs = JSON.stringify(cur[f.key]) !== JSON.stringify(defaults[f.key]);
        resetBtn.hidden = !differs;
        // Bare row (label suppressed): collapse it entirely while in sync so
        // the hover affordance doesn't reserve empty space.
        if (suppressLabel) labelRow.hidden = !differs;
      };
      resetUpdaters.push(updateReset);
      updateReset();
      resetBtn.addEventListener('click', () => {
        const dv = structuredCloneSafe(defaults[f.key]);
        // Controls don't track external value changes — swap in a freshly
        // rendered control showing the default, then commit as a normal edit.
        const next = renderField(f, dv, commit, { assetPicker, assetsPicker, codePicker });
        ctrl.el.replaceWith(next.el);
        ctrl.dispose?.();
        ctrl = next;
        refs.set(f.key, next.el);
        commit(dv);
      });
    }

    if (f.test) {
      const testRow = document.createElement('div');
      testRow.className = 'bb-field-test';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bb-btn bb-btn-secondary bb-btn-sm';
      btn.innerHTML = uiIconSvg('plug', 14) + ' ' + esc(t('probe.test'));
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = t('probe.testing');
        try { showMsg(await probeUrl(cur[f.key], f.test === true ? 'url' : f.test)); }
        finally { btn.disabled = false; btn.textContent = label; }
      });
      testRow.appendChild(btn);
      group.appendChild(testRow);
    }

    if (f.help && !suppressHelp) {
      const help = document.createElement('p');
      help.className = 'bb-form-help';
      help.textContent = tx(f.help);
      group.appendChild(help);
    }
    group.appendChild(msg);
    groups.push({ f, group, getCtrl: () => ctrl });
    runValidate();
    return group;
  }

  // Iterate the schema's flat field list and interpret two marker types:
  //   `section` opens a collapsible group; subsequent fields mount into it.
  //   `row` wraps its `children` array in a horizontal flex container.
  // Anything else is a regular field.
  // Tier filter (see filterFieldsByTier): the inline inspector passes 'basic'
  // to show only essentials; the Widget Designer passes 'all' (or omits it).
  const tieredFields = filterFieldsByTier(schema.fields ?? [], tierFilter);

  let currentTarget = root;
  for (const f of tieredFields) {
    if (f.type === 'section') {
      // Explicit section marker — opens a new container that subsequent
      // top-level fields mount into (until the next section / EOF).
      const { section, body } = buildSection({
        label: tx(f.label), key: sectionKeyFor(f), collapsed: f.collapsed,
        icon: f.icon, help: f.help, summary: f.summary,
      });
      root.appendChild(section);
      currentTarget = body;
      groups.push({ f, group: section });
      continue;
    }
    if (f.type === 'row') {
      const rowWrap = document.createElement('div');
      rowWrap.className = 'bb-form-row-cluster';
      const children = Array.isArray(f.children) ? f.children : [];
      for (const child of children) rowWrap.appendChild(mountField(child, { suppressHelp: true }));
      // Help on row children would break the flex layout inline — render one
      // combined muted line below the cluster instead of dropping the text.
      const helps = children.filter(c => c.help)
        .map(c => (c.label ? `${tx(c.label)}: ${tx(c.help)}` : tx(c.help)));
      if (helps.length) {
        const rowHelp = document.createElement('p');
        rowHelp.className = 'bb-form-help bb-form-row-help';
        rowHelp.textContent = helps.join(' · ');
        rowWrap.appendChild(rowHelp);
      }
      currentTarget.appendChild(rowWrap);
      groups.push({ f, group: rowWrap });
      continue;
    }
    // Auto-folding: heavy controls (taller than ~2 rows) outside an explicit
    // section get their own collapsible fold — the header shows the label.
    // Light scalar fields render as a plain labelled group instead, so a real
    // section header ('Appearance') and a single field ('Title') no longer
    // carry the same visual weight. Fields inside an explicit section keep
    // rendering as before — the surrounding section already provides the fold.
    if (currentTarget === root && f.label
        && (autoFold === 'all' || f.fold === true || HEAVY_FIELD_TYPES.has(f.type))) {
      const { section, body } = buildSection(
        { label: tx(f.label), key: sectionKeyFor(f), collapsed: f.collapsed },
        { auto: true });
      body.appendChild(mountField(f, { suppressLabel: true }));
      root.appendChild(section);
      groups.push({ f, group: section });
      continue;
    }
    currentTarget.appendChild(mountField(f));
  }

  // Expand-all / collapse-all toggle row — only worth the chrome on long
  // forms, and the antidote to the per-(type, section) persisted collapse
  // state hiding fields with no obvious way back.
  if (sections.length >= 4) {
    const tools = document.createElement('div');
    tools.className = 'bb-form-tools';
    const mkBtn = (label, collapsed) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bb-form-tools-btn';
      btn.textContent = tx(label);
      btn.addEventListener('click', () => { for (const s of sections) s.setCollapsed(collapsed); });
      return btn;
    };
    tools.append(mkBtn('Expand all', false), mkBtn('Collapse all', true));
    root.prepend(tools);
  }

  // Number of real (leaf) fields after tier filtering — drives whether the
  // search box is worth its chrome.
  function countLeafFields(fields) {
    let n = 0;
    for (const f of fields) {
      if (f.type === 'section') continue;
      if (f.type === 'row') n += (f.children?.length ?? 0);
      else n++;
    }
    return n;
  }
  // Does a field match the active search term? Label, help and key all count,
  // routed through tx() so German users can search in German.
  function fieldMatches(f) {
    if (!searchTerm) return true;
    return `${tx(f.label) ?? ''} ${tx(f.help) ?? ''} ${f.key ?? ''}`.toLowerCase().includes(searchTerm);
  }

  // Field search — only on schemas big enough to get lost in. Filters live;
  // sections auto-expand to show hits and restore their persisted collapse
  // state when the box clears.
  if (countLeafFields(tieredFields) > 10) {
    const sb = document.createElement('div');
    sb.className = 'bb-form-search';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'bb-form-search-input';
    searchInput.placeholder = tx('Search settings…');
    searchInput.setAttribute('aria-label', tx('Search settings…'));
    searchInput.addEventListener('input', () => {
      searchTerm = searchInput.value.trim().toLowerCase();
      applyVisibility();
    });
    sb.appendChild(searchInput);
    root.prepend(sb);
    noResults = document.createElement('p');
    noResults.className = 'bb-form-noresults';
    noResults.textContent = tx('No matching settings');
    noResults.hidden = true;
    root.appendChild(noResults);
  }

  // Conditional fields: re-evaluate showIf(content) whenever any value changes.
  // Sections + rows can themselves have showIf — useful for "advanced" groups
  // that only matter when a switch above is enabled. Doubles as the per-change
  // refresh for section summaries, per-field reset visibility, and the search
  // filter (effective visibility = showIf AND search match).
  function applyVisibility() {
    // Pass 1 — fields & rows. Auto-folded fields sit inside their own section
    // element: pop it open while a search hit is inside so the control is
    // actually visible, and restore the persisted state when the search clears.
    let anyVisibleField = false;
    for (const { f, group } of groups) {
      if (f.type === 'section') continue;
      const byIf = typeof f.showIf === 'function' ? f.showIf(cur) : true;
      let show = byIf;
      if (byIf && searchTerm) {
        show = f.type === 'row' ? (f.children ?? []).some(fieldMatches) : fieldMatches(f);
      }
      group.style.display = show ? '' : 'none';
      if (show && f.type !== 'row') anyVisibleField = true;
      if (group.classList.contains('bb-form-section')) {
        if (searchTerm && show) group.classList.remove('bb-form-section-closed');
        else if (!searchTerm) group.classList.toggle('bb-form-section-closed', loadCollapsed(formKey, sectionKeyFor(f), !!f.collapsed));
      }
    }
    // Pass 2 — explicit sections: visible while any child field survived pass 1;
    // auto-expanded during a search (never persisted), restored when cleared.
    for (const { f, group } of groups) {
      if (f.type !== 'section') continue;
      const byIf = typeof f.showIf === 'function' ? f.showIf(cur) : true;
      if (!byIf) { group.style.display = 'none'; continue; }
      if (searchTerm) {
        const secBody = group.querySelector('.bb-form-section-body');
        const hasVisible = !!secBody && [...secBody.children].some(ch =>
          (ch.classList?.contains('bb-form-group') || ch.classList?.contains('bb-form-row-cluster')) && ch.style.display !== 'none');
        group.style.display = hasVisible ? '' : 'none';
        if (hasVisible) group.classList.remove('bb-form-section-closed');
      } else {
        group.style.display = '';
        group.classList.toggle('bb-form-section-closed', loadCollapsed(formKey, sectionKeyFor(f), !!f.collapsed));
      }
    }
    if (noResults) noResults.hidden = !(searchTerm && !anyVisibleField);
    for (const u of summaryUpdaters) u();
    for (const u of resetUpdaters) u();
  }
  applyVisibility();

  return {
    root,
    get value() { return cur; },
    setValue(next) { Object.assign(cur, next); /* re-render isn't tracked deeply */ },
    // Tear down every control holding document-level listeners or timers
    // (rich-text registers selectionchange/mousedown on document). Idempotent:
    // the inspector panel calls it once per rebuild, extra calls are no-ops.
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const g of groups) { try { g.getCtrl?.().dispose?.(); } catch {} }
    },
  };
}

function renderField(f, v, set, opts) {
  // Registered controls win; the switch below holds the built-in native inputs.
  const control = getControl(f.type);
  if (control) return control(f, v, set, opts);
  switch (f.type) {
    case 'text':
    case 'url':
    case 'date':
    case 'time': {
      const el = document.createElement('input');
      el.type = f.type === 'text' ? 'text' : f.type;
      el.value = v ?? '';
      if (f.placeholder) el.placeholder = tx(f.placeholder);
      el.addEventListener('input', () => set(el.value));
      return { el };
    }
    case 'color': {
      // Native <input type="color"> has no empty state — once a value is set
      // it can't be cleared back to "use default". The swatch is therefore
      // paired with a synced hex text input, and an explicit 'inherit' badge
      // marks the empty state (the theme colour applies). For fields where an
      // empty value is meaningful (e.g. weather textColor = follow theme),
      // pass `clearable: true` and a small × button resets back to ''.
      const wrap = document.createElement('div');
      wrap.className = 'bb-color-field';
      const el = document.createElement('input');
      el.type = 'color';
      const hex = document.createElement('input');
      hex.type = 'text';
      hex.className = 'bb-color-hex';
      hex.placeholder = '#rrggbb';
      hex.spellcheck = false;
      const badge = document.createElement('span');
      badge.className = 'bb-color-inherit';
      badge.textContent = tx('inherit');
      let current = v || '';
      // Sync all three faces (swatch, hex text, badge) to one value.
      const paint = () => {
        wrap.classList.toggle('bb-color-empty', !current);
        badge.hidden = !!current;
        el.value = current || '#000000';
        hex.value = current;
      };
      const commit = val => { current = val; paint(); set(val); };
      el.addEventListener('input', () => commit(el.value));
      // '#abc' / 'abc' / '#aabbcc' / 'aabbcc' → normalized '#aabbcc', or null.
      const parseHex = raw => {
        const m = String(raw).trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
        if (!m) return null;
        let hx = m[1].toLowerCase();
        if (hx.length === 3) hx = hx.replace(/./g, ch => ch + ch);
        return `#${hx}`;
      };
      // Hex typing commits as soon as the text parses (live canvas update,
      // without rewriting hex.value mid-edit so the caret stays put);
      // 'change' (blur/Enter) snaps the display back to the last valid value.
      hex.addEventListener('input', () => {
        const val = parseHex(hex.value);
        if (val) {
          current = val;
          el.value = val;
          wrap.classList.remove('bb-color-empty');
          badge.hidden = true;
          set(val);
        } else if (hex.value.trim() === '' && f.clearable) {
          current = '';
          wrap.classList.add('bb-color-empty');
          badge.hidden = false;
          set('');
        }
      });
      hex.addEventListener('change', paint);
      wrap.append(el, hex, badge);
      if (f.clearable) {
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'bb-color-clear';
        clear.title = tx('Reset to default');
        clear.setAttribute('aria-label', tx('Reset to default'));
        clear.textContent = '×';
        clear.addEventListener('click', () => commit(''));
        wrap.appendChild(clear);
      }
      paint();
      return { el: wrap };
    }
    case 'number': {
      if (f.slider) {
        const wrap = document.createElement('div');
        wrap.className = 'bb-slider-field';
        const el = document.createElement('input');
        el.type = 'range';
        if (f.min != null) el.min = f.min;
        if (f.max != null) el.max = f.max;
        el.step = f.step != null ? f.step : 1;
        el.value = v ?? f.default ?? f.min ?? 0;
        const lbl = document.createElement('span');
        lbl.className = 'bb-slider-val';
        const fmt = () => { lbl.textContent = `${el.value}${f.suffix ?? ''}`; };
        el.addEventListener('input', () => { fmt(); set(+el.value); });
        fmt();
        wrap.append(el, lbl);
        return { el: wrap };
      }
      const el = document.createElement('input');
      el.type = 'number';
      el.value = v ?? '';
      if (f.min != null) el.min = f.min;
      if (f.max != null) el.max = f.max;
      if (f.step != null) el.step = f.step;
      el.addEventListener('input', () => set(el.value === '' ? null : +el.value));
      // Clamp typed values to min/max once editing settles ('change', not
      // 'input', so half-typed numbers aren't fought while typing). The HTML
      // attrs only constrain the spinners — typed input bypasses them.
      el.addEventListener('change', () => {
        if (el.value === '') return;
        let n = +el.value;
        if (Number.isNaN(n)) return;
        if (f.min != null && n < f.min) n = f.min;
        if (f.max != null && n > f.max) n = f.max;
        if (n !== +el.value) { el.value = n; set(n); }
      });
      if (f.suffix) {
        // Trailing unit span ('s', '%', 'px', 'min') — the same input+unit
        // pattern the duration control uses, generalized for plain numbers.
        const wrap = document.createElement('div');
        wrap.className = 'bb-number-field';
        const unit = document.createElement('span');
        unit.className = 'bb-number-unit';
        unit.textContent = f.suffix;
        wrap.append(el, unit);
        return { el: wrap };
      }
      return { el };
    }
    case 'textarea': {
      const el = document.createElement('textarea');
      el.value = v ?? '';
      if (f.placeholder) el.placeholder = tx(f.placeholder);
      el.addEventListener('input', () => set(el.value));
      return wrapExpandable(el, f, () => el.value, val => { el.value = val; set(val); }, 'text');
    }
    case 'markdown':
    case 'code': {
      const el = document.createElement('textarea');
      el.value = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
      el.className = 'bb-mono';
      if (f.placeholder) el.placeholder = tx(f.placeholder);
      el.addEventListener('input', () => set(el.value));
      return wrapExpandable(el, f, () => el.value, val => { el.value = val; set(val); }, f.type);
    }
    case 'toggle': {
      const el = document.createElement('label');
      el.className = 'bb-switch';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = !!v;
      cb.addEventListener('change', () => set(cb.checked));
      const slider = document.createElement('span'); slider.className = 'bb-switch-slider';
      el.appendChild(cb); el.appendChild(slider);
      return { el };
    }
    case 'select': {
      const opts = (f.options ?? []).map(o =>
        typeof o === 'string' ? { value: o, label: o } : o);
      // `search: true` — long lists (10+ options) route through the shared
      // combobox the timezone/currency pickers use: type-to-filter, same keys.
      if (f.search) {
        return searchableSelect({
          options: opts.map(o => ({ value: o.value, label: tx(o.label) ?? String(o.value) })),
          value: v,
          placeholder: f.placeholder ? tx(f.placeholder) : undefined,
          onChange: set,
        });
      }
      // `buttons: true` — small enums (2–5 options) render as a segmented
      // button group: every choice visible, one click to switch. Falls back
      // to the native select beyond 5 options so the row can't overflow.
      if (f.buttons && opts.length >= 2 && opts.length <= 5) {
        const wrap = document.createElement('div');
        wrap.className = 'bb-seg';
        const paint = () => {
          for (const b of wrap.children) {
            const on = b.dataset.v === String(v);
            b.classList.toggle('bb-on', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
          }
        };
        for (const o of opts) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'bb-seg-btn';
          btn.dataset.v = String(o.value);
          btn.textContent = tx(o.label) ?? String(o.value);
          btn.addEventListener('click', () => { v = o.value; paint(); set(o.value); });
          wrap.appendChild(btn);
        }
        paint();
        return { el: wrap };
      }
      const el = document.createElement('select');
      for (const opt of opts) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = tx(opt.label) ?? opt.value;
        if (o.value === v) o.selected = true;
        el.appendChild(o);
      }
      el.addEventListener('change', () => set(el.value));
      return { el };
    }
    // location / datetime / timezone / duration / currency / table /
    // calendar-events / feed / feed-list / rich-text / theme / place / icon are
    // registered controls (see registerControl() calls above) — dispatched via
    // the registry before this switch is reached.
    case 'asset': {
      const wrap = document.createElement('div');
      wrap.className = 'bb-asset-wrap';
      const row = document.createElement('div');
      row.className = 'bb-asset-field';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = tx(f.placeholder ?? 'URL or pick from library');
      input.value = v ?? '';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bb-btn bb-btn-secondary';
      btn.innerHTML = uiIconSvg('folder', 14) + ' ' + esc(tx('Browse'));
      row.appendChild(input);
      row.appendChild(btn);

      // Thumbnail preview of the selected image/video.
      const thumb = document.createElement('div');
      thumb.className = 'bb-asset-thumb';
      const accept = f.accept ?? '';
      const updateThumb = url => {
        thumb.innerHTML = '';
        if (!url) { thumb.hidden = true; return; }
        const isVideo = /video\//.test(accept) || /\.(mp4|webm|m4v|mov)(\?|$)/i.test(url);
        const isImage = /image\//.test(accept) || /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(url);
        if (isVideo) {
          const vd = document.createElement('video');
          vd.src = url; vd.muted = true; vd.preload = 'metadata';
          thumb.hidden = false; thumb.appendChild(vd);
        } else if (isImage || !accept) {
          const im = document.createElement('img');
          im.src = url; im.alt = '';
          im.addEventListener('error', () => { thumb.hidden = true; });
          thumb.hidden = false; thumb.appendChild(im);
        } else { thumb.hidden = true; }
      };

      input.addEventListener('input', () => { set(input.value); updateThumb(input.value); });
      btn.addEventListener('click', async () => {
        const url = await opts.assetPicker?.(f.accept);
        if (url) { input.value = url; set(url); updateThumb(url); }
      });
      updateThumb(input.value);
      wrap.append(row, thumb);
      return { el: wrap };
    }
    case 'list': {
      const wrap = document.createElement('div');
      wrap.className = 'bb-list-field';
      const list = Array.isArray(v) ? [...v] : [];
      const itemShape = f.itemShape ?? [{ key: 'value', type: 'text', label: 'Value' }];
      let dragFrom = null;
      const render = () => {
        wrap.innerHTML = '';
        list.forEach((item, idx) => {
          const row = document.createElement('div');
          row.className = 'bb-list-item';
          row.dataset.idx = idx;

          const handle = document.createElement('span');
          handle.className = 'bb-drag-handle';
          handle.textContent = '⠿';
          handle.title = t('field.dragReorder');
          handle.draggable = true;
          handle.addEventListener('dragstart', e => { dragFrom = idx; e.dataTransfer.effectAllowed = 'move'; row.classList.add('bb-dragging'); });
          handle.addEventListener('dragend', () => { dragFrom = null; row.classList.remove('bb-dragging'); });
          row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('bb-drop-into'); });
          row.addEventListener('dragleave', () => row.classList.remove('bb-drop-into'));
          row.addEventListener('drop', e => {
            e.preventDefault(); row.classList.remove('bb-drop-into');
            if (dragFrom == null || dragFrom === idx) return;
            const [moved] = list.splice(dragFrom, 1);
            list.splice(idx, 0, moved);
            set([...list]); render();
          });
          row.appendChild(handle);

          const fields = document.createElement('div');
          fields.className = 'bb-list-fields';
          for (const sf of itemShape) {
            const cell = document.createElement('div');
            cell.className = 'bb-list-cell';
            const sub = renderField(sf, item?.[sf.key], nv => {
              if (!list[idx] || typeof list[idx] !== 'object') list[idx] = {};
              list[idx][sf.key] = nv;
              set([...list]);
            }, opts);
            const lbl = document.createElement('label');
            lbl.textContent = tx(sf.label) ?? sf.key;
            cell.appendChild(lbl);
            cell.appendChild(sub.el);
            fields.appendChild(cell);
          }
          row.appendChild(fields);

          const rm = document.createElement('button');
          rm.type = 'button';
          rm.className = 'bb-btn bb-btn-ghost bb-list-rm';
          rm.innerHTML = uiIconSvg('close', 14);
          rm.addEventListener('click', () => { list.splice(idx, 1); set([...list]); render(); });
          row.appendChild(rm);
          wrap.appendChild(row);
        });

        const actions = document.createElement('div');
        actions.className = 'bb-list-actions';
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'bb-btn bb-btn-secondary bb-btn-sm';
        add.textContent = '+ ' + t('field.addRow');
        add.addEventListener('click', () => {
          const empty = Object.fromEntries(itemShape.map(sf => [sf.key, sf.type === 'number' ? 0 : '']));
          list.push(empty); set([...list]); render();
        });
        actions.appendChild(add);

        if (f.bulkAsset) {
          const bulk = document.createElement('button');
          bulk.type = 'button';
          bulk.className = 'bb-btn bb-btn-secondary bb-btn-sm';
          bulk.innerHTML = uiIconSvg('image', 14) + ' ' + esc(t('field.pickMultiple'));
          bulk.addEventListener('click', async () => {
            const urls = await opts.assetsPicker?.(f.bulkAsset);
            if (urls?.length) {
              const key = itemShape[0].key;
              urls.forEach(u => list.push({ [key]: u }));
              set([...list]); render();
            }
          });
          actions.appendChild(bulk);
        }
        wrap.appendChild(actions);
      };
      render();
      return { el: wrap };
    }
    default: {
      // Unknown field type — log so a typo in a plugin schema or a new field
      // type that wasn't added here surfaces during development. The plain
      // input fallback keeps the form usable in production.
      console.warn('[inspector] unknown field type', f.type, 'for key', f.key, '— falling back to plain input');
      const el = document.createElement('input');
      el.value = v ?? '';
      el.addEventListener('input', () => set(el.value));
      return { el };
    }
  }
}

function structuredCloneSafe(v) {
  try { return structuredClone(v); } catch {
    try { return JSON.parse(JSON.stringify(v)); } catch { return { ...v }; }
  }
}

// Wraps a textarea-style control with an "⛶ Expand" button that opens the
// same content in a much larger modal — mirrors the announcement widget's
// expand-modal pattern. For markdown fields, the modal also shows a live
// preview pane (HTML pipelined through sanitizeHtml on every keystroke).
//
// kind: 'text' | 'code' | 'markdown' — drives whether to show a preview and
// whether to use monospace font.
function wrapExpandable(inner, f, getValue, setValue, kind) {
  const wrap = document.createElement('div');
  wrap.className = 'bb-textfield-wrap';
  wrap.appendChild(inner);
  const expand = document.createElement('button');
  expand.type = 'button';
  expand.className = 'bb-textfield-expand';
  expand.title = t('rt.expand');
  expand.innerHTML = uiIconSvg('expand', 14);
  expand.addEventListener('click', () => openExpandedTextEditor(f, getValue, setValue, kind));
  wrap.appendChild(expand);
  return { el: wrap };
}

function openExpandedTextEditor(f, getValue, setValue, kind) {
  const body = document.createElement('div');
  body.className = `bb-textmodal bb-textmodal-${kind}`;
  const ta = document.createElement('textarea');
  ta.className = kind === 'text' ? 'bb-textmodal-area' : 'bb-textmodal-area bb-mono';
  ta.value = getValue() ?? '';
  if (f.placeholder) ta.placeholder = tx(f.placeholder);
  ta.spellcheck = kind !== 'code';

  // Live commit so the canvas updates while the user types in the modal —
  // exact same UX as the announcement widget's expand modal.
  ta.addEventListener('input', () => setValue(ta.value));

  if (kind === 'markdown') {
    // Side-by-side preview. Renders the markdown on every keystroke using the
    // global `marked` lib (already loaded by display.html / studio.html) and
    // pipes through sanitizeHtml so an authored body still can't inject.
    const split = document.createElement('div');
    split.className = 'bb-textmodal-split';
    const pane = document.createElement('article');
    pane.className = 'bb-textmodal-preview bb-md';
    const renderPreview = () => {
      if (typeof window !== 'undefined' && window.marked?.parse) {
        pane.innerHTML = sanitizeHtml(window.marked.parse(ta.value, { breaks: true, gfm: true }));
      } else {
        pane.textContent = ta.value;
      }
    };
    ta.addEventListener('input', renderPreview);
    split.append(ta, pane);
    body.appendChild(split);
    setTimeout(renderPreview, 0);
  } else {
    body.appendChild(ta);
  }

  openModal({
    title: tx(f.label) || t('rt.editTitle'),
    body,
    actions: [{ label: t('rt.done'), kind: 'primary', value: true }],
    onMount: (card) => {
      card.classList.add('bb-modal-textmodal');
      setTimeout(() => ta.focus(), 30);
    },
  });
}
