import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { declination } from '../../src/lib/sweep/geomag';

// Columns: year, altitude km, geodetic lat, geodetic lon, declination, ...
const rows = readFileSync('data/wmm/WMM2025_TestValues.txt', 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.trim() !== '' && !l.startsWith('#'))
  .map((l) => l.trim().split(/\s+/).map(Number));

/** Date at the given decimal year (UTC), inverse of the module's conversion. */
function dateOf(decimalYear: number): Date {
  const y = Math.floor(decimalYear);
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return new Date(start + (decimalYear - y) * (end - start));
}

describe('declination (WMM2025)', () => {
  it('parses the full NOAA test-value table', () => {
    expect(rows.length).toBe(100);
  });

  it.each(rows.map((r) => ({ year: r[0], alt: r[1], lat: r[2], lon: r[3], d: r[4] })))(
    'matches NOAA at $year alt $alt lat $lat lon $lon',
    ({ year, alt, lat, lon, d }) => {
      let diff = declination(lat, lon, alt, dateOf(year)) - d;
      diff = ((diff + 540) % 360) - 180;
      // 0.01 deg tolerance plus float slack for the 2-decimal expected values
      expect(Math.abs(diff)).toBeLessThanOrEqual(0.01 + 1e-9);
    },
  );

  it('throws RangeError outside 2025.0-2030.0', () => {
    expect(() => declination(51, 0, 0, new Date(Date.UTC(2024, 11, 31)))).toThrow(RangeError);
    expect(() => declination(51, 0, 0, new Date(Date.UTC(2030, 0, 1)))).toThrow(RangeError);
  });

  it('is east-positive: roughly +14 deg in the Pacific NW 2025', () => {
    expect(declination(47.6, -122.3, 0, new Date(Date.UTC(2025, 6, 1)))).toBeGreaterThan(14);
  });
});
