// The chart offered a language field that changed nothing.
//
// `formatValue(v, opts)` reads `opts.locale`, and the options object the render
// closure builds — kind, yMax, goalValue, showValues, valueFormat, valueUnit,
// palette — never carried it. So every number the canvas painted was formatted
// for the DEVICE, whatever the widget said. That silently included the 'full'
// format, whose own comment has always explained why it matters: a chart
// reading 1,234.5 in a German foyer is off by three orders of magnitude to
// anyone who reads it as 1234,5.
//
// A field that is present, documented and inert is worse than a missing one:
// someone sets it, sees a plausible chart, and ships it.
//
// Browser-only: the chart paints to a canvas on requestAnimationFrame, so this
// watches which formatter it builds rather than trying to read pixels.

import { test, expect, describe } from './runner.js';
import '../shared/plugins/registry.js';
import { mountWidget } from '../shared/widget-host.js';

/** Mount a chart, note every locale Intl.NumberFormat was constructed with. */
async function localesUsedBy(content) {
  const real = Intl.NumberFormat;
  const seen = [];
  Intl.NumberFormat = function (loc, opts) { seen.push(String(loc)); return new real(loc, opts); };
  Intl.NumberFormat.supportedLocalesOf = real.supportedLocalesOf;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-4000px;top:0;width:640px;height:360px;';
  document.body.appendChild(host);
  let dispose = () => {};
  try {
    dispose = mountWidget({ id: 'c', type: 'chart', content }, {}, host, { mode: 'live' });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 60));
  } finally {
    Intl.NumberFormat = real;
    dispose();
    host.remove();
  }
  return [...new Set(seen)];
}

const chart = (extra) => ({
  kind: 'bar', source: 'inline', showValues: true,
  data: [{ label: 'A', value: 1234.56 }, { label: 'B', value: 12000 }],
  ...extra,
});

describe('chart · the language field actually reaches the numbers', () => {
  test('REGRESSION: a chart set to German formats for German', async () => {
    // A locale nothing else in the suite uses, so a cached formatter cannot
    // make this pass by accident.
    const used = await localesUsedBy(chart({ locale: 'fr-CA', valueFormat: 'compact' }));
    expect(used).toContain('fr-CA');
  });

  test('REGRESSION: the "full" format honours it too', async () => {
    const used = await localesUsedBy(chart({ locale: 'fr-CH', valueFormat: 'full' }));
    expect(used).toContain('fr-CH');
  });

  test('the percent format honours it', async () => {
    const used = await localesUsedBy(chart({ locale: 'fr-BE', valueFormat: 'percent' }));
    expect(used).toContain('fr-BE');
  });

  test('no language set still paints — the device decides', async () => {
    const used = await localesUsedBy(chart({ locale: '' }));
    expect(Array.isArray(used)).toBeTruthy();
    expect(used).notToContain('fr-CA');
  });
});
