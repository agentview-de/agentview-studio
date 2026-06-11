// Themed empty/error state for media widgets (image, video, pdf, iframe,
// embed, stream-cam, audio-viz, …). Replaces the copy-pasted inline cards
// that hardcoded a dark look (#0a0a10 / #000 backgrounds, rgba(255,255,255,.5)
// text) and were therefore broken on the light 'editorial-mono' theme: this
// one derives everything from the slide's foreground via color-mix, so it
// reads as a quiet placeholder on ANY theme / brand kit.
//
// Usage in a plugin's render():
//   const empty = mediaPlaceholder({ icon: '🎬', message: 'Add a video URL, MP4 or WebM.' });
//   container.appendChild(empty);
//   return composeDispose(() => empty.remove());
//
// { icon, message, messageHtml } — icon is a single emoji (defaults to the
// generic 🖼️), message is PLAIN TEXT (set via textContent — safe for strings
// that embed user input like a failing URL). messageHtml is an escape hatch
// for STATIC trusted markup only (e.g. a <strong>https://</strong> emphasis);
// never feed it user-controlled strings.
export function mediaPlaceholder({ icon = '🖼️', message = '', messageHtml = '' } = {}) {
  const el = document.createElement('div');
  el.className = 'bb-media-placeholder';
  // Inline-styled (like the cards it replaces) so it works in the published
  // player bundle without a stylesheet dependency. The fg-tinted background
  // separates the placeholder from the slide background on dark AND light
  // themes; the 55% text mix mirrors the old rgba(255,255,255,.55) weight.
  el.style.cssText =
    'display:flex;align-items:center;justify-content:center;width:100%;height:100%;' +
    'box-sizing:border-box;text-align:center;padding:24px;' +
    'font:14px/1.5 var(--bb-font, Inter, sans-serif);' +
    'color:color-mix(in srgb, var(--bb-st-fg, #f1f1f4) 55%, transparent);' +
    'background:color-mix(in srgb, var(--bb-st-fg, #f1f1f4) 7%, transparent);';
  const inner = document.createElement('div');
  const ic = document.createElement('div');
  ic.style.cssText = 'font-size:48px;opacity:.5;margin-bottom:8px;';
  ic.textContent = icon;
  const msg = document.createElement('div');
  if (messageHtml) msg.innerHTML = messageHtml;
  else msg.textContent = message;
  inner.append(ic, msg);
  el.appendChild(inner);
  return el;
}
