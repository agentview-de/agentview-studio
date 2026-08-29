// Handing a file to the browser, and taking one back.
//
// The app does this in two places — "Export playlist" / "Import playlist" and
// the custom-widget share buttons — and it built the same six lines twice,
// differently:
//
//   custom-widget-actions.js   appended the <a>, clicked, removed it, and
//                              revoked the blob URL a second later
//   playlist-io.js             did none of that
//
// A detached <a download> does not start a download in Firefox at all, and
// revoking the object URL in the same tick as the click races the download it
// just started. So the weaker of the two was guarding the more valuable file:
// "Export playlist" is the only backup this app can produce.
//
// The import side had the same split. A file <input> that is never in the
// document has its .click() ignored by some browsers, and one that is never
// removed piles up another detached node on every import.
//
// One pair of functions, so the two paths cannot drift apart again.

/**
 * Offer `value` to the user as a downloaded JSON file.
 *
 * @param {string} filename  including the extension
 * @param {unknown} value    serialised with two-space indent
 */
export function downloadJson(filename, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  downloadBlob(filename, new Blob([text], { type: 'application/json' }));
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  // In the document BEFORE the click, out of it after — Firefox ignores a
  // click on an anchor that was never in the tree.
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Not in this tick: the download the click started still needs the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Ask the user for files and resolve the File objects.
 *
 * The same shape as pickJsonFile below — the input goes INTO the document
 * before it is clicked and comes back out afterwards. A file input that was
 * never in the tree is the sibling of the anchor above: Chrome humours it,
 * others do not fire `change` at all, and the node leaks either way. The asset
 * library hand-rolled two of these before this existed.
 *
 * @param {{ accept?: string, multiple?: boolean }} [opts]
 * @returns {Promise<File[]>} empty when the picker is dismissed
 */
export function pickFiles({ accept = '', multiple = false } = {}) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.multiple = !!multiple;
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = (files) => { input.remove(); resolve(files); };
    input.addEventListener('change', () => done([...(input.files ?? [])]), { once: true });
    input.addEventListener('cancel', () => done([]), { once: true });
    input.click();
  });
}

/**
 * Ask the user for one file and resolve its text.
 *
 * Resolves `null` when the picker is dismissed — browsers that fire `cancel`
 * on a file input clean up straight away; the rest leave the hidden input
 * until the next pick replaces it, which is the same one node, not a pile.
 *
 * @returns {Promise<{ name: string, text: string } | null>}
 */
export async function pickJsonFile({ accept = 'application/json,.json' } = {}) {
  const [file] = await pickFiles({ accept });
  if (!file) return null;
  try { return { name: file.name, text: await file.text() }; } catch { return null; }
}
