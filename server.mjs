#!/usr/bin/env node
// server.mjs — agentView Studio local dev server + CORS/SSE proxy.
//
// Serves the static SPA from this folder and reverse-proxies the agentView API
// (/api, /data, /send, /oauth, /.well-known) — including its SSE event stream —
// to agentview.de, so the browser app can talk to the API *same-origin* during
// local development.
//
// The app itself is pure static files: in production you serve them from any web
// server (or studio.agentview.de) and let the API send CORS headers for that
// origin. This script is only a local convenience — it replaces the old
// start.bat / start.ps1 with one cross-platform file.
//
// Zero dependencies. Requires Node 20+ (global fetch).
//
//   node server.mjs                                  # free port in 8080–8100, opens browser
//   node server.mjs --port 9000
//   node server.mjs --upstream https://agentview.de --no-browser
//   node server.mjs --help

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

// ---------- args ----------
const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
const val = (name, def) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };

if (has('--help') || has('-h')) {
  console.log(`agentView Studio — local dev server + CORS/SSE proxy

Usage: node server.mjs [options]
  --port <n>        Use a specific port (default: first free in 8080–8100)
  --upstream <url>  API origin to proxy to (default: https://agentview.de)
  --no-browser      Do not open the browser on start
  --help, -h        Show this help`);
  process.exit(0);
}

const UPSTREAM = val('--upstream', 'https://agentview.de').replace(/\/+$/, '');
const FIXED_PORT = val('--port', null);
const OPEN_BROWSER = !has('--no-browser');

const PROXY_PREFIXES = ['/api/', '/data/', '/send', '/oauth/', '/.well-known/'];
const isProxied = (p) => PROXY_PREFIXES.some((x) => p === x || p.startsWith(x));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

// Hop-by-hop / encoding headers we must not forward verbatim. `content-encoding`
// is dropped because fetch already decodes the body; `content-length` because we
// re-stream; `set-cookie` is handled separately (Headers joins it incorrectly).
const SKIP_REQ = new Set(['host', 'connection', 'content-length', 'accept-encoding']);
const SKIP_RES = new Set(['connection', 'transfer-encoding', 'content-length', 'content-encoding', 'set-cookie']);

async function proxy(req, res, pathAndQuery) {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!SKIP_REQ.has(k.toLowerCase())) headers[k] = v;
  }

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (chunks.length) body = Buffer.concat(chunks);
  }

  let up;
  try {
    up = await fetch(UPSTREAM + pathAndQuery, { method: req.method, headers, body, redirect: 'manual' });
  } catch (e) {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Upstream error: ' + e.message);
    return;
  }

  // Forward status + headers. Proxied responses get NO Access-Control-Allow-Origin
  // on purpose: the SPA is same-origin with this server, and a wildcard would let
  // any page open in the browser read the agentView API through this local proxy.
  const out = {};
  up.headers.forEach((v, k) => { if (!SKIP_RES.has(k.toLowerCase())) out[k] = v; });
  const cookies = up.headers.getSetCookie?.() ?? [];
  if (cookies.length) out['set-cookie'] = cookies;

  res.writeHead(up.status, out);
  if (up.body) {
    // Stream incrementally — crucial for SSE (text/event-stream) endpoints, which
    // never finish and would hang if buffered. The stream can error LATE (e.g.
    // undici UND_ERR_BODY_TIMEOUT on a long-lived SSE/large upload), after proxy()
    // has already resolved — so its 'error' escapes the done() catch. Handle it
    // here, otherwise an unhandled stream 'error' would crash the whole dev server.
    const stream = Readable.fromWeb(up.body);
    stream.on('error', (e) => { try { res.destroy(e); } catch {} });
    res.on('error', () => { try { stream.destroy(); } catch {} });
    stream.pipe(res);
  } else {
    res.end();
  }
}

async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = normalize(join(ROOT, rel));
  // Path-traversal guard: resolved path must stay under ROOT.
  if (file !== ROOT.replace(/[\\/]$/, '') && !file.startsWith(ROOT)) {
    res.writeHead(403, { 'content-type': 'text/plain' }); res.end('forbidden'); return;
  }
  let s;
  try { s = await stat(file); } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('404 not found: ' + rel); return;
  }
  if (s.isDirectory()) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404 not found: ' + rel); return; }
  res.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  createReadStream(file).pipe(res);
}

// DNS-rebinding guard: the server binds to localhost, but a malicious page can
// still point a hostname it controls at 127.0.0.1 and POST to us. Such requests
// carry that foreign hostname in the Host header. We only ever expect localhost,
// so reject anything else — cheap defence so the API proxy can't be driven by a
// rebound origin. (Legit local access always uses localhost / 127.0.0.1 / [::1].)
function isLocalHost(hostHeader) {
  const h = String(hostHeader ?? '').split(':')[0].toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

const server = createServer((req, res) => {
  const url = req.url || '/';
  const path = url.split('?')[0];
  const done = (fn) => fn.catch((e) => { try { res.writeHead(500); res.end(String(e?.message ?? e)); } catch {} });
  if (!isLocalHost(req.headers.host)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('forbidden: unexpected Host header (dev server is localhost-only)');
    return;
  }
  if (isProxied(path)) done(proxy(req, res, url));
  else done(serveStatic(req, res, path));
});

function openBrowser(url) {
  const [cmd, cmdArgs] = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  try { spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).unref(); } catch {}
}

// Backstop: a dev proxy talking to a remote API will occasionally hit a transient
// stream/socket error (SSE drop, body timeout, client disconnect mid-upload). None
// of those should take the whole server down and interrupt an editing session — log
// and keep serving. Real bugs still surface in the log.
process.on('unhandledRejection', (e) => console.error('[server] unhandledRejection:', e?.message ?? e));
process.on('uncaughtException', (e) => console.error('[server] uncaughtException:', e?.message ?? e));

function listenOn(port) {
  return new Promise((resolve, reject) => {
    const onErr = (e) => { server.removeListener('listening', onOk); reject(e); };
    const onOk = () => { server.removeListener('error', onErr); resolve(port); };
    server.once('error', onErr);
    server.once('listening', onOk);
    server.listen(port, 'localhost');
  });
}

(async () => {
  const ports = FIXED_PORT ? [Number(FIXED_PORT)] : Array.from({ length: 21 }, (_, i) => 8080 + i);
  let bound = null, lastErr;
  for (const p of ports) {
    try { bound = await listenOn(p); break; }
    catch (e) { lastErr = e; if (e.code !== 'EADDRINUSE') throw e; }
  }
  if (bound == null) { console.error('No free port available.', lastErr?.message ?? ''); process.exit(1); }

  const url = `http://localhost:${bound}/`;
  console.log('');
  console.log('  agentView Studio');
  console.log('  ----------------------------------------');
  console.log(`  Admin  : ${url}`);
  console.log(`  Player : ${url}display.html`);
  console.log(`  Proxy  : ${PROXY_PREFIXES.join('  ')}  →  ${UPSTREAM}`);
  console.log('  Stop   : Ctrl-C');
  console.log('');
  if (OPEN_BROWSER) openBrowser(url);
})();
