import { register } from './registry.js';
import { colorOverrideDefaults, themeColorSection, applyColorOverrides } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { liveSource } from '../live-source.js';
import { isStored, dataModeField, offlineLiveOpts } from '../offline-data.js';
import { refreshSecField, refreshIntervalMs } from '../refresh-field.js';
import { textScaleField } from '../text-scale.js';
import { escapeHtml } from '../utils/escape.js';

// Pretty-print a JSON value as syntax-highlighted HTML.
//   maxDepth  0 = unlimited; otherwise containers nested AT this depth collapse
//             to a "{… n keys}" / "[… n items]" stub so deep payloads stay on
//             one screen.
//   prev      the SAME node from the previous poll (threaded down the tree);
//             a primitive whose value differs gets the bb-j-chg flash class.
//             undefined = no previous data (first paint) → never flashes.
function pretty(v, indent = 0, maxDepth = 0, prev = undefined) {
  const pad = '  '.repeat(indent);
  const chg = prev !== undefined && !Object.is(prev, v) ? ' bb-j-chg' : '';
  if (v === null) return `<span class="bb-j-n${chg}">null</span>`;
  if (typeof v === 'boolean') return `<span class="bb-j-b${chg}">${v}</span>`;
  if (typeof v === 'number')  return `<span class="bb-j-num${chg}">${v}</span>`;
  if (typeof v === 'string')  return `<span class="bb-j-s${chg}">"${escapeHtml(v)}"</span>`;
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    if (maxDepth > 0 && indent >= maxDepth) return `<span class="bb-j-n">[… ${v.length} ${v.length === 1 ? 'item' : 'items'}]</span>`;
    const prevArr = Array.isArray(prev) ? prev : undefined;
    return '[\n' + v.map((x, i) => pad + '  ' + pretty(x, indent + 1, maxDepth, prevArr?.[i])).join(',\n') + '\n' + pad + ']';
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 0) return '{}';
    if (maxDepth > 0 && indent >= maxDepth) return `<span class="bb-j-n">{… ${keys.length} ${keys.length === 1 ? 'key' : 'keys'}}</span>`;
    const prevObj = prev !== null && typeof prev === 'object' && !Array.isArray(prev) ? prev : undefined;
    return '{\n' + keys.map(k => pad + '  <span class="bb-j-k">"' + escapeHtml(k) + '"</span>: ' + pretty(v[k], indent + 1, maxDepth, prevObj?.[k])).join(',\n') + '\n' + pad + '}';
  }
  return String(v);
}

// Resolve a dot/bracket path ("data.items[0].status") against a fetched object.
// Returns { found:true, value } or { found:false } — the caller renders a clear
// inline notice on a miss instead of guessing.
function resolvePath(obj, path) {
  const tokens = String(path).match(/[^.[\]]+/g) ?? [];
  let cur = obj;
  for (const t of tokens) {
    if (cur === null || typeof cur !== 'object' || !(t in cur)) return { found: false };
    cur = cur[t];
  }
  return { found: true, value: cur };
}

