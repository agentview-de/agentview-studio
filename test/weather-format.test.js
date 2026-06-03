// Tests for the weather widget's pure formatting/derivation helpers, extracted
// from shared/plugins/weather.js into weather-format.js so they can be exercised
// without mounting the DOM-heavy widget. These back the dashboard KPI subtitles,
// the temperature colour ramp, the wind arrow, and per-design toggle gating.

import { test, expect, describe } from './runner.js';
import {
  WMO, tempColor, tempBarGradient, windArrowSvg,
  formatTime, formatHour, compassName, windDesc, humidityDesc,
  feelsLikeDesc, dayLength, designSupports, relativeAge,
} from '../shared/plugins/weather-format.js';

describe('weather-format · tempColor', () => {
  test('returns null for non-finite input', () => {
    expect(tempColor(NaN)).toBe(null);
    expect(tempColor('hot')).toBe(null);
    expect(tempColor(undefined)).toBe(null);
  });
  test('cold side is a blue-ish hsl', () => {
    const c = tempColor(-10);
    expect(c).toMatch(/^hsl\(/);
    const hue = Number(c.match(/hsl\(([\d.]+)/)[1]);
    expect(hue > 190 && hue < 225).toBe(true); // blue ramp
  });
  test('mild midrange is the fixed neutral cream', () => {
    expect(tempColor(18)).toBe('hsl(40, 12%, 88%)');
  });
  test('hot side trends toward red (hue near 0)', () => {
    const hue = Number(tempColor(40).match(/hsl\((\d+)/)[1]);
    expect(hue < 10).toBe(true);
  });
  test('clamps extreme inputs (no crash, finite hsl)', () => {
    expect(tempColor(-999)).toMatch(/^hsl\(/);
    expect(tempColor(999)).toMatch(/^hsl\(/);
  });
});

describe('weather-format · tempBarGradient', () => {
  test('builds a left-to-right gradient between two temp colours', () => {
    const g = tempBarGradient(5, 30);
    expect(g).toMatch(/^linear-gradient\(90deg, /);
    expect(g).toContain(tempColor(5));
    expect(g).toContain(tempColor(30));
  });
  test('falls back to translucent white when a temp is non-finite', () => {
    const g = tempBarGradient(NaN, NaN);
    expect(g).toContain('rgba(255,255,255,.4)');
    expect(g).toContain('rgba(255,255,255,.7)');
  });
});

describe('weather-format · windArrowSvg', () => {
  test('rotates by deg+180 (points where the wind is going)', () => {
    expect(windArrowSvg(0)).toContain('rotate(180deg)');
    expect(windArrowSvg(90)).toContain('rotate(270deg)');
    expect(windArrowSvg(270)).toContain('rotate(90deg)'); // (270+180)%360
  });
  test('coerces junk to 0°', () => {
    expect(windArrowSvg('x')).toContain('rotate(180deg)');
  });
});

describe('weather-format · compassName', () => {
  test('cardinal + intercardinal directions', () => {
    expect(compassName(0)).toBe('N');
    expect(compassName(90)).toBe('E');
    expect(compassName(180)).toBe('S');
    expect(compassName(270)).toBe('W');
    expect(compassName(45)).toBe('NE');
  });
  test('wraps past 360 and handles negatives', () => {
    expect(compassName(360)).toBe('N');
    expect(compassName(-90)).toBe('W');
  });
  test('empty string for non-finite', () => {
    expect(compassName('x')).toBe('');
  });
});

describe('weather-format · windDesc (unit-aware buckets)', () => {
  test('km/h buckets', () => {
    expect(windDesc(1, 'kmh')).toBe('Calm');
    expect(windDesc(5, 'kmh')).toBe('Light');
    expect(windDesc(15, 'kmh')).toBe('Moderate');
    expect(windDesc(60, 'kmh')).toBe('Gale');
    expect(windDesc(100, 'kmh')).toBe('Storm');
  });
  test('mph and m/s are converted before bucketing', () => {
    // 40 mph ≈ 64 km/h → Gale; 40 km/h would be Strong, so conversion matters.
    expect(windDesc(40, 'mph')).toBe('Gale');
    // 10 m/s = 36 km/h → Strong
    expect(windDesc(10, 'ms')).toBe('Strong');
  });
  test('empty for non-finite', () => {
    expect(windDesc('x', 'kmh')).toBe('');
  });
});

describe('weather-format · humidityDesc / feelsLikeDesc', () => {
  test('humidity buckets', () => {
    expect(humidityDesc(10)).toBe('Dry');
    expect(humidityDesc(40)).toBe('Comfortable');
    expect(humidityDesc(65)).toBe('Humid');
    expect(humidityDesc(90)).toBe('Very humid');
    expect(humidityDesc('x')).toBe('');
  });
  test('feels-like delta wording', () => {
    expect(feelsLikeDesc(20, 20)).toBe('As actual');
    expect(feelsLikeDesc(20, 25)).toBe('5° warmer');
    expect(feelsLikeDesc(20, 15)).toBe('5° cooler');
    expect(feelsLikeDesc(20, NaN)).toBe('');
  });
});

describe('weather-format · dayLength', () => {
  test('formats hours + minutes between sunrise and sunset', () => {
    expect(dayLength('2026-06-03T05:00:00Z', '2026-06-03T20:44:00Z')).toBe('Day: 15h 44min');
  });
  test('empty when missing or inverted', () => {
    expect(dayLength('', '2026-06-03T20:00:00Z')).toBe('');
    expect(dayLength('2026-06-03T20:00:00Z', '2026-06-03T05:00:00Z')).toBe('');
  });
});

describe('weather-format · designSupports', () => {
  test('minimal hides most toggles, classic hides none', () => {
    expect(designSupports('classic', 'forecast')).toBe(true);
    expect(designSupports('minimal', 'forecast')).toBe(false);
    expect(designSupports('minimal', 'whatever-unknown')).toBe(true); // not in hidden set
  });
  test('unknown design falls back to classic (supports everything)', () => {
    expect(designSupports('does-not-exist', 'hourly')).toBe(true);
  });
});

describe('weather-format · misc', () => {
  test('WMO maps known codes and the render code defaults unknowns itself', () => {
    expect(WMO[0][1]).toBe('Clear sky');
    expect(WMO[95][1]).toBe('Thunderstorm');
    expect(WMO[12345]).toBe(undefined);
  });
  test('formatTime/formatHour return empty for invalid input', () => {
    expect(formatTime('')).toBe('');
    expect(formatTime('not-a-date')).toBe('');
    expect(formatHour('')).toBe('');
  });
  test('relativeAge buckets by elapsed time', () => {
    const now = Date.now();
    expect(relativeAge(now)).toBe('Updated just now');
    expect(relativeAge(now - 45_000)).toBe('Updated 45s ago');
    expect(relativeAge(now - 5 * 60_000)).toBe('Updated 5 min ago');
    expect(relativeAge(now - 3 * 3600_000)).toBe('Updated over an hour ago');
    expect(relativeAge('x')).toBe('');
  });
});
