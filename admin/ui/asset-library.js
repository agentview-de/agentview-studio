// Asset library panel + asset picker modal.

import { assets as api } from '../api.js';
import { openModal } from './modal.js';
import { state, subscribe } from '../store.js';
import { toast } from './toast.js';
import { makeDropZone } from './drag-drop.js';
import { t, tx } from '../i18n.js';
import { isSafeImgUrl } from '../../shared/safe-url.js';
import { escapeHtml, escapeAttr } from '../../shared/utils/escape.js';

// Canonical agentView field is `mimeType` (Screen.Central.Contracts.AssetItem);
// older payloads or other shops use `mime` / `contentType` / `type`. Centralise
// the fallback chain so the picker filter, the bg-image test, and assetCard
// all agree — a stray omission was hiding every image from accept-filtered
// pickers (e.g. the QR-code logo picker).
function assetMime(a) {
  return a?.mimeType ?? a?.mime ?? a?.contentType ?? a?.type ?? '';
}

function assetName(a) {
  return a?.name ?? a?.filename ?? a?.url ?? '';
}

// Accept-string matcher used by both pickers. The native <input accept="…">
// grammar mixes mime types ("image/*", "application/pdf") with literal file
// extensions (".vtt", ".csv"). Mime types are matched against the asset's
// `mimeType` field; extensions against the filename — because servers often
// hand out "text/plain" or "application/octet-stream" for niche formats and
// a strict mime check would silently hide every VTT / CSV / etc.
function assetMatchesAccept(a, acceptStr) {
  if (!acceptStr) return true;
  const mime = assetMime(a);
  const name = assetName(a).toLowerCase();
  return acceptStr.split(',').some(raw => {
    const t = raw.trim().toLowerCase();
    if (!t) return false;
    if (t.startsWith('.')) return name.endsWith(t);
    if (t.endsWith('/*')) return mime.toLowerCase().startsWith(t.slice(0, -2));
    return mime.toLowerCase() === t;
  });
}

// Some agentView endpoints return a bare array, others wrap it. Try several
// candidate keys so we don't show "empty" when the data is actually there.
function unwrapList(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  for (const k of ['items', 'assets', 'data', 'results', 'files', 'list']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  // Object of {id → asset}
  const values = Object.values(raw).filter(v => v && typeof v === 'object');
  if (values.length && values.every(v => 'id' in v || 'name' in v || 'url' in v || 'filename' in v)) return values;
  // Recursive walk: find the first nested array of assetish objects.
  for (const v of Object.values(raw)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v;
    if (v && typeof v === 'object') {
      const nested = unwrapList(v);
      if (nested.length) return nested;
    }
  }
  return [];
}

export async function refresh() {
  try {
    const raw = await api.list();
    const list = unwrapList(raw);
    state.library.assets = list;
    if (list.length === 0 && raw && typeof raw === 'object' && Object.keys(raw).length > 0) {
      console.warn('[bb] asset list response had unknown shape; keys =', Object.keys(raw));
    }
    try { state.library.quota = await api.quota(); } catch {}
  } catch (e) {
    toast(`${tx('Library refresh failed')}: ${e.message}`, { kind: 'warn' });
    console.error('[bb] asset list failed', e);
  }
}

export function renderPanel(host) {
  const render = () => {
    const items = state.library.assets ?? [];
    host.innerHTML = `
      <div class="bb-lib-toolbar">
        <button class="bb-btn bb-btn-secondary" data-act="refresh" title="${escapeAttr(tx('Refresh'))}">🔄</button>
        <button class="bb-btn bb-btn-primary" data-act="upload" title="${escapeAttr(tx('Upload from disk'))}">⬆ ${tx('Upload')}</button>
        <span class="bb-lib-count">${items.length} ${tx('assets')}</span>
      </div>
      <div class="bb-lib-quota">
        ${state.library.quota ? formatQuota(state.library.quota) : `<span style="font-size:11px;color:var(--bb-ink-faint);">${tx('Quota')}: —</span>`}
      </div>
      <div class="bb-lib-dropzone" id="lib-dropzone">
        <span class="bb-lib-dropzone-icon">📎</span>
        <span class="bb-lib-dropzone-text">${tx('Drop files here to upload')}</span>
      </div>
      <div class="bb-lib-grid">
        ${items.length === 0
          ? `<div class="bb-empty-state"><div class="bb-empty-illus">📦</div><div class="bb-empty-title">${tx('No assets yet')}</div><div class="bb-empty-desc">${tx('Click <b>Upload</b> above, drop files in the box, or drop directly onto an image / video / PDF slide form.')}</div></div>`
          : items.map(a => assetCard(a)).join('')}
      </div>
    `;
    host.querySelector('[data-act="refresh"]').addEventListener('click', () => refresh());
    host.querySelector('[data-act="upload"]').addEventListener('click', () => openUploadPicker());
    const dz = host.querySelector('#lib-dropzone');
    makeDropZone(dz, async ({ files }) => {
      if (!files.length) return;
      await uploadMany(files);
    });
    // Allow clicking an asset card to copy its URL.
    host.querySelectorAll('.bb-asset-card').forEach(card => {
      card.addEventListener('click', () => {
        const url = card.dataset.url;
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => toast(tx('URL copied to clipboard'), { kind: 'success' }));
      });
    });
    // Attach onerror→doc-fallback handlers for image thumbnails.
    wireAssetThumbs(host);
  };
  subscribe('library', render);
  render();
}

function openUploadPicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.addEventListener('change', async () => {
    const files = [...(input.files ?? [])];
    if (!files.length) return;
    await uploadMany(files);
  });
  input.click();
}

async function uploadMany(files) {
  let ok = 0, failed = 0;
  for (const f of files) {
    const url = await uploadAndGetUrl(f);
    if (url) ok++; else failed++;
  }
  if (ok) toast(`${tx('Uploaded')} ${ok} ${ok === 1 ? tx('file') : tx('files')}`, { kind: 'success' });
  if (failed) toast(`${failed} ${tx('upload(s) failed')}`, { kind: 'warn' });
  refresh();
}

// Render the thumbnail area of an asset card. Uses an <img> element instead
// of a CSS background-image because:
//   1. `<img>` fires an `error` event on load failure (404, CORS-mangled CDN
//      configs, expired signed URLs, mixed content); CSS bg-image silently
//      leaves a blank rectangle. We surface failures via console + a doc
//      fallback so users see WHY a thumb is blank.
//   2. `loading="lazy"` + `decoding="async"` let off-screen thumbs defer
//      their decode work — meaningful with 50+ assets in a long list.
// `wireAssetThumbs(host)` must be called once after innerHTML is set, to
// attach the onerror→doc-fallback handler.
function isImageAsset(mime, name) {
  return /^image\//.test(mime) || /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(name);
}

function thumbHtml({ url, mime, name }) {
  const fallback = extLabel(mime, name);
  const safeUrl = url && isImageAsset(mime, name) && isSafeImgUrl(url) ? url : '';
  if (safeUrl) {
    return `<div class="bb-asset-thumb">` +
      `<img src="${escapeAttr(safeUrl)}" alt="" loading="lazy" decoding="async" ` +
      `data-fallback="${escapeAttr(fallback)}">` +
    `</div>`;
  }
  return `<div class="bb-asset-thumb bb-asset-doc">${escapeHtml(fallback)}</div>`;
}

function wireAssetThumbs(host) {
  host.querySelectorAll('.bb-asset-thumb img[data-fallback]').forEach(img => {
    img.addEventListener('error', () => {
      const fallback = img.dataset.fallback || 'file';
      const parent = img.parentElement;
      if (!parent) return;
      parent.classList.add('bb-asset-doc');
      parent.textContent = fallback;
      console.warn(`[assets] thumb failed to load: ${img.src}`);
    }, { once: true });
  });
}

function assetCard(a) {
  // Canonical agentView field names (per swagger Screen.Central.Contracts.AssetItem):
  //   assetId, name, description, url, mimeType, size, sha256, groupId, uploadedAt
  // We keep fallbacks for forward/backwards compat.
  const url = a.url || a.publicUrl || a.downloadUrl || a.href || '';
  // Prefer human-readable name; only fall back to opaque IDs as a tooltip,
  // never as the visible label (UUID cards are confusing).
  const name = a.name ?? a.filename ?? '(unnamed)';
  const mime = assetMime(a);
  const bytes = a.size ?? a.bytes ?? 0;
  return `
    <div class="bb-asset-card" data-url="${escapeAttr(url)}" title="${escapeAttr(name)} (click to copy URL)">
      ${thumbHtml({ url, mime, name })}
      <div class="bb-asset-name">${escapeHtml(name)}</div>
      <div class="bb-asset-meta">${formatBytes(bytes)}</div>
    </div>
  `;
}

