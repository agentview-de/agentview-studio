import { register } from './registry.js';
import { composeDispose } from '../plugin-contract.js';

function extractId(url) {
  if (!url) return '';
  // youtu.be/<id>, watch?v=<id>, and path forms embed|shorts|live|v/<id>
  const m1 = url.match(/youtu\.be\/([\w-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]v=([\w-]+)/);
  if (m2) return m2[1];
  const m3 = url.match(/youtube(?:-nocookie)?\.com\/(?:embed|shorts|live|v)\/([\w-]+)/);
  if (m3) return m3[1];
  return url;
}

// Start offset from a URL: ?t= / &t= / #t= / ?start=, as "90", "90s", "1m30s", or "1h2m30s".
function extractStart(url) {
  const m = (url ?? '').match(/[?&#](?:t|start)=([0-9hms]+)/i);
  if (!m) return 0;
  const v = m[1];
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  let s = 0;
  const h = v.match(/(\d+)h/i); if (h) s += +h[1] * 3600;
  const mn = v.match(/(\d+)m/i); if (mn) s += +mn[1] * 60;
  const sc = v.match(/(\d+)s/i); if (sc) s += +sc[1];
  return s;
}

// Explicit `start` field wins when set; otherwise fall back to the URL timestamp.
function startSeconds(c) {
  const explicit = Number(c.start);
  return Math.max(0, Math.floor(explicit > 0 ? explicit : extractStart(c.url ?? '')));
}

// Resolves the aspect setting to a [w, h] pair. Custom accepts "W:H", "W/H" or "WxH".
function ratioPair(aspect, custom) {
  if (aspect === '9:16') return [9, 16];
  if (aspect === 'custom') {
    const m = String(custom ?? '').match(/^\s*(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)\s*$/i);
    if (m && +m[1] > 0 && +m[2] > 0) return [+m[1], +m[2]];
  }
  return [16, 9];
}

export default register({
  type: 'youtube',
  label: 'YouTube / Vimeo',
  group: 'media',
  icon: '▶️',
  network: true,
  schemaVersion: 1,
  defaults: () => ({
    url: '', muted: true, loop: true, controls: false, provider: 'youtube',
    start: 0, end: 0,
    aspect: '16:9', customRatio: '4:3',
    showCaptions: false,
    progressColor: 'red',
    interfaceLang: '',
    allowCookies: false,
  }),
  schema: () => ({
    fields: [
      { key: 'url', type: 'url', label: 'YouTube or Vimeo URL' },
      { key: 'provider', type: 'select', label: 'Provider', options: ['youtube','vimeo'],
        help: 'Auto-detected from the URL, only set this if your link is ambiguous.',
        showIf: c => !/vimeo\.com/i.test(c.url ?? '') && !/youtu\.?be|youtube/i.test(c.url ?? '') },
      { key: 'aspect', type: 'select', label: 'Aspect ratio', options: [
        { value: '16:9', label: '16:9, landscape' },
        { value: '9:16', label: '9:16, portrait / Shorts' },
        { value: 'custom', label: 'Custom (use ratio below)' },
        { value: 'fill', label: 'Fill widget box' },
      ] },
      { key: 'customRatio', type: 'select', label: 'Custom ratio (W:H)',
        options: ['4:3', '3:2', '5:4', '16:10', '21:9', '1:1'],
        showIf: c => (c.aspect ?? '16:9') === 'custom' },
      { key: 'muted', type: 'toggle', label: 'Muted (required for autoplay)' },
      { key: 'loop', type: 'toggle', label: 'Loop' },
      { key: 'controls', type: 'toggle', label: 'Show controls' },
      { key: 'start', type: 'number', label: 'Start at (seconds, blank = use URL)', min: 0 },
      { key: 'end', type: 'number', label: 'Stop at (seconds, 0 = play to end)', min: 0,
        showIf: c => !/vimeo\.com/i.test(c.url ?? ''),
        help: 'Cuts off playback at this second so you can show a specific scene without editing the source video. Combined with Start, you get an arbitrary in/out range.' },
      { key: 'showCaptions', type: 'toggle', label: 'Show captions/subtitles',
        showIf: c => !/vimeo\.com/i.test(c.url ?? ''),
        help: 'Forces YouTube captions on by default, useful for muted playback in cafés, lobbies, or noisy receptions. Only fires if the video actually has subtitles.' },
      // Tier 2, UI cosmetics that only matter when the player controls are visible.
      { key: 'progressColor', type: 'select', label: 'Progress bar colour',
        options: [
          { value: 'red',   label: 'Red (YouTube default)' },
          { value: 'white', label: 'White' },
        ],
        showIf: c => c.controls && !/vimeo\.com/i.test(c.url ?? '') },
      { key: 'interfaceLang', type: 'text', label: 'Player UI language',
        placeholder: 'e.g. de, en, fr',
        showIf: c => c.controls && !/vimeo\.com/i.test(c.url ?? ''),
        help: 'Two-letter ISO code controlling the YouTube controls + tooltip language. Leave blank to follow the player\'s default.' },
      { key: 'allowCookies', type: 'toggle', label: 'Allow YouTube cookies',
        showIf: c => !/vimeo\.com/i.test(c.url ?? ''),
        help: '⚠️ Off (default) uses youtube-nocookie.com for privacy. Turn ON if your video shows a "sign in to confirm you\'re not a bot" wall, some music videos, Shorts, and age-restricted content only embed cleanly via standard youtube.com.' },
    ],
  }),
  // Lets the editor snap the widget box to the chosen ratio (null = leave the box alone).
  contentRatio(content) {
    const c = content ?? {};
    if ((c.aspect ?? '16:9') === 'fill') return null;
    return ratioPair(c.aspect ?? '16:9', c.customRatio);
  },
  render(slide, container) {
    const c = slide.content ?? {};
    const id = extractId(c.url ?? '');
    // Empty URL → friendly empty-state, NOT an iframe with a broken video.
    // The iframe path below would render a YouTube "video unavailable" page
    // by default; that's noisier than a clean "configure me" hint.
    if (!c.url || !id) {
      const ph = document.createElement('div');
      ph.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a1a2e,#0a0a10);color:rgba(255,255,255,.55);font:14px/1.5 var(--bb-font, Inter, sans-serif);text-align:center;padding:24px;';
      ph.innerHTML = '<div><div style="font-size:48px;opacity:.5;margin-bottom:8px;">▶️</div><div>Paste a YouTube or Vimeo URL in the inspector.</div></div>';
      container.appendChild(ph);
      return composeDispose(() => ph.remove());
    }
    const start = startSeconds(c);
    // Auto-detect provider from the URL so a mismatched dropdown can't break playback.
    const provider = /vimeo\.com/i.test(c.url ?? '') ? 'vimeo'
      : (/youtu\.?be|youtube/i.test(c.url ?? '') ? 'youtube' : (c.provider ?? 'youtube'));
    let src;
    if (provider === 'vimeo') {
      const m = (c.url ?? '').match(/vimeo\.com\/(\d+)/);
      const vid = m ? m[1] : id;
      const hash = start > 0 ? `#t=${start}s` : '';
      src = `https://player.vimeo.com/video/${vid}?autoplay=1&muted=${c.muted ? 1 : 0}&loop=${c.loop ? 1 : 0}&background=${c.controls ? 0 : 1}${hash}`;
    } else {
      const list = (c.url ?? '').match(/[?&]list=([\w-]+)/)?.[1] ?? '';
      // Common YT player-vars. iv_load_policy=3 hides annotations; fs=0
      // hides the fullscreen button; disablekb=1 stops keyboard interaction.
      // These reduce in-iframe UI clutter without needing the JS API.
      const tail = `autoplay=1&mute=${c.muted ? 1 : 0}&controls=${c.controls ? 1 : 0}&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&fs=0&disablekb=1`;

      // Optional player vars (always safe to append, empty when unused).
      // `end` only makes sense as a positive integer strictly greater than
      // `start`; otherwise YouTube silently ignores it.
      const endSec = Math.max(0, Math.floor(Number(c.end) || 0));
      const endParam = endSec > 0 && endSec > start ? `&end=${endSec}` : '';
      const ccParam = c.showCaptions ? '&cc_load_policy=1' : '';
      // Tier-2 vars (color, hl) are pointless when controls are hidden, gate
      // them so we don't ship URL bytes that would never have a visible effect.
      const colorParam = c.controls && c.progressColor === 'white' ? '&color=white' : '';
      const hlRaw = (c.interfaceLang ?? '').trim();
      const hlParam = c.controls && hlRaw ? `&hl=${encodeURIComponent(hlRaw)}` : '';
      const extra = `${endParam}${ccParam}${colorParam}${hlParam}`;

      // youtube-nocookie.com is privacy-friendly default but triggers YouTube's
      // anti-bot ("Sign in to confirm you're not a bot") more aggressively on
      // certain videos (music labels, Shorts, age-gated). Standard domain is
      // the documented workaround.
      const ytDomain = c.allowCookies ? 'https://www.youtube.com' : 'https://www.youtube-nocookie.com';
      if (list) {
        // Whole playlist when the URL carries no single video; otherwise that video inside the list.
        const path = id === (c.url ?? '') ? 'videoseries' : id;
        // start= targets a specific video, not a whole-list 'videoseries'.
        const startParam = path !== 'videoseries' && start > 0 ? `&start=${start}` : '';
        src = `${ytDomain}/embed/${path}?list=${list}&loop=${c.loop ? 1 : 0}${startParam}${extra}&${tail}`;
      } else {
        // Single video. Looping uses YouTube's documented playlist=<id>
        // self-reference trick, the only officially supported way to loop a
        // single embedded video. Has a brief UI transition between iterations
        // that YouTube does not provide a parameter to suppress; the JS-API
        // workarounds (pre-end seek, dual-player swap) all cost CPU/network/
        // memory we don't want on the low-power signage players this targets.
        const startParam = start > 0 ? `&start=${start}` : '';
        const loopParams = c.loop ? `&loop=1&playlist=${id}` : '';
        src = `${ytDomain}/embed/${id}?${startParam}${loopParams}${extra}&${tail}`;
      }
    }
    const aspect = c.aspect ?? '16:9';

    const f = document.createElement('iframe');
    f.src = src;
    f.allow = 'autoplay; encrypted-media; picture-in-picture';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';

    if (aspect === 'fill') {
      f.style.cssText = 'width:100%;height:100%;border:0;background:#000;display:block;';
      container.appendChild(f);
      return composeDispose(() => { f.removeAttribute('src'); f.remove(); });
    }
    // Letterbox the player to a fixed ratio, centered in the box, so a 9:16 Short
    // needn't have its widget box hand-resized. cqw/cqh keep it contained both ways.
    const [rw, rh] = ratioPair(aspect, c.customRatio);
    f.style.cssText = `aspect-ratio:${rw} / ${rh};width:min(100cqw, calc(100cqh * ${rw} / ${rh}));height:auto;max-width:100%;max-height:100%;border:0;background:#000;display:block;`;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;container-type:size;';
    wrap.appendChild(f);
    container.appendChild(wrap);
    return composeDispose(() => { f.removeAttribute('src'); wrap.remove(); });
  },
});
