// Shared runtime fallback for network/live widgets that fail to load. The host
// (player or canvas) passes ctx.onError to the plugin; the plugin calls it when
// its content is unavailable. Returns true if a fallback was applied, so the
// plugin can skip its own inline error message.
//
// widget.onError = { mode: 'none'|'hide'|'image'|'text', image?, text? }

export function applyErrorFallback(content, slot, onError) {
  const cfg = onError ?? {};
  const mode = cfg.mode ?? 'none';
  if (mode === 'none') return false;

  if (mode === 'hide') {
    if (slot) slot.style.display = 'none';
    else if (content) content.style.display = 'none';
    return true;
  }
  if (mode === 'image' && cfg.image) {
    content.innerHTML = '';
    const img = document.createElement('img');
    img.src = cfg.image;
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    content.appendChild(img);
    return true;
  }
  if (mode === 'text' || mode === 'image') {
    content.innerHTML = '';
    const div = document.createElement('div');
    div.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;color:rgba(255,255,255,.6);font-family:var(--bb-font,Inter,sans-serif);';
    div.textContent = cfg.text || '';
    content.appendChild(div);
    return true;
  }
  return false;
}