function extLabel(mime, name) {
  if (mime) {
    const m = mime.split('/')[1];
    if (m) return m;
  }
  const m2 = (name ?? '').match(/\.([a-z0-9]+)$/i);
  return m2?.[1] ?? 'file';
}

function formatBytes(b) {
  if (!b) return '—';
  const u = ['B','KB','MB','GB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(1) + ' ' + u[i];
}

function formatQuota(q) {
  // Per swagger Screen.Central.Contracts.AssetQuota:
  //   usedBytes, limitBytes, remainingBytes
  const used = q.usedBytes ?? q.used ?? 0;
  const total = q.limitBytes ?? q.totalBytes ?? q.total ?? q.limit ?? 0;
  const pct = total ? Math.round((used / total) * 100) : 0;
  return `<div class="bb-quota-bar"><div class="bb-quota-fill" style="width:${pct}%"></div></div>
          <div class="bb-quota-text">${formatBytes(used)} / ${formatBytes(total)} (${pct}%)</div>`;
}

// Modal asset picker (returns selected URL or undefined)
export async function pickAsset(filterMime) {
  await refresh();
  const items = (state.library.assets ?? []).filter(a => assetMatchesAccept(a, filterMime));
  const host = document.createElement('div');
  host.innerHTML = `
    <div class="bb-form-help">${items.length} ${items.length === 1 ? tx('asset matches.') : tx('assets match.')}</div>
    <div class="bb-lib-grid" id="picker-grid">
      ${items.map(a => {
        const url = a.url || a.publicUrl || a.downloadUrl || '';
        const name = a.name ?? a.filename ?? '(unnamed)';
        const mime = assetMime(a);
        return `<button class="bb-asset-card bb-asset-pick" data-url="${escapeAttr(url)}">
          ${thumbHtml({ url, mime, name })}
          <div class="bb-asset-name">${escapeHtml(name)}</div>
        </button>`;
      }).join('') || `<div class="bb-empty-state">${tx('No matching assets. Upload one first.')}</div>`}
    </div>
    <div class="bb-form-help" style="margin-top:12px;">${tx('Or upload a new one:')}</div>
    <button class="bb-btn bb-btn-secondary" id="picker-upload">⬆ ${tx('Upload file')}</button>
  `;
  return openModal({
    title: tx('Pick an asset'),
    body: host,
    actions: [{ label: tx('Cancel'), value: undefined }],
    onMount: (card, close) => {
      wireAssetThumbs(host);
      host.querySelector('#picker-grid').addEventListener('click', e => {
        const btn = e.target.closest('.bb-asset-pick');
        if (btn) close(btn.dataset.url);
      });
      host.querySelector('#picker-upload').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        if (filterMime) input.accept = filterMime;
        input.addEventListener('change', async () => {
          const f = input.files?.[0]; if (!f) return;
          const url = await uploadAndGetUrl(f);
          if (url) close(url);
        });
        input.click();
      });
    },
  });
}

// Multi-select picker → returns an array of selected URLs (or [] if cancelled).
export async function pickAssets(filterMime) {
  await refresh();
  const items = (state.library.assets ?? []).filter(a => assetMatchesAccept(a, filterMime));
  const selected = new Set();
  const host = document.createElement('div');
  host.innerHTML = `
    <div class="bb-form-help" id="pa-count">${t('field.pickMultipleHint')}</div>
    <div class="bb-lib-grid" id="pa-grid">
      ${items.map(a => {
        const url = a.url || a.publicUrl || a.downloadUrl || '';
        const name = a.name ?? a.filename ?? '(unnamed)';
        const mime = assetMime(a);
        return `<button class="bb-asset-card bb-asset-pick" data-url="${escapeAttr(url)}">
          ${thumbHtml({ url, mime, name })}
          <div class="bb-asset-name">${escapeHtml(name)}</div>
        </button>`;
      }).join('') || `<div class="bb-empty-state">${t('field.pickMultipleEmpty')}</div>`}
    </div>`;
  const v = await openModal({
    title: t('field.pickMultiple'),
    body: host,
    actions: [{ label: t('common.cancel'), value: null }, { label: t('common.add'), kind: 'primary', value: '__ADD__' }],
    onMount: () => {
      wireAssetThumbs(host);
      const count = host.querySelector('#pa-count');
      host.querySelector('#pa-grid').addEventListener('click', e => {
        const btn = e.target.closest('.bb-asset-pick');
        if (!btn || !btn.dataset.url) return;
        if (selected.has(btn.dataset.url)) { selected.delete(btn.dataset.url); btn.classList.remove('bb-sel'); }
        else { selected.add(btn.dataset.url); btn.classList.add('bb-sel'); }
        count.textContent = t('field.pickMultipleCount', { n: selected.size });
      });
    },
  });
  return v === '__ADD__' ? [...selected] : [];
}

