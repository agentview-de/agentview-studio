// Toggle by adding ?debug=1 to the player URL. Shows FPS, current slide, slot
// fetch timestamps, transition timing, and event tally.

export function enable(state) {
  const hud = document.createElement('div');
  hud.id = 'bb-debug-hud';
  hud.style.cssText = `
    position:fixed; top:8px; right:8px; z-index:9999;
    background:rgba(0,0,0,.7); backdrop-filter: blur(8px);
    color:#0f0; padding:8px 12px; font:11px/1.5 monospace;
    border-radius:6px; border:1px solid rgba(0,255,0,.2);
    pointer-events: none; min-width:220px;
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
    hud.innerHTML = `
      <div><b>BB Studio Player</b></div>
      <div>FPS: ${fps}</div>
      <div>Slot: ${s.slotUrl ? s.slotUrl.slice(0, 40) + '…' : '—'}</div>
      <div>Slides: ${s.total} (visible ${s.visible})</div>
      <div>Current: ${s.currentIdx} • ${s.currentType ?? '—'}</div>
      <div>Last fetch: ${s.lastFetch ? new Date(s.lastFetch).toLocaleTimeString() : '—'}</div>
      <div>Uptime: ${Math.floor((performance.now() - s.bootAt) / 1000)}s</div>
    `;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
