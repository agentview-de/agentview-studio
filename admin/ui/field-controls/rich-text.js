// Rich text WYSIWYG editor (full feature set: B/I/U/S, sub/sup, colour +
// highlight, size, font, line-height, paragraph styles, lists, alignment,
// links, HR, code, blockquote, tables, emoji, special chars, undo/redo,
// markdown shortcuts, auto-link, word counter, image insert + drag/drop +
// paste, link/image popovers, expand-to-modal).
//
// Uses contenteditable + document.execCommand. execCommand is technically
// deprecated, but it's still the simplest way to get a substantial WYSIWYG
// that works across all browsers without pulling in a 200 KB library.
// Output is always passed through sanitizeHtml (whitelist tags + style
// props + per-tag attribute filtering), so pasted junk and malicious markup
// can't escape into the slide data.

import { t, tx } from '../../i18n.js';
import { openModal } from '../modal.js';
import { pickAsset, uploadAndGetUrl } from '../asset-library.js';
import { toast } from '../toast.js';
import { sanitizeHtml, plainToHtml, looksLikeHtml } from '../../../shared/sanitize-html.js';
import { h, esc, escAttr, escText } from './_shared.js';
import { buildTableHtml } from './rich-text-table.js';

// Unique-id counter so each editor's size <datalist> has its own id (the expand
// modal mounts a second editor instance in the same document).
let rtInstanceSeq = 0;

