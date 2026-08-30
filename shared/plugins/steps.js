import { register } from './registry.js';
import { textScaleField } from '../text-scale.js';
import { colorOverrideDefaults, applyColorOverrides, themeColorSection } from '../widget-color.js';
import { composeDispose } from '../plugin-contract.js';
import { escapeHtml } from '../utils/escape.js';
import { iconSvg } from '../data/icons.js';
import { prefersReducedMotion } from '../animations.js';

// Numbered steps — "how this works", in three to six beats.
//
// Onboarding walls, hygiene and safety instructions, self-service checkouts,
// workshop drop-off procedure, claim processes, gym circuits: all the same
// object, and all previously hand-built out of four text widgets plus four
// icon widgets, re-aligned by hand whenever a step was added.
//
// The one moving part is the SPOTLIGHT: a step can be highlighted, and the
// highlight can walk the list on a timer, which turns a static instruction
// panel into something an audience actually follows.

const NUMBER_STYLES = ['circle', 'square', 'plain', 'icon', 'none'];

export default register({
  type: 'steps',
  label: 'Steps / Process',
  group: 'basic',
  icon: '🪜',
  schemaVersion: 1,
  defaults: () => ({ ...colorOverrideDefaults(),
    heading: 'How it works',
    steps: [
      { title: 'Check in', desc: 'Take a ticket from the terminal by the door.', icon: 'pointer' },
      { title: 'Wait', desc: 'Watch this screen — your number is called here.', icon: 'clock' },
      { title: 'Come to the counter', desc: 'Have your documents ready.', icon: 'user' },
      { title: 'Done', desc: 'You receive a confirmation by email.', icon: 'check' },
    ],
    layout: 'horizontal',
    numberStyle: 'circle',
    showConnector: true,
    showDesc: true,
    spotlight: 0,
    autoAdvanceSec: 0,
    textScale: 100,
    theme: 'minimal-dark',
  }),
  schema: () => ({
    fields: [
      { type: 'section', key: 'content', label: 'Content' },
      { key: 'heading', type: 'text', label: 'Heading', placeholder: 'How it works' },
      { key: 'steps', type: 'table', label: 'Steps',
        help: 'Three to five steps read best on a screen someone passes in a few seconds. The icon column is optional and only used by the “Icon” number style.',
        validate: (v) => {
          const arr = Array.isArray(v) ? v : [];
          if (!arr.length) return { level: 'warn', message: 'No steps yet — add at least one.' };
          if (arr.length > 8) return { level: 'warn', message: 'More than 8 steps rarely fits a screen someone reads while walking past.' };
          return null;
        },
        columns: [
          { key: 'title', label: 'Step' },
          { key: 'desc',  label: 'Detail' },
          { key: 'icon',  label: 'Icon', type: 'icon' },
        ] },

      { type: 'section', key: 'sec-layout', label: 'Layout',
        summary: c => `${c.layout ?? 'horizontal'} · ${c.numberStyle ?? 'circle'}` },
      { key: 'layout', type: 'select', label: 'Arrangement', buttons: true, options: [
        { value: 'horizontal', label: 'Row' },
        { value: 'vertical',   label: 'Column' },
        { value: 'grid',       label: 'Grid' },
      ], help: 'Row: a left-to-right flow, best on a wide tile. Column: a checklist. Grid: wraps into as many columns as fit.' },
      { key: 'numberStyle', type: 'select', label: 'Marker', buttons: true, options: [
        { value: 'circle', label: '①' },
        { value: 'square', label: '▢' },
        { value: 'plain',  label: '1.' },
        { value: 'icon',   label: 'Icon' },
        { value: 'none',   label: '—' },
      ] },
      { key: 'showConnector', type: 'toggle', label: 'Connect the steps',
        help: 'Draws the line between markers that makes a list read as a sequence.' },
      { key: 'showDesc', type: 'toggle', label: 'Show the detail line' },

      { type: 'section', key: 'behavior', label: 'Behavior',
        summary: c => ((Number(c.autoAdvanceSec) || 0) > 0 ? `walks every ${c.autoAdvanceSec}s`
          : (Number(c.spotlight) || 0) > 0 ? `step ${c.spotlight}` : 'off') },
      { key: 'spotlight', type: 'number', label: 'Highlight step (0 = none)', min: 0, max: 8, step: 1,
        help: 'Dims the other steps so one is clearly the current one.' },
      { key: 'autoAdvanceSec', type: 'duration', label: 'Walk the highlight (0 = off)', min: 0, max: 120,
        help: 'Moves the highlight one step onward on a timer, looping back to the first. Ignored when the display prefers reduced motion.' },

      { type: 'section', key: 'appearance', label: 'Appearance',
        summary: c => `${c.textScale ?? 100}%` },
      { ...textScaleField(), tier: 'advanced' },

      ...themeColorSection(),
    ],
  }),
  looks: () => [
    { id: 'flow', name: 'Flow', patch: { layout: 'horizontal', numberStyle: 'circle', showConnector: true, showDesc: true } },
    { id: 'checklist', name: 'Checklist', patch: { layout: 'vertical', numberStyle: 'square', showConnector: true, showDesc: true } },
    { id: 'icon-cards', name: 'Icon cards', patch: { layout: 'grid', numberStyle: 'icon', showConnector: false, showDesc: true } },
    { id: 'walkthrough', name: 'Walk-through', patch: { layout: 'horizontal', spotlight: 1, autoAdvanceSec: 5, showConnector: true } },
    { id: 'headlines', name: 'Headlines only', patch: { showDesc: false, numberStyle: 'plain', layout: 'horizontal', showConnector: false, textScale: 130 } },
  ],
  render(slide, container) {
    const c = slide.content ?? {};
    const layout = ['horizontal', 'vertical', 'grid'].includes(c.layout) ? c.layout : 'horizontal';
    const marker = NUMBER_STYLES.includes(c.numberStyle) ? c.numberStyle : 'circle';
    const steps = (Array.isArray(c.steps) ? c.steps : [])
      .filter(s => s && (String(s.title ?? '').trim() || String(s.desc ?? '').trim()));

    const root = document.createElement('div');
    applyColorOverrides(root, c);
    root.className = `bb-slide bb-slide-steps bb-theme-${c.theme ?? 'minimal-dark'}`;
    root.style.cssText += 'container-type:size;width:100%;height:100%;background:transparent;'
      + 'display:flex;flex-direction:column;gap:clamp(6px,1.6cqmin,22px);padding:clamp(8px,2.4cqmin,32px);box-sizing:border-box;justify-content:center;';
    root.style.setProperty('--bb-sp-scale', String((Number(c.textScale) || 100) / 100));

    const n = Math.max(steps.length, 1);
    // Type shrinks as the list grows, so four steps and eight steps both fill
    // the tile instead of one overflowing and the other floating in space.
    const titleFont = `calc(min(${layout === 'vertical' ? 4.2 : 22 / n}cqw, ${layout === 'vertical' ? 34 / n : 7}cqh) * var(--bb-sp-scale, 1))`;
    const descFont = `calc(${titleFont} * .62)`;
    const headFont = 'calc(min(4.6cqw, 8cqh) * var(--bb-sp-scale, 1))';
    const markFont = `calc(${titleFont} * ${layout === 'vertical' ? 1 : 1.15})`;

    root.innerHTML = `
      ${slide.title ? `<h1 class="bb-h1" style="margin:0;">${escapeHtml(slide.title)}</h1>` : ''}
      <div class="bb-sp-heading" data-field="heading" style="flex:0 0 auto;font:800 ${headFont}/1.15 var(--bb-display,'Inter Tight',Inter,sans-serif);letter-spacing:-.01em;"></div>
      <div class="bb-sp-list" data-field="steps layout numberStyle showConnector showDesc" style="flex:0 1 auto;min-height:0;"></div>`;

    const headingEl = root.querySelector('.bb-sp-heading');
    const listEl = root.querySelector('.bb-sp-list');
    headingEl.textContent = c.heading ?? '';
    headingEl.style.display = c.heading ? '' : 'none';

    listEl.style.cssText += layout === 'vertical'
      ? 'display:flex;flex-direction:column;gap:clamp(4px,1.2cqmin,16px);'
      : layout === 'grid'
        ? 'display:grid;grid-template-columns:repeat(auto-fit,minmax(30%,1fr));gap:clamp(6px,1.8cqmin,24px);'
        : 'display:flex;flex-direction:row;align-items:stretch;gap:clamp(4px,1.4cqmin,20px);';

    if (!steps.length) {
      const empty = document.createElement('div');
      empty.style.cssText = `font:500 ${descFont}/1.4 var(--bb-st-font,Inter,system-ui,sans-serif);opacity:.55;`;
      empty.textContent = 'Add steps in the inspector.';
      listEl.appendChild(empty);
      container.appendChild(root);
      return composeDispose(() => root.remove());
    }

    const markerFor = (i, step) => {
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      const base = 'flex:0 0 auto;display:flex;align-items:center;justify-content:center;'
        + `font:800 ${markFont}/1 var(--bb-display,'Inter Tight',Inter,sans-serif);color:var(--bb-st-accent);`;
      if (marker === 'none') { el.style.display = 'none'; return el; }
      if (marker === 'plain') {
        el.style.cssText = base;
        el.textContent = `${i + 1}.`;
        return el;
      }
      if (marker === 'icon') {
        // iconSvg falls back to the arrow glyph for an unknown id, so an empty
        // Icon column still renders something rather than a hole in the row.
        el.style.cssText = base + 'width:2em;height:2em;';
        el.innerHTML = iconSvg(step.icon || 'check-circle', 'width="100%" height="100%"');
        return el;
      }
      el.style.cssText = base
        + 'width:1.9em;height:1.9em;box-sizing:border-box;'
        + `border-radius:${marker === 'circle' ? '50%' : '.28em'};`
        + 'background:color-mix(in srgb, var(--bb-st-accent) 18%, transparent);'
        + 'border:.09em solid color-mix(in srgb, var(--bb-st-accent) 65%, transparent);';
      el.textContent = String(i + 1);
      return el;
    };

    const cards = steps.map((s, i) => {
      const card = document.createElement('div');
      card.style.cssText = layout === 'vertical'
        ? 'display:flex;align-items:flex-start;gap:clamp(6px,1.6cqmin,18px);position:relative;'
        : 'flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;text-align:center;gap:.35em;position:relative;';

      const mk = markerFor(i, s);
      card.appendChild(mk);

      const body = document.createElement('div');
      body.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:.15em;'
        + (layout === 'vertical' ? 'flex:1;' : 'align-items:center;');
      const title = document.createElement('div');
      title.style.cssText = `font:700 ${titleFont}/1.2 var(--bb-st-font,Inter,system-ui,sans-serif);`;
      title.textContent = s.title ?? '';
      body.appendChild(title);
      if (c.showDesc && s.desc) {
        const desc = document.createElement('div');
        desc.style.cssText = `font:400 ${descFont}/1.4 var(--bb-st-font,Inter,system-ui,sans-serif);opacity:.72;`;
        desc.textContent = s.desc;
        body.appendChild(desc);
      }
      card.appendChild(body);

      // The connector: a hairline between this marker and the next one. Drawn
      // per-card (not as one long rule) so it survives any wrap the grid does.
      if (c.showConnector && i < steps.length - 1 && marker !== 'none' && layout !== 'grid') {
        const line = document.createElement('span');
        line.setAttribute('aria-hidden', 'true');
        line.style.cssText = 'position:absolute;background:color-mix(in srgb, var(--bb-st-accent) 35%, transparent);'
          + (layout === 'vertical'
            ? `left:calc(${markFont} * .95);top:calc(${markFont} * 2.1);width:.1em;height:calc(100% - ${markFont} * 1.4);font-size:${markFont};`
            : `top:calc(${markFont} * .95);left:calc(50% + ${markFont} * 1.2);width:calc(100% - ${markFont} * 2.4);height:.09em;font-size:${markFont};`);
        card.appendChild(line);
      }

      listEl.appendChild(card);
      return card;
    });

    const applySpotlight = (idx) => {
      // idx is 1-based to match the inspector field; 0 means "no spotlight".
      cards.forEach((el, i) => {
        const dim = idx > 0 && i !== idx - 1;
        el.style.opacity = dim ? '.34' : '1';
        el.style.transform = idx > 0 && i === idx - 1 ? 'scale(1.03)' : '';
        el.style.transition = 'opacity .5s ease, transform .5s ease';
      });
    };

    const reduced = prefersReducedMotion();
    const startAt = Math.max(0, Math.min(steps.length, Number(c.spotlight) || 0));
    const walkSec = Math.max(0, Number(c.autoAdvanceSec) || 0);
    applySpotlight(startAt);

    if (walkSec > 0 && !reduced) {
      let cur = startAt > 0 ? startAt : 1;
      applySpotlight(cur);
      const id = setInterval(() => {
        cur = cur >= steps.length ? 1 : cur + 1;
        applySpotlight(cur);
      }, Math.max(1000, walkSec * 1000));
      container.appendChild(root);
      return composeDispose(() => { clearInterval(id); root.remove(); });
    }

    container.appendChild(root);
    return composeDispose(() => root.remove());
  },
});