// One-time <style> for the change-flash animation. Widget-internal (only the
// .bb-j-chg spans this plugin emits use it); keyframes can't be inlined.
// Colour comes from the accent var so it follows theme/brand kit — no
// hardcoded colour, survives light themes via the currentColor fallback.
const FLASH_STYLE_ID = 'bb-livejson-flash-style';
function ensureFlashStyle() {
  if (document.getElementById(FLASH_STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = FLASH_STYLE_ID;
  st.textContent =
    '@keyframes bb-json-flash { from { background: color-mix(in srgb, var(--bb-st-accent, currentColor) 35%, transparent); } to { background: transparent; } }\n' +
    '.bb-j-chg { animation: bb-json-flash 1.5s ease-out; border-radius: 3px; }\n' +
    // Same shape as icon.js's pulse guard: the value still updates, it just
    // stops flashing for a viewer who asked for less motion.
    '@media (prefers-reduced-motion: reduce) { .bb-j-chg { animation: none; } }';
  document.head.appendChild(st);
}

export default register({
  type: 'live-json',
  label: 'Live JSON Viewer',
  group: 'data',
  icon: '{ }',
  network: true,
  schemaVersion: 2,
  defaults: () => ({ ...colorOverrideDefaults(),
    dataMode: 'live', url: '', path: '', refreshSec: 30,
    textScale: 100, maxDepth: 0, showUpdated: false, flashChanges: false,
    theme: 'dark-minimal' }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'data', label: 'Data' },
      dataModeField(),
      { key: 'url', type: 'url', label: 'JSON URL', test: 'json',
        placeholder: 'https://api.example.com/data.json',
        help: 'Live mode: fetched on the display. Offline mode: fetched only by the Studio when you click "Refresh data". Must return JSON and allow CORS for whichever side fetches it.' },
      { key: 'path', type: 'text', label: 'JSON path',
        placeholder: 'data.items[0].status',
        help: 'Show only this part of the response. Dot and [index] notation. Leave empty for the whole document.' },
      { ...refreshSecField({ showIf: c => c.dataMode !== 'stored' }),
        validate: (v) => {
          const s = Number(v) || 0;
          return s > 0 && s < 5
            ? { level: 'warn', message: 'Very frequent polling — make sure the API allows it.' }
            : null;
        } },

      { type: 'section', key: 'appearance', label: 'Appearance' },
      { ...textScaleField(), tier: 'advanced' },
      { key: 'maxDepth', type: 'number', label: 'Max depth (0 = unlimited)',
        min: 0, max: 8, step: 1, slider: true,
        tier: 'advanced',
        help: 'Collapse anything nested deeper than this to {…} / [… n items] so large payloads stay on one screen.' },
      { key: 'showUpdated', type: 'toggle', label: 'Show last-updated stamp',
        help: 'Small footer with the time of the last successful refresh — a trust signal for status boards.' },
      { key: 'flashChanges', type: 'toggle', label: 'Highlight changes',
        tier: 'advanced',
        help: 'Briefly flashes values that changed since the previous refresh, so live dashboards are visibly alive.',
        showIf: c => c.dataMode !== 'stored' },

      ...themeColorSection(),
    ],
  }),
  render(slide, container, ctx) {
    const c = slide.content ?? {};
    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-livejson bb-theme-${c.theme ?? 'dark-minimal'}`;
    root.style.setProperty('--bb-json-text-scale', String((Number(c.textScale) || 100) / 100));
    root.innerHTML = `${slide.title ? `<h1 class="bb-h1">${escapeHtml(slide.title)}</h1>` : ''}<pre class="bb-json" data-field="url path textScale maxDepth flashChanges theme"></pre>`;
    container.appendChild(root);
    const out = root.querySelector('.bb-json');

    // Offline / provided mode: the data was pre-fetched by the Studio and lives in
    // a data slot, injected here as `content._offline` via a slot binding (set at
    // publish). The display reads that — no live fetch, no API key.
    const stored = isStored(c);
    const offlineData = c._offline?.data;
    const pathStr = String(c.path ?? '').trim();

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
      const refresh = Number(c.refreshSec ?? 30) || 0;
      out.innerHTML =
        `<span class="bb-j-k">"url"</span>: <span class="bb-j-s">"${escapeHtml(c.url)}"</span>\n` +
        (pathStr ? `<span class="bb-j-k">"path"</span>: <span class="bb-j-s">"${escapeHtml(pathStr)}"</span>\n` : '') +
        `<span class="bb-j-k">"source"</span>: <span class="bb-j-s">"${stored
          ? 'offline · from data slot'
          : refresh > 0 ? 'live · polls every ' + Math.max(5, refresh) + 's' : 'live · fetched once'}"</span>`;
      return composeDispose(() => root.remove());
    }

    // Last-updated stamp: the trust signal for status boards. In stored mode a
    // live clock would lie (data only changes when the Studio re-provisions), so
    // it shows the provisioning state instead. When polling gives up after 3
    // errors the stamp visibly stops moving — that's the point.
    let stamp = null;
    if (c.showUpdated) {
      stamp = document.createElement('div');
      stamp.className = 'bb-json-updated';
      stamp.style.cssText =
        'margin-top:10px;font-family:var(--bb-mono);font-size:clamp(11px,1.6cqmin,15px);' +
        'color:var(--bb-st-accent,currentColor);opacity:.75;';
      root.appendChild(stamp);
    }
    const stampNow = () => {
      if (!stamp) return;
      stamp.textContent = stored ? 'Provided offline' : 'Updated ' + new Date().toLocaleTimeString();
    };

    const maxDepth = Math.max(0, Math.min(8, Number(c.maxDepth) || 0));
    const flash = c.flashChanges === true && !stored;
    if (flash) ensureFlashStyle();
    let prevView; // previous poll's (path-filtered) payload, for change flashing

    out.textContent = 'Loading…';
    // The shared live-source seam owns the fetch, abort, poll timer and error
    // backoff (stop after 3 errors OR the first CORS-shaped failure); this
    // plugin owns only the JSON rendering and the error copy. In stored mode it
    // renders the injected offline data and never touches the network. 0 = fetch
    // once; positive intervals are clamped UP to the 5 s player floor.
    const refreshSec = Math.max(0, Number(c.refreshSec ?? 30) || 0);
    const stop = liveSource({
      url: c.url,
      signal: ctx?.signal,
      intervalMs: stored || refreshSec <= 0 ? 0 : refreshIntervalMs(refreshSec),
      ...offlineLiveOpts(c),
      fetchInit: { cache: 'no-store' },
      maxErrors: 3,
      onData: (data) => {
        let view = data;
        if (pathStr) {
          const r = resolvePath(data, pathStr);
          if (!r.found) {
            out.innerHTML = `<span class="bb-j-n">Path "${escapeHtml(pathStr)}" not found in the response — clear the JSON path field to show the whole document.</span>`;
            prevView = undefined;
            stampNow();
            return;
          }
          view = r.value;
        }
        out.innerHTML = pretty(view, 0, maxDepth, flash ? prevView : undefined);
        prevView = view;
        stampNow();
      },
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
