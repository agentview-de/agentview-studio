// Pure table-markup builder for the rich-text editor. Extracted from rich-text.js
// so the markup shape is unit-testable without a DOM. The editor calls this and
// then restores the selection, inserts via execCommand('insertHTML'), and
// commits — those side effects stay in rich-text.js.

// Build a `rows`×`cols` table. With `hdr`, the first row is a <th> header row in
// a <thead> and the remaining rows are <td> in a <tbody>; otherwise every row is
// <td>. Each cell holds a <br> so it has height and a caret target. A trailing
// `<p><br></p>` gives the caret somewhere to go after the table.
export function buildTableHtml(rows, cols, hdr) {
  const cell = tag => `<${tag}><br></${tag}>`;
  const row = tag => `<tr>${Array.from({ length: cols }, () => cell(tag)).join('')}</tr>`;
  let html = '<table>';
  if (hdr) {
    html += `<thead>${row('th')}</thead>`;
    html += `<tbody>${Array.from({ length: Math.max(0, rows - 1) }, () => row('td')).join('')}</tbody>`;
  } else {
    html += `<tbody>${Array.from({ length: rows }, () => row('td')).join('')}</tbody>`;
  }
  html += '</table><p><br></p>';
  return html;
}
