import { register } from './registry.js';
import { composeDispose } from '../plugin-contract.js';
import { mediaPlaceholder } from '../media-placeholder.js';

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

// Accepts "W:H", "W/H" or "WxH" with decimals; shared by ratioPair() and the
// customRatio validate so the schema warning and the render fallback agree.
const RATIO_RE = /^\s*(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)\s*$/i;

// Resolves the aspect setting to a [w, h] pair. Custom accepts "W:H", "W/H" or "WxH".
function ratioPair(aspect, custom) {
  if (aspect === '9:16') return [9, 16];
  if (aspect === 'custom') {
    const m = String(custom ?? '').match(RATIO_RE);
    if (m && +m[1] > 0 && +m[2] > 0) return [+m[1], +m[2]];
  }
  return [16, 9];
}

// All YouTube-only fields share this gate (the Vimeo branch ignores them).
const isVimeo = c => /vimeo\.com/i.test(c.url ?? '');

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
    captionLang: '',
    progressColor: 'red',
    interfaceLang: '',
    allowCookies: false,
    reloadSec: 0,
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'url', type: 'url', label: 'YouTube or Vimeo URL', test: true,
        placeholder: 'https://www.youtube.com/watch?v=…' },
      { key: 'provider', type: 'select', label: 'Provider', buttons: true,
        options: [
          { value: 'youtube', label: 'YouTube' },
          { value: 'vimeo',   label: 'Vimeo' },
        ],
        help: 'Auto-detected from the URL, only set this if your link is ambiguous.',
        showIf: c => !isVimeo(c) && !/youtu\.?be|youtube/i.test(c.url ?? '') },

      { type: 'section', key: 'layout', label: 'Layout' },
      { key: 'aspect', type: 'select', label: 'Aspect ratio', options: [
        { value: '16:9', label: '16:9, landscape' },
        { value: '9:16', label: '9:16, portrait / Shorts' },
        { value: 'custom', label: 'Custom (use ratio below)' },
        { value: 'fill', label: 'Fill widget box' },
      ] },
      // Free-form text (was a 6-preset select): render's ratioPair() always
      // parsed arbitrary "W:H" / "W/H" / "WxH" strings, the select was the
      // only thing restricting it. All old preset values remain valid input.
      { key: 'customRatio', type: 'text', label: 'Custom ratio (W:H)',
        placeholder: '4:3', tier: 'advanced',
        help: 'Any width-to-height pair as W:H, W/H or WxH — e.g. 4:3, 3:2, 5:4, 16:10, 21:9, 1:1.',
        showIf: c => (c.aspect ?? '16:9') === 'custom',
        validate: v => {
          const s = String(v ?? '').trim();
          if (!s) return null;
          const m = s.match(RATIO_RE);
          return m && +m[1] > 0 && +m[2] > 0 ? null
            : { level: 'warn', message: 'Not a valid ratio — use W:H like 4:3 or 21:9. Falling back to 16:9.' };
        } },

      { type: 'section', key: 'playback', label: 'Playback' },
      { type: 'row', children: [
        { key: 'muted', type: 'toggle', label: 'Muted', tier: 'advanced',
          help: 'Required for autoplay — browsers block unmuted autoplay.' },
        { key: 'loop', type: 'toggle', label: 'Loop', tier: 'advanced',
          help: 'YouTube shows a brief interface flash between loop iterations — no embed parameter can suppress it.' },
      ] },
      { type: 'row', children: [
        { key: 'start', type: 'duration', label: 'Start at', min: 0, tier: 'advanced',
          help: '0 = use the timestamp from the URL (e.g. ?t=90), if any.' },
        { key: 'end', type: 'duration', label: 'Stop at', min: 0, tier: 'advanced',
          showIf: c => !isVimeo(c),
          help: '0 = play to the end. Cuts off playback at this second so you can show a specific scene without editing the source video. Combined with Start, you get an arbitrary in/out range.',
          validate: (v, c) => {
            const end = Math.floor(Number(v) || 0);
            return end > 0 && end <= startSeconds(c)
              ? { level: 'warn', message: 'Stop time must be after Start — it is being ignored.' }
              : null;
          } },
      ] },

      { type: 'section', key: 'captions', label: 'Captions & language',
        showIf: c => !isVimeo(c) },
      { key: 'showCaptions', type: 'toggle', label: 'Show captions/subtitles',
        showIf: c => !isVimeo(c), tier: 'advanced',
        help: 'Forces YouTube captions on by default, useful for muted playback in cafés, lobbies, or noisy receptions. Only fires if the video actually has subtitles.' },
      { key: 'captionLang', type: 'text', label: 'Caption language',
        placeholder: 'e.g. de, en', tier: 'advanced',
        showIf: c => c.showCaptions && !isVimeo(c),
        help: 'Two-letter ISO code preferred for the forced captions, so a German lobby gets German subtitles regardless of the video\'s default. Leave blank for the video default.' },

      // Tier 2, UI cosmetics that only matter when the player controls are visible.
      { type: 'section', key: 'playerui', label: 'Player controls', collapsed: true,
        summary: c => c.controls ? 'visible' : 'hidden' },
      { key: 'controls', type: 'toggle', label: 'Show controls', tier: 'advanced' },
      { key: 'progressColor', type: 'select', label: 'Progress bar colour', buttons: true,
        options: [
          { value: 'red',   label: 'Red (YouTube default)' },
          { value: 'white', label: 'White' },
        ],
        tier: 'advanced',
        showIf: c => c.controls && !isVimeo(c) },
      { key: 'interfaceLang', type: 'text', label: 'Player UI language',
        placeholder: 'e.g. de, en, fr', tier: 'advanced',
        showIf: c => c.controls && !isVimeo(c),
        help: 'Two-letter ISO code controlling the YouTube controls + tooltip language. Leave blank to follow the player\'s default.' },

      { type: 'section', key: 'advanced', label: 'Advanced', collapsed: true,
        summary: c => [
          c.allowCookies ? 'cookies on' : 'no cookies',
          Math.floor(Number(c.reloadSec) || 0) >= 5 ? 'auto-reload' : '',
        ].filter(Boolean).join(' · ') },
      { key: 'allowCookies', type: 'toggle', label: 'Allow YouTube cookies',
        showIf: c => !isVimeo(c), tier: 'advanced',
        help: '⚠️ Off (default) uses youtube-nocookie.com for privacy. Turn ON if your video shows a "sign in to confirm you\'re not a bot" wall, some music videos, Shorts, and age-restricted content only embed cleanly via standard youtube.com.' },
      { key: 'reloadSec', type: 'duration', label: 'Reload every (0 = never)', min: 0, tier: 'advanced',
        help: 'Reloads the embed on a timer — recovers frozen frames and "video unavailable" walls on 24/7 displays. Intervals under 5 seconds are ignored to protect the player.',
        validate: v => {
          const s = Number(v) || 0;
          return s > 0 && s < 5
            ? { level: 'warn', message: 'Intervals under 5 seconds are ignored to protect the player.' }
            : null;
        } },
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
      const ph = mediaPlaceholder({ icon: '▶️', message: 'Paste a YouTube or Vimeo URL in the inspector.' });
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
      // cc_lang_pref picks WHICH caption track fires when captions are forced
      // on — the muted+captions signage pattern in a specific audience language.
      const ccLang = c.showCaptions ? (c.captionLang ?? '').trim() : '';
      const ccParam = c.showCaptions
        ? `&cc_load_policy=1${ccLang ? `&cc_lang_pref=${encodeURIComponent(ccLang)}` : ''}`
        : '';
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
    f.dataset.field = 'url provider muted loop controls start end showCaptions captionLang progressColor interfaceLang allowCookies aspect customRatio reloadSec';
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