export async function uploadAndGetUrl(file) {
  try {
    // v3: auto-optimise images above 4K before upload. Saves asset quota
    // (typically 60-80% smaller) without visibly changing playback quality —
    // displays cap at 4K anyway. Non-image files pass through untouched.
    const optimised = await maybeOptimiseImage(file);
    const r = await api.upload(optimised);
    const a = r?.assets?.[0];
    const url = a?.url || a?.publicUrl || r?.url || r?.publicUrl || r?.downloadUrl || r?.assetUrl;
    refresh();
    return url;
  } catch (e) {
    // agentView v2.1.91 returns 415 with empty body when Content-Type isn't
    // multipart/form-data (previously 400 + `missing_file` error code).
    // The empty body becomes a generic "HTTP 415" message; surface a more
    // helpful hint for non-multipart-related causes too (size, type).
    let msg = e?.message ?? String(e);
    if (e?.status === 415) msg = tx('File type/format rejected by the server.');
    else if (e?.status === 413) msg = tx('File too large (server quota exceeded).');
    else if (e?.status === 400 && /missing_description/.test(msg)) msg = tx('Description missing (Studio bug, please report).');
    toast(`${tx('Upload failed')}: ${msg}`, { kind: 'error' });
    return '';
  }
}

// Client-side image resize via Canvas. Only kicks in for image/* MIME types,
// and only if the image exceeds 4K on either axis (3840×2160). Output mimics
// the input MIME when possible (JPEG → JPEG 0.9, PNG → PNG, everything else
// stays JPEG). Animated GIFs/WebP/AVIF are detected via magic bytes and
// returned untouched so we don't kill animation.
const MAX_W = 3840;
const MAX_H = 2160;
const JPEG_QUALITY = 0.9;

async function maybeOptimiseImage(file) {
  if (!file || !file.type?.startsWith('image/')) return file;
  // Skip animated formats — Canvas would freeze them at frame 0.
  if (await isAnimated(file)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width <= MAX_W && bitmap.height <= MAX_H) { bitmap.close?.(); return file; }
    const ratio = Math.min(MAX_W / bitmap.width, MAX_H / bitmap.height);
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);
    const canvas = ('OffscreenCanvas' in window) ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = canvas.convertToBlob
      ? await canvas.convertToBlob({ type: outType, quality: JPEG_QUALITY })
      : await new Promise(res => canvas.toBlob(res, outType, JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file; // optimisation didn't help — keep original
    const ext = outType === 'image/png' ? '.png' : '.jpg';
    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], baseName + ext, { type: outType, lastModified: file.lastModified });
  } catch {
    // Decode failure (corrupt image, unknown format) → fall back to original.
    return file;
  }
}

async function isAnimated(file) {
  if (!/^image\/(gif|webp|avif|apng)$/.test(file.type)) return false;
  // GIF/APNG animation flag: presence of multiple frames. Cheapest check is
  // bytewise — for GIFs, look for repeated `\x21\xF9\x04` graphic control
  // extensions. For WebP/AVIF we conservatively assume animated.
  if (file.type === 'image/gif') {
    const buf = new Uint8Array(await file.slice(0, Math.min(file.size, 65536)).arrayBuffer());
    let count = 0;
    for (let i = 0; i < buf.length - 2; i++) {
      if (buf[i] === 0x21 && buf[i + 1] === 0xF9 && buf[i + 2] === 0x04) { count++; if (count > 1) return true; }
    }
    return false;
  }
  return true;
}