export function renderRichText(f, v, set, opts = {}) {
  const wrap = h('div', 'bb-richtext-field');
  const bar = h('div', 'bb-richtext-toolbar bb-richtext-toolbar-primary');
  const more = h('div', 'bb-richtext-toolbar bb-richtext-toolbar-more');
  more.hidden = true;
  const tableBar = h('div', 'bb-richtext-tablebar'); tableBar.hidden = true;
  const editor = h('div', 'bb-richtext-editor');
  editor.contentEditable = 'true';
  editor.spellcheck = true;
  const status = h('div', 'bb-richtext-status');
  const popover = h('div', 'bb-richtext-popover'); popover.hidden = true;
  const linkPop = h('div', 'bb-richtext-linkpop'); linkPop.hidden = true;
  const imgPop  = h('div', 'bb-richtext-imgpop');  imgPop.hidden = true;

  // Track the editor's last selection range so toolbar controls that steal
  // focus (native <select> dropdown, native color picker, popover buttons) can
  // restore it before issuing a command. Without this, opening the picker
  // clears the selection and the command runs on nothing — every "Small /
  // Large / colour" click would silently no-op.
  let savedRange = null;
  function onSelectionChange() {
    const sel = document.getSelection();
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
      refreshActiveStates();
      refreshTableContext();
    }
  }
  document.addEventListener('selectionchange', onSelectionChange);

  function restoreSelection() {
    editor.focus();
    if (!savedRange) return;
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  // styleWithCSS: emit <span style="..."> for colour/etc. instead of legacy
  // <font color="..."> tags. Our sanitiser's whitelist drops <font>, so
  // without this every colour applied via the toolbar would silently vanish
  // on save. Browsers persist this setting per document; resetting before
  // every command is paranoid but harmless.
  try { document.execCommand('styleWithCSS', false, true); } catch {}

  function exec(cmd, value, useCss = true) {
    restoreSelection();
    // sub/sup with styleWithCSS=true emit `<span style="vertical-align: sub">`,
    // which we don't allow in the sanitizer — caller can opt out so the browser
    // produces clean <sub>/<sup> tags (whitelisted) instead.
    try { document.execCommand('styleWithCSS', false, useCss); } catch {}
    document.execCommand(cmd, false, value);
    commit();
    refreshActiveStates();
  }

  // Apply an ARBITRARY font size to the current selection. execCommand('fontSize')
  // only accepts the 1–7 keyword scale, so we set the top sentinel size (7 →
  // xxx-large) and then rewrite exactly those just-created nodes to the requested
  // px value. Lets a user type any size (e.g. 72) instead of only S/M/L/XL.
  function applyFontSize(px) {
    restoreSelection();
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return;
    try { document.execCommand('styleWithCSS', false, true); } catch {}
    document.execCommand('fontSize', false, '7');
    // styleWithCSS=true → <span style="font-size: xxx-large">; some engines may
    // still emit <font size="7">. Rewrite both to the exact pixel value.
    editor.querySelectorAll('font[size="7"]').forEach(fEl => {
      const span = document.createElement('span');
      span.style.fontSize = px;
      while (fEl.firstChild) span.appendChild(fEl.firstChild);
      fEl.replaceWith(span);
    });
    editor.querySelectorAll('span').forEach(s => {
      const fs = s.style.fontSize;
      if (fs === 'xxx-large' || fs === '-webkit-xxx-large') s.style.fontSize = px;
    });
    commit();
    refreshActiveStates();
  }

  function btn(label, title, onClick, opts = {}) {
    const b = h('button', 'bb-richtext-btn', label);
    b.type = 'button';
    b.title = title;
    // Most toolbar buttons are icon-only — set aria-label so screen readers
    // have something to announce. title is only consulted by sighted hover.
    b.setAttribute('aria-label', title);
    if (opts.cmd) b.dataset.cmd = opts.cmd;
    if (opts.activeCheck) b._activeCheck = opts.activeCheck;
    if (opts.extraClass) b.classList.add(opts.extraClass);
    // mousedown.preventDefault preserves the text selection in `editor`.
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', onClick);
    return b;
  }
  const sep = (host = bar) => host.append(h('span', 'bb-richtext-sep'));

  // ----- PRIMARY ROW: essentials always visible -----
  bar.append(
    btn('B', t('rt.bold'),       () => exec('bold'),      { cmd: 'bold' }),
    btn('I', t('rt.italic'),     () => exec('italic'),    { cmd: 'italic' }),
    btn('U', t('rt.underline'),  () => exec('underline'), { cmd: 'underline' }),
  );

  // Text colour
  sep(bar);
  const colorWrap = h('label', 'bb-richtext-color-wrap');
  colorWrap.title = t('rt.color');
  const colorBtn = h('input');
  colorBtn.type = 'color';
  colorBtn.className = 'bb-richtext-color';
  colorWrap.addEventListener('mousedown', e => { if (e.target !== colorBtn) e.preventDefault(); });
  // `change` (not `input`) — `input` fires on every cursor move through the
  // colour wheel, nesting span-in-span and producing a streaked partial result.
  colorBtn.addEventListener('change', () => exec('foreColor', colorBtn.value));
  colorWrap.append(colorBtn);
  bar.append(colorWrap);

  // Font size — editable: pick a preset from the dropdown OR type any pixel
  // value (e.g. 72) and press Enter. Applies to the selected text.
  sep(bar);
  const sizeListId = `bb-richtext-sizes-${++rtInstanceSeq}`;
  const sizeWrap = h('label', 'bb-richtext-sizewrap');
  sizeWrap.title = t('rt.size');
  const sizeInput = h('input');
  sizeInput.type = 'text';
  sizeInput.inputMode = 'numeric';
  sizeInput.className = 'bb-richtext-size-input';
  sizeInput.placeholder = t('rt.sizePlaceholder');
  sizeInput.setAttribute('aria-label', t('rt.size'));
  sizeInput.setAttribute('list', sizeListId);
  const sizeList = h('datalist');
  sizeList.id = sizeListId;
  for (const n of [16, 20, 24, 32, 40, 48, 64, 72, 96, 128]) {
    const o = h('option'); o.value = String(n); sizeList.append(o);
  }
  // Keep the editor selection alive when clicking the field chrome — but not the
  // input itself, which must take focus to type.
  sizeWrap.addEventListener('mousedown', e => { if (e.target !== sizeInput) e.preventDefault(); });
  const applySize = () => {
    const n = parseInt(sizeInput.value, 10);
    if (n > 0) applyFontSize(`${n}px`);
  };
  sizeInput.addEventListener('change', applySize);
  sizeInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applySize(); } });
  sizeWrap.append(sizeInput, sizeList);
  bar.append(sizeWrap);

  // Lists
  sep(bar);
  bar.append(
    btn('•',  t('rt.bulletList'),   () => exec('insertUnorderedList'), { cmd: 'insertUnorderedList' }),
    btn('1.', t('rt.numberedList'), () => exec('insertOrderedList'),   { cmd: 'insertOrderedList', extraClass: 'bb-richtext-size-btn' }),
  );

  // Alignment
  sep(bar);
  bar.append(
    btn('⇤', t('rt.alignLeft'),   () => exec('justifyLeft'),   { cmd: 'justifyLeft' }),
    btn('↔', t('rt.alignCenter'), () => exec('justifyCenter'), { cmd: 'justifyCenter' }),
    btn('⇥', t('rt.alignRight'),  () => exec('justifyRight'),  { cmd: 'justifyRight' }),
  );

  // Link + image (most-asked extras live in the primary row too)
  sep(bar);
  bar.append(btn('🔗', t('rt.link'),  insertLinkDialog, { activeCheck: () => isInsideTag('A') }));
  bar.append(btn('🖼', t('rt.image'), insertImageDialog));

  // Undo + clear (redo lives in More — undo is the more common one)
  sep(bar);
  bar.append(btn('↶', t('rt.undo'),        () => exec('undo')));
  bar.append(btn('⊘', t('rt.clearFormat'), () => exec('removeFormat')));

  // Expand + More toggle
  sep(bar);
  if (!opts.compact) bar.append(btn('⛶', t('rt.expand'), openExpanded));
  const moreToggle = btn('▾', t('rt.more'), () => {
    more.hidden = !more.hidden;
    moreToggle.classList.toggle('bb-active', !more.hidden);
    moreToggle.title = more.hidden ? t('rt.more') : t('rt.less');
  });
  bar.append(moreToggle);

  // ----- SECONDARY ROW: hidden by default. Power features. -----
  more.append(
    btn('S',   t('rt.strike'), () => exec('strikeThrough'), { cmd: 'strikeThrough' }),
    btn('x₂',  t('rt.sub'),    () => exec('subscript',   null, false), { cmd: 'subscript' }),
    btn('x²',  t('rt.sup'),    () => exec('superscript', null, false), { cmd: 'superscript' }),
    btn('&lt;/&gt;', t('rt.code'), () => wrapInlineTag('code'), { extraClass: 'bb-richtext-size-btn', activeCheck: () => isInsideTag('CODE') }),
  );

  // Highlight + remove highlight
  sep(more);
  const hilWrap = h('label', 'bb-richtext-color-wrap bb-richtext-hilite-wrap');
  hilWrap.title = t('rt.highlight');
  const hilBtn = h('input');
  hilBtn.type = 'color';
  hilBtn.value = '#fff59d';
  hilBtn.className = 'bb-richtext-color';
  hilWrap.addEventListener('mousedown', e => { if (e.target !== hilBtn) e.preventDefault(); });
  hilBtn.addEventListener('change', () => exec('hiliteColor', hilBtn.value));
  hilWrap.append(hilBtn);
  more.append(hilWrap);
  more.append(btn('⌫', t('rt.clearHighlight'), () => exec('hiliteColor', 'transparent')));

  // Paragraph style / font / line height
  sep(more);
  const paraSel = h('select', 'bb-richtext-select');
  paraSel.title = t('rt.paragraph');
  paraSel.innerHTML =
    `<option value="p">${esc(t('rt.paraText'))}</option>` +
    `<option value="h2">${esc(t('rt.paraH2'))}</option>` +
    `<option value="h3">${esc(t('rt.paraH3'))}</option>` +
    `<option value="blockquote">${esc(t('rt.paraQuote'))}</option>` +
    `<option value="pre">${esc(t('rt.paraCode'))}</option>`;
  paraSel.addEventListener('mousedown', e => e.stopPropagation());
  paraSel.addEventListener('change', () => exec('formatBlock', paraSel.value));
  more.append(paraSel);

  const fontSel = h('select', 'bb-richtext-select');
  fontSel.title = t('rt.fontFamily');
  const FONT_OPTS = [
    { v: '',                                            label: t('rt.fontDefault') },
    { v: 'Inter, system-ui, sans-serif',                label: t('rt.fontSans') },
    { v: '"Playfair Display", Georgia, serif',          label: t('rt.fontSerif') },
    { v: '"JetBrains Mono", ui-monospace, monospace',   label: t('rt.fontMono') },
    { v: '"Inter Tight", Inter, sans-serif',            label: t('rt.fontDisplay') },
  ];
  fontSel.innerHTML = FONT_OPTS.map(o => `<option value="${esc(o.v)}">${esc(o.label)}</option>`).join('');
  fontSel.addEventListener('mousedown', e => e.stopPropagation());
  fontSel.addEventListener('change', () => {
    if (fontSel.value) exec('fontName', fontSel.value);
    fontSel.value = '';
  });
  more.append(fontSel);

  const lhSel = h('select', 'bb-richtext-select');
  lhSel.title = t('rt.lineHeight');
  lhSel.innerHTML =
    `<option value="">${esc(t('rt.lineHeightDefault'))}</option>` +
    '<option value="1">1.0</option>' +
    '<option value="1.15">1.15</option>' +
    '<option value="1.4">1.4</option>' +
    '<option value="1.5">1.5</option>' +
    '<option value="1.8">1.8</option>' +
    '<option value="2">2.0</option>';
  lhSel.addEventListener('mousedown', e => e.stopPropagation());
  lhSel.addEventListener('change', () => {
    if (lhSel.value) setLineHeight(lhSel.value);
    lhSel.value = '';
  });
  more.append(lhSel);

  // Justify (less common than the three primary alignments)
  sep(more);
  more.append(btn('☰', t('rt.justify'), () => exec('justifyFull'), { cmd: 'justifyFull' }));

  // HR + table + emoji + special char
  sep(more);
  more.append(btn('─', t('rt.hr'),    () => exec('insertHorizontalRule')));
  more.append(btn('⊞', t('rt.table'), insertTableDialog, { extraClass: 'bb-richtext-size-btn' }));
  more.append(btn('😀', t('rt.emoji'),       e => togglePopover(e, emojiPopover())));
  more.append(btn('Ω',  t('rt.specialChar'), e => togglePopover(e, charPopover())));

  // Redo
  sep(more);
  more.append(btn('↷', t('rt.redo'), () => exec('redo')));

  // ----- Table contextual toolbar -----
  tableBar.append(
    btn('+⤴', t('rt.table.rowAbove'), () => modifyTable('rowAbove'), { extraClass: 'bb-richtext-size-btn' }),
    btn('+⤵', t('rt.table.rowBelow'), () => modifyTable('rowBelow'), { extraClass: 'bb-richtext-size-btn' }),
    btn('+⇤', t('rt.table.colLeft'),  () => modifyTable('colLeft'),  { extraClass: 'bb-richtext-size-btn' }),
    btn('+⇥', t('rt.table.colRight'), () => modifyTable('colRight'), { extraClass: 'bb-richtext-size-btn' }),
  );
  sep(tableBar);
  tableBar.append(
    btn('⇥⇤', t('rt.table.mergeRight'), () => modifyTable('mergeRight'), { extraClass: 'bb-richtext-size-btn' }),
    btn('⤓⤒', t('rt.table.mergeDown'),  () => modifyTable('mergeDown'),  { extraClass: 'bb-richtext-size-btn' }),
    btn('⇹',   t('rt.table.splitCell'),  () => modifyTable('splitCell'),  { extraClass: 'bb-richtext-size-btn' }),
  );
  sep(tableBar);
  tableBar.append(
    btn('−⇕', t('rt.table.delRow'),   () => modifyTable('delRow'),   { extraClass: 'bb-richtext-size-btn' }),
    btn('−⇔', t('rt.table.delCol'),   () => modifyTable('delCol'),   { extraClass: 'bb-richtext-size-btn' }),
    btn('🗑',  t('rt.table.delTable'), () => modifyTable('delTable')),
  );

  // ----- Init editor content -----
  const initial = v ?? '';
  editor.innerHTML = looksLikeHtml(initial) ? sanitizeHtml(initial) : plainToHtml(initial);

  let lastEmitted = editor.innerHTML;
  function commit() {
    const clean = sanitizeHtml(editor.innerHTML);
    if (clean === lastEmitted) {
      updateStatus();
      return;
    }
    lastEmitted = clean;
    set(clean);
    updateStatus();
  }

  editor.addEventListener('input', e => {
    handleMarkdownShortcut(e);
    handleAutoLink(e);
    commit();
  });
  editor.addEventListener('blur', commit);
  editor.addEventListener('keyup', refreshActiveStates);
  editor.addEventListener('click', e => {
    refreshActiveStates();
    refreshTableContext();
    // Image click → show the image popover (alt + size). Any non-image click
    // hides it, so the popover doesn't linger when the caret moves away.
    if (e.target?.tagName === 'IMG' && editor.contains(e.target)) {
      showImgPopover(e.target);
    } else if (!imgPop.contains(e.target)) {
      showImgPopover(null);
    }
  });

  // Paste as plain text — keeps formatting controlled to what's in our toolbar.
  // Special case: if the clipboard carries image files (screenshot, Image-from-
  // browser-paste), upload them and insert <img> tags instead of falling back
  // to "[image]"-style text junk.
  editor.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files ?? [])].filter(f => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      uploadAndInsertImages(files);
      return;
    }
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  });

  // Drag & drop image files. The dragover preventDefault is required to make
  // the drop actually fire — without it, the browser refuses the drop because
  // contenteditable isn't a registered drop zone for files.
  editor.addEventListener('dragover', e => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    editor.classList.add('bb-richtext-dragover');
  });
  editor.addEventListener('dragleave', e => {
    if (e.target === editor) editor.classList.remove('bb-richtext-dragover');
  });
  editor.addEventListener('drop', e => {
    editor.classList.remove('bb-richtext-dragover');
    const files = [...(e.dataTransfer?.files ?? [])].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    // Place caret at the drop point so the upload-and-insert lands where the
    // user actually dropped (not wherever the caret was before the drag).
    try {
      const r = (document.caretRangeFromPoint?.(e.clientX, e.clientY))
             ?? (document.caretPositionFromPoint
                  ? (() => {
                      const p = document.caretPositionFromPoint(e.clientX, e.clientY);
                      if (!p) return null;
                      const rr = document.createRange();
                      rr.setStart(p.offsetNode, p.offset); rr.collapse(true);
                      return rr;
                    })()
                  : null);
      if (r) {
        const sel = document.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
        savedRange = r.cloneRange();
      }
    } catch {}
    uploadAndInsertImages(files);
  });

  async function uploadAndInsertImages(files) {
    // Toast once at the start so the user knows we're working even on slow
    // uploads. Each image is inserted as soon as its own upload returns so
    // they appear in roughly the order they were dropped/pasted.
    toast(t('rt.img.uploading'), { kind: 'info' });
    for (const file of files) {
      try {
        const url = await uploadAndGetUrl(file);
        if (!url) continue;
        restoreSelection();
        document.execCommand('insertHTML', false,
          `<img src="${escAttr(url)}" alt="" style="max-width: 100%;">&nbsp;`);
        commit();
      } catch {
        toast(t('rt.img.uploadFail'), { kind: 'error' });
      }
    }
  }

  // Keyboard shortcuts — mirror Google Docs where possible. Browser-native
  // ones (Ctrl+B/I/U/Z) are handled by contenteditable itself; the rest we
  // wire here. Tab inside a table → next cell.
  editor.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && !e.shiftKey && k === 'k') { e.preventDefault(); insertLinkDialog(); return; }
    if (mod && !e.shiftKey && k === 'e') { e.preventDefault(); wrapInlineTag('code'); return; }
    if (mod && e.shiftKey && k === 'x') { e.preventDefault(); exec('strikeThrough'); return; }
    if (mod && e.shiftKey && k === 'h') { e.preventDefault(); hilBtn.click(); return; }
    if (mod && e.shiftKey && k === '7') { e.preventDefault(); exec('insertOrderedList'); return; }
    if (mod && e.shiftKey && k === '8') { e.preventDefault(); exec('insertUnorderedList'); return; }
    if (mod && e.shiftKey && (k === ',' || k === '<')) { e.preventDefault(); exec('subscript',   null, false); return; }
    if (mod && e.shiftKey && (k === '.' || k === '>')) { e.preventDefault(); exec('superscript', null, false); return; }
    handleTableTab(e);
  });

  // ----- Active state highlight (B/I/U/lists/alignment/link/code glow when caret is inside) -----
  function refreshActiveStates() {
    const cmdButtons = wrap.querySelectorAll('[data-cmd]');
    const checkButtons = wrap.querySelectorAll('.bb-richtext-btn');
    const insideEditor = editor.contains(document.activeElement) ||
      (savedRange && editor.contains(savedRange.startContainer));
    if (!insideEditor) {
      cmdButtons.forEach(b => b.classList.remove('bb-active'));
      checkButtons.forEach(b => { if (b._activeCheck) b.classList.remove('bb-active'); });
      return;
    }
    for (const b of cmdButtons) {
      let on = false;
      try { on = document.queryCommandState(b.dataset.cmd); } catch {}
      b.classList.toggle('bb-active', on);
    }
    for (const b of checkButtons) {
      if (b._activeCheck) {
        try { b.classList.toggle('bb-active', !!b._activeCheck()); } catch {}
      }
    }
    paraSel.value = currentBlockTag() || 'p';
    refreshLinkPopover();
  }

  // Walks the selection up to the editor looking for a tag (uppercase name).
  function isInsideTag(tagName) {
    const sel = document.getSelection();
    if (!sel.rangeCount) return false;
    let n = sel.anchorNode;
    if (n && n.nodeType === 3) n = n.parentNode;
    while (n && n !== editor && n !== document.body) {
      if (n.tagName === tagName) return true;
      n = n.parentNode;
    }
    return false;
  }
  function closestTagInEditor(tagName) {
    const sel = document.getSelection();
    if (!sel.rangeCount) return null;
    let n = sel.anchorNode;
    if (n && n.nodeType === 3) n = n.parentNode;
    while (n && n !== editor && n !== document.body) {
      if (n.tagName === tagName) return n;
      n = n.parentNode;
    }
    return null;
  }

  function currentBlockTag() {
    const sel = document.getSelection();
    if (!sel.rangeCount) return null;
    let n = sel.anchorNode;
    if (n && n.nodeType === 3) n = n.parentNode;
    while (n && n !== editor && n !== document.body) {
      const t = n.tagName?.toLowerCase();
      if (t === 'li') {
        // List items show up as their list type, but for the paragraph
        // dropdown we treat them as "Text" so re-applying p/h2/etc. acts
        // sensibly.
        return 'p';
      }
      if (['p', 'div', 'h2', 'h3', 'blockquote', 'pre'].includes(t)) return t;
      n = n.parentNode;
    }
    return null;
  }

  // ----- Inline tag wrap (used for `code`) -----
  function wrapInlineTag(tag) {
    restoreSelection();
    const sel = document.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const el = document.createElement(tag);
    try {
      el.appendChild(range.extractContents());
      range.insertNode(el);
      const newRange = document.createRange();
      newRange.setStartAfter(el);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } catch {}
    commit();
  }

  // ----- Line height on closest block (falls back to editor itself) -----
  function setLineHeight(value) {
    restoreSelection();
    const sel = document.getSelection();
    if (!sel.rangeCount) return;
    let n = sel.anchorNode;
    if (n && n.nodeType === 3) n = n.parentNode;
    while (n && n !== editor) {
      const t = n.tagName?.toLowerCase();
      if (['p', 'div', 'h2', 'h3', 'blockquote', 'pre', 'li'].includes(t)) {
        n.style.lineHeight = value;
        commit();
        return;
      }
      n = n.parentNode;
    }
    editor.style.lineHeight = value;
    commit();
  }

  // ----- Link dialog (insert mode) -----
  function insertLinkDialog() {
    const sel = document.getSelection();
    const selectedText = (sel && sel.rangeCount && editor.contains(sel.anchorNode)) ? sel.toString() : '';
    const body = h('div', 'bb-richtext-linkdlg');
    body.innerHTML = `
      <div class="bb-form-group"><label>${esc(t('rt.link.url'))}</label><input type="url" placeholder="https://example.com" class="bb-richtext-link-url"></div>
      <div class="bb-form-group"><label>${esc(t('rt.link.text'))}</label><input type="text" placeholder="${esc(t('rt.link.optional'))}" class="bb-richtext-link-text"></div>
      <p class="bb-form-help">${esc(t('rt.link.newTab'))}</p>
    `;
    const urlInp = body.querySelector('.bb-richtext-link-url');
    const txtInp = body.querySelector('.bb-richtext-link-text');
    txtInp.value = selectedText;
    openModal({
      title: t('rt.link.popoverTitle'),
      body,
      actions: [
        { label: t('common.cancel') },
        { label: t('rt.link.insert'), kind: 'primary', value: 'go' },
      ],
      onMount: (card, close) => {
        setTimeout(() => urlInp.focus(), 10);
        const footer = card.querySelector('.bb-modal-footer');
        const ok = [...footer.querySelectorAll('button')].find(b => b.textContent.trim() === t('rt.link.insert'));
        const doInsert = () => {
          let url = urlInp.value.trim();
          if (!url) return;
          // Auto-prefix bare domains with https://.
          if (!/^(https?:|mailto:)/i.test(url)) {
            url = /@/.test(url) && !url.includes('/') ? 'mailto:' + url : 'https://' + url;
          }
          const txt = (txtInp.value || selectedText || url).trim() || url;
          close('go');
          restoreSelection();
          const html = `<a href="${escAttr(url)}">${escText(txt)}</a>&nbsp;`;
          document.execCommand('insertHTML', false, html);
          commit();
        };
        ok?.addEventListener('click', e => { e.preventDefault(); doInsert(); });
        urlInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doInsert(); } });
        txtInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doInsert(); } });
      },
    });
  }

  // ----- Link popover (edit/open/remove existing link under caret) -----
  // Shown automatically whenever the caret sits inside an <a>. Positioned
  // below the link in the editor's coordinate space.
  let linkPopAnchor = null;
  function refreshLinkPopover() {
    const a = closestTagInEditor('A');
    if (!a) { linkPop.hidden = true; linkPopAnchor = null; return; }
    if (a === linkPopAnchor && !linkPop.hidden) return; // already showing for this link
    linkPopAnchor = a;
    linkPop.innerHTML = '';
    const urlRow = h('div', 'bb-richtext-linkpop-row');
    const urlInp = h('input');
    urlInp.type = 'url';
    urlInp.value = a.getAttribute('href') || '';
    urlInp.className = 'bb-richtext-linkpop-url';
    urlInp.addEventListener('mousedown', e => e.stopPropagation());
    const openBtn = h('button', 'bb-richtext-btn', '↗');
    openBtn.type = 'button';
    openBtn.title = t('rt.link.open');
    openBtn.setAttribute('aria-label', t('rt.link.open'));
    openBtn.addEventListener('mousedown', e => e.preventDefault());
    openBtn.addEventListener('click', () => {
      const u = urlInp.value.trim();
      if (u) window.open(u, '_blank', 'noopener,noreferrer');
    });
    const rmBtn = h('button', 'bb-richtext-btn', '✕');
    rmBtn.type = 'button';
    rmBtn.title = t('rt.link.remove');
    rmBtn.setAttribute('aria-label', t('rt.link.remove'));
    rmBtn.addEventListener('mousedown', e => e.preventDefault());
    rmBtn.addEventListener('click', () => {
      const parent = a.parentNode;
      while (a.firstChild) parent.insertBefore(a.firstChild, a);
      parent.removeChild(a);
      linkPop.hidden = true; linkPopAnchor = null;
      commit();
    });
    urlInp.addEventListener('change', () => {
      const u = urlInp.value.trim();
      if (u) { a.setAttribute('href', u); commit(); }
    });
    urlInp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); urlInp.dispatchEvent(new Event('change')); }
    });
    urlRow.append(urlInp, openBtn, rmBtn);
    linkPop.append(urlRow);

    // Position below the link in the editor's wrap-relative coords.
    const wrapR = wrap.getBoundingClientRect();
    const r = a.getBoundingClientRect();
    linkPop.style.top  = (r.bottom - wrapR.top + 4) + 'px';
    linkPop.style.left = Math.max(0, Math.min(wrapR.width - 320, r.left - wrapR.left)) + 'px';
    linkPop.hidden = false;
  }

  // ----- Image popover (alt text + size presets + remove) -----
  // Shown when the user clicks an <img> inside the editor. Anchored below
  // the image in wrap-relative coords (same idea as the link popover).
  let imgPopTarget = null;
  function showImgPopover(img) {
    if (!img) { imgPop.hidden = true; imgPopTarget = null; return; }
    imgPopTarget = img;
    imgPop.innerHTML = '';

    const altRow = h('div', 'bb-richtext-linkpop-row');
    const altInp = h('input');
    altInp.type = 'text';
    altInp.placeholder = t('rt.img.altPlaceholder');
    altInp.value = img.getAttribute('alt') || '';
    altInp.className = 'bb-richtext-linkpop-url';
    altInp.title = t('rt.img.alt');
    altInp.addEventListener('mousedown', e => e.stopPropagation());
    altInp.addEventListener('input', () => { img.setAttribute('alt', altInp.value); commit(); });
    altRow.append(altInp);
    imgPop.append(altRow);

    const sizeRow = h('div', 'bb-richtext-linkpop-row');
    const setSize = max => {
      img.style.maxWidth = max;
      // Width attribute conflicts with style max-width when both present, so
      // drop the attribute — style wins anyway but cleaner output.
      img.removeAttribute('width');
      img.removeAttribute('height');
      commit();
    };
    const sizeBtn = (label, title, max) => {
      const b = h('button', 'bb-richtext-btn', label);
      b.type = 'button';
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => setSize(max));
      return b;
    };
    sizeRow.append(
      sizeBtn('S', t('rt.img.sizeSmall'),  '300px'),
      sizeBtn('M', t('rt.img.sizeMedium'), '600px'),
      sizeBtn('L', t('rt.img.sizeFull'),   '100%'),
    );
    const rmBtn = h('button', 'bb-richtext-btn', '✕');
    rmBtn.type = 'button';
    rmBtn.title = t('rt.img.remove');
    rmBtn.setAttribute('aria-label', t('rt.img.remove'));
    rmBtn.addEventListener('mousedown', e => e.preventDefault());
    rmBtn.addEventListener('click', () => {
      img.remove();
      showImgPopover(null);
      commit();
    });
    sizeRow.append(rmBtn);
    imgPop.append(sizeRow);

    const wrapR = wrap.getBoundingClientRect();
    const r = img.getBoundingClientRect();
    imgPop.style.top  = (r.bottom - wrapR.top + 4) + 'px';
    imgPop.style.left = Math.max(0, Math.min(wrapR.width - 320, r.left - wrapR.left)) + 'px';
    imgPop.hidden = false;
  }

  // ----- Image insert (asset library picker) -----
  async function insertImageDialog() {
    // Snapshot the selection before the modal steals focus.
    const range = savedRange?.cloneRange() ?? null;
    const url = await pickAsset('image/*');
    if (!url) return;
    if (range) {
      editor.focus();
      const sel = document.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
    } else {
      restoreSelection();
    }
    document.execCommand('insertHTML', false,
      `<img src="${escAttr(url)}" alt="" style="max-width: 100%;">&nbsp;`);
    commit();
  }

  // ----- Table insert dialog -----
  function insertTableDialog() {
    const body = h('div', 'bb-richtext-tabledlg');
    body.innerHTML = `
      <div class="bb-form-row" style="grid-template-columns: 1fr 1fr;">
        <div class="bb-form-group"><label>${esc(t('rt.table.rows'))}</label><input type="number" min="1" max="20" value="3" class="bb-richtext-table-rows"></div>
        <div class="bb-form-group"><label>${esc(t('rt.table.cols'))}</label><input type="number" min="1" max="10" value="3" class="bb-richtext-table-cols"></div>
      </div>
      <label class="bb-richtext-tabledlg-check"><input type="checkbox" class="bb-richtext-table-hdr" checked> ${esc(t('rt.table.header'))}</label>
    `;
    openModal({
      title: t('rt.table.title'),
      body,
      actions: [
        { label: t('common.cancel') },
        { label: t('rt.link.insert'), kind: 'primary', value: 'go' },
      ],
      onMount: (card, close) => {
        const rEl = body.querySelector('.bb-richtext-table-rows');
        const cEl = body.querySelector('.bb-richtext-table-cols');
        const hEl = body.querySelector('.bb-richtext-table-hdr');
        const footer = card.querySelector('.bb-modal-footer');
        const ok = [...footer.querySelectorAll('button')].find(b => b.textContent.trim() === t('rt.link.insert'));
        ok?.addEventListener('click', e => {
          e.preventDefault();
          const rows = Math.max(1, Math.min(20, +rEl.value || 1));
          const cols = Math.max(1, Math.min(10, +cEl.value || 1));
          const hdr = hEl.checked;
          close('go');
          insertTableHtml(rows, cols, hdr);
        });
      },
    });
  }

  function insertTableHtml(rows, cols, hdr) {
    restoreSelection();
    document.execCommand('insertHTML', false, buildTableHtml(rows, cols, hdr));
    commit();
  }

  // ----- Table context detection + modifications -----
  function currentCell() {
    const sel = document.getSelection();
    if (!sel.rangeCount) return null;
    let n = sel.anchorNode;
    if (n && n.nodeType === 3) n = n.parentNode;
    while (n && n !== editor) {
      if (n.tagName === 'TD' || n.tagName === 'TH') return n;
      n = n.parentNode;
    }
    return null;
  }
  function refreshTableContext() {
    tableBar.hidden = !currentCell();
  }

  function modifyTable(action) {
    restoreSelection();
    const cell = currentCell();
    const table = cell?.closest('table');
    if (!table) return;
    const row = cell.parentNode;
    const section = row.parentNode;
    const allRows = [...table.querySelectorAll('tr')];
    const colCount = allRows[0]?.children.length ?? 0;
    const colIdx = [...row.children].indexOf(cell);

    const makeCell = (tag = 'td') => { const c = document.createElement(tag); c.appendChild(document.createElement('br')); return c; };
    const makeRow = (tag = 'td') => {
      const tr = document.createElement('tr');
      for (let i = 0; i < colCount; i++) tr.appendChild(makeCell(tag));
      return tr;
    };

    switch (action) {
      case 'rowAbove': {
        const tag = row.children[0]?.tagName === 'TH' ? 'th' : 'td';
        section.insertBefore(makeRow(tag), row);
        break;
      }
      case 'rowBelow': {
        // New body rows always use <td>, even when added below a header row.
        const target = section.tagName === 'THEAD' ? (table.querySelector('tbody') || section) : section;
        const ref = section === target ? row.nextSibling : target.firstChild;
        target.insertBefore(makeRow('td'), ref);
        break;
      }
      case 'colLeft': {
        for (const r of allRows) {
          const tag = r.children[0]?.tagName === 'TH' ? 'th' : 'td';
          r.insertBefore(makeCell(tag), r.children[colIdx]);
        }
        break;
      }
      case 'colRight': {
        for (const r of allRows) {
          const tag = r.children[0]?.tagName === 'TH' ? 'th' : 'td';
          r.insertBefore(makeCell(tag), r.children[colIdx + 1] ?? null);
        }
        break;
      }
      case 'delRow': {
        const sib = row.nextElementSibling || row.previousElementSibling;
        row.remove();
        if (!section.children.length) section.remove();
        if (!table.querySelector('tr')) { table.remove(); refreshTableContext(); }
        else if (sib) placeCaretIn(sib.children[Math.min(colIdx, sib.children.length - 1)]);
        break;
      }
      case 'delCol': {
        for (const r of allRows) r.children[colIdx]?.remove();
        if (!table.querySelector('td, th')) { table.remove(); refreshTableContext(); }
        break;
      }
      case 'delTable': {
        table.remove(); refreshTableContext();
        break;
      }
      case 'mergeRight': {
        // Merge the cell to the immediate right into the current one. Skips
        // cells already absorbed via colspan; works on visual columns by
        // walking the row's children sequentially.
        const right = cell.nextElementSibling;
        if (!right) break;
        const curCs = parseInt(cell.getAttribute('colspan') ?? '1', 10);
        const rCs = parseInt(right.getAttribute('colspan') ?? '1', 10);
        cell.setAttribute('colspan', String(curCs + rCs));
        // Move any non-empty content from the right cell into the current one
        // so the user doesn't silently lose typed text. Wrap moved content in
        // a space so it doesn't fuse with the previous run.
        const trim = right.textContent?.trim();
        if (trim) {
          const div = document.createElement('span');
          div.append(' ');
          while (right.firstChild) div.appendChild(right.firstChild);
          cell.appendChild(div);
        }
        right.remove();
        break;
      }
      case 'mergeDown': {
        // Vertical merge — increase rowspan on the current cell, then remove
        // the corresponding cell in the row below (matched by visual column
        // index since we track non-spanned children).
        const nextRow = row.nextElementSibling
          || row.parentNode.nextElementSibling?.firstElementChild;
        if (!nextRow) break;
        const target = nextRow.children[colIdx];
        if (!target) break;
        const curRs = parseInt(cell.getAttribute('rowspan') ?? '1', 10);
        const tRs = parseInt(target.getAttribute('rowspan') ?? '1', 10);
        cell.setAttribute('rowspan', String(curRs + tRs));
        const trim = target.textContent?.trim();
        if (trim) {
          const div = document.createElement('span');
          div.append(' ');
          while (target.firstChild) div.appendChild(target.firstChild);
          cell.appendChild(div);
        }
        target.remove();
        break;
      }
      case 'splitCell': {
        // Reset spans to 1 and re-insert blank cells so the table grid stays
        // rectangular. Right neighbours fill in horizontally first; if there
        // was a rowspan, blank cells go into the rows below at the same idx.
        const cs = parseInt(cell.getAttribute('colspan') ?? '1', 10);
        const rs = parseInt(cell.getAttribute('rowspan') ?? '1', 10);
        cell.removeAttribute('colspan');
        cell.removeAttribute('rowspan');
        for (let i = 1; i < cs; i++) {
          row.insertBefore(makeCell(cell.tagName === 'TH' ? 'th' : 'td'), cell.nextSibling);
        }
        if (rs > 1) {
          let r = row.nextElementSibling
            || row.parentNode.nextElementSibling?.firstElementChild;
          for (let step = 1; step < rs && r; step++) {
            const ref = r.children[colIdx] ?? null;
            for (let i = 0; i < cs; i++) r.insertBefore(makeCell('td'), ref);
            r = r.nextElementSibling
              || r.parentNode.nextElementSibling?.firstElementChild;
          }
        }
        break;
      }
    }
    commit();
  }

  function placeCaretIn(node) {
    if (!node) return;
    const sel = document.getSelection();
    const r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function handleTableTab(e) {
    if (e.key !== 'Tab') return;
    const cell = currentCell();
    if (!cell) return;
    e.preventDefault();
    if (e.shiftKey) {
      let prev = cell.previousElementSibling;
      if (!prev) {
        const prevRow = cell.parentNode.previousElementSibling
          || cell.parentNode.parentNode.previousElementSibling?.lastElementChild;
        if (prevRow) prev = prevRow.children[prevRow.children.length - 1];
      }
      if (prev) placeCaretIn(prev);
      return;
    }
    let next = cell.nextElementSibling;
    if (!next) {
      let nextRow = cell.parentNode.nextElementSibling
        || cell.parentNode.parentNode.nextElementSibling?.firstElementChild;
      if (!nextRow) {
        // End of table — append a new row.
        const table = cell.closest('table');
        const tbody = table.querySelector('tbody') || (() => {
          const t = document.createElement('tbody'); table.appendChild(t); return t;
        })();
        const cols = cell.parentNode.children.length;
        const tr = document.createElement('tr');
        for (let i = 0; i < cols; i++) {
          const td = document.createElement('td');
          td.appendChild(document.createElement('br'));
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
        nextRow = tr;
        commit();
      }
      next = nextRow?.children[0];
    }
    if (next) placeCaretIn(next);
  }

  // ----- Markdown shortcuts (fire on space) -----
  function handleMarkdownShortcut(e) {
    if (e.inputType !== 'insertText' || e.data !== ' ') return;
    const sel = document.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== 3) return;
    const text = node.textContent;
    const caret = range.startOffset;
    const before = text.slice(0, caret);

    // Block prefixes — only fire when the prefix is the entire text of a fresh line.
    const blockPrefixes = [
      { re: /^- $/,    cmd: () => document.execCommand('insertUnorderedList') },
      { re: /^\* $/,   cmd: () => document.execCommand('insertUnorderedList') },
      { re: /^1\. $/,  cmd: () => document.execCommand('insertOrderedList') },
      { re: /^> $/,    cmd: () => document.execCommand('formatBlock', false, 'blockquote') },
      { re: /^## $/,   cmd: () => document.execCommand('formatBlock', false, 'h2') },
      { re: /^### $/,  cmd: () => document.execCommand('formatBlock', false, 'h3') },
    ];
    for (const p of blockPrefixes) {
      if (p.re.test(before) && isBlockStart(node)) {
        replaceText(node, 0, caret, '');
        p.cmd();
        return;
      }
    }

    // Inline patterns (anywhere on the line). Strip the just-typed trailing
    // space before matching: it's the trigger, not part of the pattern.
    const stem = before.slice(0, -1);
    const boldM = stem.match(/\*\*([^*\n]+)\*\*$/);
    if (boldM) { wrapPattern(node, caret - 1 - boldM[0].length, caret, boldM[1], 'strong'); return; }
    const codeM = stem.match(/`([^`\n]+)`$/);
    if (codeM) { wrapPattern(node, caret - 1 - codeM[0].length, caret, codeM[1], 'code'); return; }
    const strikeM = stem.match(/~~([^~\n]+)~~$/);
    if (strikeM) { wrapPattern(node, caret - 1 - strikeM[0].length, caret, strikeM[1], 's'); return; }
  }

  function isBlockStart(node) {
    // True if `node` is the very first text inside its closest block ancestor.
    let p = node.parentNode;
    while (p && p !== editor) {
      const t = p.tagName;
      if (t === 'P' || t === 'DIV' || t === 'LI' || t === 'BLOCKQUOTE' || t === 'H2' || t === 'H3') {
        return p.firstChild === node;
      }
      p = p.parentNode;
    }
    return editor.firstChild === node;
  }

  function replaceText(node, from, to, replacement) {
    const text = node.textContent;
    node.textContent = text.slice(0, from) + replacement + text.slice(to);
    const sel = document.getSelection();
    const r = document.createRange();
    r.setStart(node, from + replacement.length);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function wrapPattern(node, from, to, inner, tag) {
    const text = node.textContent;
    const after = text.slice(to);
    const before = text.slice(0, from);
    node.textContent = before;
    const el = document.createElement(tag);
    el.textContent = inner;
    const parent = node.parentNode;
    parent.insertBefore(el, node.nextSibling);
    const tail = document.createTextNode(' ' + after); // keep the typed space outside the tag
    parent.insertBefore(tail, el.nextSibling);
    const sel = document.getSelection();
    const r = document.createRange();
    r.setStart(tail, 1);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    commit();
  }

  // ----- Auto-linkify on space -----
  function handleAutoLink(e) {
    if (e.inputType !== 'insertText' || e.data !== ' ') return;
    const sel = document.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== 3) return;
    // Already inside an <a>? Skip.
    let p = node.parentNode;
    while (p && p !== editor) {
      if (p.tagName === 'A') return;
      p = p.parentNode;
    }
    const text = node.textContent;
    const caret = range.startOffset;
    const before = text.slice(0, caret - 1); // exclude the just-typed space
    const m = before.match(/(https?:\/\/[^\s<>]+|www\.[^\s<>]+\.[^\s<>]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)$/);
    if (!m) return;
    const url = m[0];
    const href = url.startsWith('www.') ? 'https://' + url
               : url.includes('@') && !url.startsWith('mailto:') ? 'mailto:' + url
               : url;
    if (!/^(https?:|mailto:)/i.test(href)) return;
    const matchStart = caret - 1 - url.length;
    const after = text.slice(caret);
    node.textContent = text.slice(0, matchStart);
    const a = document.createElement('a');
    a.setAttribute('href', href);
    a.textContent = url;
    const parent = node.parentNode;
    parent.insertBefore(a, node.nextSibling);
    const tail = document.createTextNode(' ' + after);
    parent.insertBefore(tail, a.nextSibling);
    const r = document.createRange();
    r.setStart(tail, 1);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // ----- Popovers (emoji, special chars) -----
  function togglePopover(e, content) {
    if (!popover.hidden && popover._owner === e.currentTarget) {
      popover.hidden = true; popover._owner = null; return;
    }
    popover.innerHTML = '';
    popover.appendChild(content);
    popover.hidden = false;
    popover._owner = e.currentTarget;
    const r = e.currentTarget.getBoundingClientRect();
    const wrapR = wrap.getBoundingClientRect();
    popover.style.top  = (r.bottom - wrapR.top + 4) + 'px';
    popover.style.left = Math.max(0, r.left - wrapR.left) + 'px';
  }
  function closePopoverOnOutsideClick(e) {
    if (!popover.hidden && !popover.contains(e.target) && !popover._owner?.contains(e.target)) {
      popover.hidden = true; popover._owner = null;
    }
    // Image popover: hide when click lands outside both the popover and the
    // currently-targeted image.
    if (!imgPop.hidden && !imgPop.contains(e.target) && e.target !== imgPopTarget) {
      showImgPopover(null);
    }
  }
  document.addEventListener('mousedown', closePopoverOnOutsideClick);

  const EMOJIS = (
    '😀 😃 😄 😁 😆 😊 😉 😍 😘 😎 🤩 🤔 😴 😢 😭 😡 ' +
    '👍 👎 👏 🙏 💪 👋 ✋ 🤝 ✌️ 🤞 👀 🧠 ' +
    '❤️ 💛 💚 💙 💜 🖤 🤍 ❣️ 💔 💯 🔥 ✨ 💡 ⭐ ⚡ ☀️ ' +
    '🎉 🎊 🎈 🎁 🏆 🥇 🏅 ' +
    '✅ ❌ ⚠️ ❗ ❓ ℹ️ 🔔 📢 📣 ' +
    '📅 📆 ⏰ 🕐 ⏳ 🚀 🛠️ 🔧 💻 📱 🖥️ 🖨️ ' +
    '☕ 🍰 🍕 🍔 🥗 ' +
    '🏠 🏢 🌍 🌎 🌏'
  ).split(' ').filter(Boolean);

  function emojiPopover() {
    const grid = h('div', 'bb-richtext-pop-grid');
    for (const em of EMOJIS) {
      const b = h('button', 'bb-richtext-pop-cell', em);
      b.type = 'button';
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => insertAtCaret(em));
      grid.append(b);
    }
    return grid;
  }

  const CHARS = [
    '—', '–', '…', '·', '•', '°', '′', '″',
    '©', '®', '™', '§', '¶', '†', '‡',
    '«', '»', '„', '“', '”', '‚', '‘', '’',
    '×', '÷', '±', '≈', '≠', '≤', '≥', '∞', '√', 'π',
    '→', '←', '↑', '↓', '↔', '⇒', '⇐',
    '★', '☆', '♥', '♦', '♣', '♠',
    '€', '$', '£', '¥', '¢',
  ];
  function charPopover() {
    const grid = h('div', 'bb-richtext-pop-grid');
    for (const ch of CHARS) {
      const b = h('button', 'bb-richtext-pop-cell', ch);
      b.type = 'button';
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => insertAtCaret(ch));
      grid.append(b);
    }
    return grid;
  }

  function insertAtCaret(text) {
    restoreSelection();
    document.execCommand('insertText', false, text);
    commit();
    popover.hidden = true; popover._owner = null;
  }

  // ----- Word + character counter -----
  function updateStatus() {
    const txt = (editor.textContent ?? '').trim();
    const chars = (editor.textContent ?? '').length;
    const words = txt ? txt.split(/\s+/).filter(Boolean).length : 0;
    status.textContent = `${words} ${words === 1 ? tx('word') : tx('words')} · ${chars} ${chars === 1 ? tx('character') : tx('characters')}`;
  }
  updateStatus();
  refreshActiveStates();

  // ----- Expand to full-screen modal -----
  // Opens a second renderRichText instance in `compact` mode (no Expand
  // button) inside a wide modal. The wrapper set forwards every edit to the
  // outer `set` callback so the inspector receives changes live; on close we
  // also push the latest value into the inspector's own editor in case it
  // didn't re-render on state changes during the modal's lifetime.
  function openExpanded() {
    const startValue = sanitizeHtml(editor.innerHTML);
    let latestValue = startValue;
    const wrappedSet = (newValue) => { latestValue = newValue; set(newValue); };

    const modalBody = h('div', 'bb-richtext-modal-body');
    const inst = renderRichText(f, startValue, wrappedSet, { compact: true });
    modalBody.append(inst.el);

    openModal({
      title: f.label || t('rt.editTitle'),
      body: modalBody,
      actions: [{ label: t('rt.done'), kind: 'primary', value: true }],
      onMount: (card) => {
        card.classList.add('bb-modal-richtext');
        // Focus the modal editor so the user can start typing immediately.
        setTimeout(() => inst.el.querySelector('.bb-richtext-editor')?.focus(), 30);
      },
    }).then(() => {
      inst.dispose?.();
      if (editor.innerHTML !== latestValue) {
        editor.innerHTML = latestValue;
        lastEmitted = latestValue;
        updateStatus();
        refreshActiveStates();
      }
    });
  }

  // ----- Mount -----
  wrap.append(bar, more, tableBar, editor, status, popover, linkPop, imgPop);
  return {
    el: wrap,
    dispose() {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('mousedown', closePopoverOnOutsideClick);
    },
  };
}
