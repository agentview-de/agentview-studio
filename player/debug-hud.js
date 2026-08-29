// The player's diagnostic overlay: FPS, which slide, where the playlist comes
// from — and, since a display is a screen nobody can open a console on, what
// went wrong the last time something did.
//
// Two things this had to grow up for field service:
//
//   1. It could only be opened with `?debug=1`. A published display runs one
//      fixed URL in kiosk mode; the person standing in front of it has a remote
//      or a touchscreen and no address bar. So there is now a gesture: five
//      taps in the top-left corner within three seconds, or shift+D on a
//      keyboard. Both toggle, so it can be closed again.
//   2. It reported only the happy path. "Last fetch 14:02" tells you nothing
//      about the fetch at 14:03 that failed, or that the playlist on screen is
//      the cached one. Those are the lines you actually need when a screen is
//      showing the wrong thing.

import { syncedSlot } from '../shared/sync-clock.js';

const CORNER = 120;        // px square in the top-left that counts as "the corner"
const TAPS = 5;
const TAP_WINDOW = 3000;   // ms

let hud = null;
let raf = 0;
let autoHide = 0;

function fmtAge(ts) {
  if (!ts) return '—';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// Which clock this screen is running on. The one fault nobody can diagnose by
// looking at a single display: a video wall out of step looks, screen by
// screen, exactly like a video wall in step. Read live rather than from a
// stored snapshot, so the countdown ticks and two technicians standing at two
// screens can compare the same number.
function fmtSync(s) {
  const at = syncedSlot(s.playlist?.syncAnchor, (s.slides ?? []).length);
  if (!at) return 'off — each display advances on its own';
  const loop = `slot ${at.index + 1}/${(s.slides ?? []).length} · ${(at.remainingMs / 1000).toFixed(1)}s left · loop ${Math.round(at.totalMs / 1000)}s`;
  // An anchor that exists but is not being followed is worth saying out loud:
  // day-parting has taken the shared slide out of this display's rotation.
  return s.syncActive ? loop : `anchor not followed (${loop})`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/**
 * Open the overlay. Idempotent — a second call is a no-op.
 *
 * `autoHideMs` closes it again on its own. The gesture uses it: a shop window
 * is a touchscreen a stranger can reach, and a green diagnostic box that stays
 * up until the next reboot is a worse outcome than one that goes away. The
 * explicit `?debug=1` passes 0 and stays open.
 */
export function enable(state, { autoHideMs = 0 } = {}) {
  if (hud) return;
  hud = document.createElement('div');
  hud.id = 'bb-debug-hud';
  hud.style.cssText = `
    position:fixed; top:8px; right:8px; z-index:9999;
    background:rgba(0,0,0,.7); backdrop-filter: blur(8px);
    color:#0f0; padding:8px 12px; font:11px/1.5 monospace;
    border-radius:6px; border:1px solid rgba(0,255,0,.2);
    pointer-events: none; min-width:260px; max-width:min(90vw,420px);
  `;
  document.body.appendChild(hud);

  let frames = 0, fps = 0;
  let last = performance.now();
  const tick = () => {
    frames++;
    const now = performance.now();
    if (now - last >= 1000) {
      fps = Math.round((frames * 1000) / (now - last));
      frames = 0; last = now;
    }
    const s = state();
    // The trouble lines come first and only appear when there IS trouble, so a
    // healthy display shows a short, quiet box.
    const trouble = [];
    if (s.fromCache) trouble.push('<div style="color:#fc0">⚑ showing CACHED playlist</div>');
    if (s.failCount) trouble.push(`<div style="color:#fc0">⚑ ${s.failCount} failed fetch${s.failCount === 1 ? '' : 'es'} in a row</div>`);
    if (s.lastError) trouble.push(`<div style="color:#f66">last error: ${esc(s.lastError).slice(0, 120)}</div>`);
    // Slot failures were invisible: a data slot that has 404'd for hours leaves
    // the last good value on screen, which looks exactly like fresh data.
    const badSlots = Object.entries(s.slotFails ?? {}).filter(([, n]) => n > 0);
    if (badSlots.length) {
      trouble.push(`<div style="color:#fc0">⚑ slot data stale: ${
        esc(badSlots.map(([slug, n]) => `${slug} (${n}×)`).join(', ')).slice(0, 140)}</div>`);
    }
    hud.innerHTML = `
      <div><b>agentView Studio Player</b></div>
      ${trouble.join('')}
      <div>FPS: ${fps}</div>
      <div>Slot: ${s.slotUrl ? esc(s.slotUrl).slice(0, 44) + '…' : '—'}</div>
      <div>Slides: ${s.total} (visible ${s.visible})</div>
      <div>Current: ${s.currentIdx} • ${esc(s.currentType ?? '—')}</div>
      <div>Sync: ${esc(fmtSync(s))}</div>
      <div>Last good fetch: ${s.lastFetch ? new Date(s.lastFetch).toLocaleTimeString() : '—'} (${fmtAge(s.lastFetch)})</div>
      <div>Uptime: ${Math.floor((performance.now() - s.bootAt) / 1000)}s</div>
      <div style="opacity:.55">5 taps top-left / shift+D closes this${autoHide ? ' · auto-closes' : ''}</div>
    `;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  if (autoHideMs > 0) autoHide = setTimeout(disable, autoHideMs);
}

/** Close it again — the other half of a toggle a technician can reach. */
export function disable() {
  if (!hud) return;
  clearTimeout(autoHide);
  autoHide = 0;
  cancelAnimationFrame(raf);
  hud.remove();
  hud = null;
  raf = 0;
}

export function isEnabled() { return hud !== null; }

/**
 * Arm the ways in which somebody standing at the display can open this.
 * Returns a teardown, so tests can arm it without leaking listeners.
 */
export function armToggle(state, { autoHideMs = 60_000 } = {}) {
  const toggle = () => (hud ? disable() : enable(state, { autoHideMs }));

  let taps = [];
  const onPointer = e => {
    if (e.clientX > CORNER || e.clientY > CORNER) { taps = []; return; }
    const now = e.timeStamp || performance.now();
    taps = taps.filter(t => now - t < TAP_WINDOW);
    taps.push(now);
    if (taps.length >= TAPS) { taps = []; toggle(); }
  };
  const onKey = e => {
    // shift+D, not a bare key: a stray keypress from a media remote must not
    // put a green box on a shop window.
    if (e.shiftKey && (e.key === 'D' || e.key === 'd')) toggle();
  };
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('keydown', onKey, true);
  return () => {
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('keydown', onKey, true);
  };
}
