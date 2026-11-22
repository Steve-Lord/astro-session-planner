import { describe, it, expect } from 'vitest';
import { BORTLE_SQM, DEFAULT_SETTINGS, baselineSqm, effectiveSky, moonlitSqm } from '../../src/lib/sky/brightness';

describe('baselineSqm', () => {
  it('uses bortle table, sqm, or default', () => {
    expect(baselineSqm({ bortle: 6 })).toBe(19.3);
    expect(baselineSqm({ sqm: 20.5 })).toBe(20.5);
    expect(baselineSqm({})).toBe(19.3);
    expect(BORTLE_SQM).toHaveLength(9);
  });
});

describe('moonlitSqm', () => {
  it('is unchanged with moon below horizon', () => {
    expect(moonlitSqm(19.3, -5, 1, 45, 30)).toBe(19.3);
  });
  it('full moon near target brightens sky substantially', () => {
    const r = moonlitSqm(19.3, 45, 1, 45, 30);
    expect(r).toBeGreaterThan(17.0);
    expect(r).toBeLessThan(18.3);
  });
  it('is less bright at larger separation', () => {
    const near = 19.3 - moonlitSqm(19.3, 45, 1, 45, 30);
    const far = 19.3 - moonlitSqm(19.3, 45, 1, 45, 120);
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(near);
  });
  it('thin crescent barely matters', () => {
    expect(Math.abs(moonlitSqm(19.3, 45, 0.08, 45, 30) - 19.3)).toBeLessThan(0.3);
  });
  it('returns base when illumination is zero', () => {
    expect(moonlitSqm(19.3, 45, 0, 45, 30)).toBe(19.3);
  });
});

describe('effectiveSky', () => {
  const s = DEFAULT_SETTINGS;
  it('applies filter effects', () => {
    expect(effectiveSky(18, 'emission', 'dual-band', s)).toBeCloseTo(20.5, 6);
    expect(effectiveSky(18, 'emission', 'narrowband', s)).toBeCloseTo(21.5, 6);
    expect(effectiveSky(18, 'mixed', 'dual-band', s)).toBeCloseTo(19.25, 6);
    expect(effectiveSky(18, 'broadband', 'dual-band', s)).toBeCloseTo(17.7, 6);
    expect(effectiveSky(18, 'broadband', 'broadband-lp', s)).toBe(18);
    for (const e of ['emission', 'broadband', 'mixed'] as const) expect(effectiveSky(18, e, 'none', s)).toBe(18);
  });
});
