import { register } from './registry.js';
import { themeField } from '../data/themes.js';
import { colorOverrideDefaults, colorOverrideFields, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { liveSource } from '../live-source.js';
import { isStored, offlineLiveOpts, DATAMODE_OPTIONS } from '../offline-data.js';
import { escapeHtml } from '../utils/escape.js';

function pretty(v, indent = 0) {
  const pad = '  '.repeat(indent);
  if (v === null) return '<span class="bb-j-n">null</span>';
  if (typeof v === 'boolean') return `<span class="bb-j-b">${v}</span>`;
  if (typeof v === 'number')  return `<span class="bb-j-num">${v}</span>`;
  if (typeof v === 'string')  return `<span class="bb-j-s">"${escapeHtml(v)}"</span>`;
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return '[\n' + v.map(x => pad + '  ' + pretty(x, indent + 1)).join(',\n') + '\n' + pad + ']';
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 0) return '{}';
    return '{\n' + keys.map(k => pad + '  <span class="bb-j-k">"' + escapeHtml(k) + '"</span>: ' + pretty(v[k], indent + 1)).join(',\n') + '\n' + pad + '}';
  }
  return String(v);
}

export default register({
  type: 'live-json',
  label: 'Live JSON Viewer',
  group: 'data',
  icon: '{ }',
  network: true,
  schemaVersion: 2,
  defaults: () => ({ ...colorOverrideDefaults(), dataMode: 'live', url: '', refreshSec: 30, theme: 'dark-minimal' }),
  schema: () => ({
    fields: [
      { key: 'dataMode', type: 'select', label: 'Data source', default: 'live', options: DATAMODE_OPTIONS,
        help: 'Offline: the Studio fetches the URL on "Refresh data" and stores the result in agentView; the display reads that — no live API call, no API key, works without internet on the screen.' },
      { key: 'url', type: 'url', label: 'JSON URL', test: 'json',
        placeholder: 'https://api.example.com/data.json',
        help: 'Live mode: fetched on the display. Offline mode: fetched only by the Studio when you click "Refresh data". Must return JSON and allow CORS for whichever side fetches it.' },
      { key: 'refreshSec', type: 'duration', label: 'Refresh interval', min: 1, default: 30, showIf: c => c.dataMode !== 'stored' },
      themeField(),
      ...colorOverrideFields(),
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-livejson bb-theme-${c.theme ?? 'dark-minimal'}`;
    root.innerHTML = `${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}<pre class="bb-json"></pre>`;
    container.appendChild(root);
    const out = root.querySelector('.bb-json');

    // Offline / provided mode: the data was pre-fetched by the Studio and lives in
    // a data slot, injected here as `content._offline` via a slot binding (set at
    // publish). The display reads that — no live fetch, no API key.
    const stored = isStored(c);
    const offlineData = c._offline?.data;

    if (!stored && !c.url) {
      out.textContent = 'Set a JSON URL in the form.';
      return composeDispose(() => root.remove());
    }
    // Stored mode but nothing provisioned yet (no slot data, e.g. editor preview
    // before the first "Refresh data"): show a neutral placeholder, not an error.
    if (stored && offlineData === undefined) {
      out.textContent = c.url
        ? 'Provided-offline data — appears on the display after “Refresh data”.'
        : 'Set a JSON URL, then click “Refresh data” to provision it.';
      return composeDispose(() => root.remove());
    }

    // In thumbnail / card-preview mode skip fetching entirely, the result is
    // illegible at thumbnail size and external fetches risk CORS noise.
    if (ctx?.mode === 'preview' && ctx?.thumbnail) {
      out.innerHTML =
        `<span class="bb-j-k">"url"</span>: <span class="bb-j-s">"${escapeHtml(c.url)}"</span>\n` +
        `<span class="bb-j-k">"source"</span>: <span class="bb-j-s">"${stored ? 'offline · from data slot' : 'live · polls every ' + (c.refreshSec ?? 30) + 's'}"</span>`;
      return composeDispose(() => root.remove());
    }

    out.textContent = 'Loading…';
    // The shared live-source seam owns the fetch, abort, poll timer and error
    // backoff (stop after 3 errors OR the first CORS-shaped failure); this
    // plugin owns only the JSON rendering and the error copy. In stored mode it
    // renders the injected offline data and never touches the network.
    const stop = liveSource({
      url: c.url,
      signal: ctx?.signal,
      intervalMs: stored ? 0 : (c.refreshSec ?? 30) * 1000,
      ...offlineLiveOpts(c),
      fetchInit: { cache: 'no-store' },
      maxErrors: 3,
      onData: (data) => { out.innerHTML = pretty(data, 0); },
      onError: (e, info) => {
        if (!info.gaveUp || ctx?.onError?.()) return;
        out.innerHTML = `
              <div class="bb-json-error">
                <div class="bb-json-error-title">⚠️ ${info.cors ? 'CORS blocked' : 'Unavailable'}</div>
                <div class="bb-json-error-msg">${escapeHtml(c.url)}</div>
                <div class="bb-json-error-hint">${info.cors
                  ? 'The target server does not return Access-Control-Allow-Origin. Pick a CORS-enabled feed, or proxy it via an agentView data slot.'
                  : 'Retried 3 times. Stopped polling. ' + escapeHtml(e.message)}</div>
              </div>`;
      },
    });
    return composeDispose(() => { stop(); root.remove(); });
  },
});

