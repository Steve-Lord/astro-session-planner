import { describe, it, expect } from 'vitest';
import * as A from 'astronomy-engine';
import { BRIGHT_STARS, calibrationCandidates, offsetFromAim, rotateProfile } from '../../src/lib/sweep/calibration';
import { flatProfile, setRange } from '../../src/lib/horizon/profile';
import type { Site } from '../../src/lib/types';

const site: Site = { id: 's', name: 'Home', lat: 51.5, lon: -0.1, elevation: 10, timezone: 'Europe/London',
  sky: {}, horizon: null, treesBare: false, isDefault: true };
const obs = new A.Observer(site.lat, site.lon, site.elevation);

describe('BRIGHT_STARS', () => {
  it('has the 20 named stars', () => {
    expect(BRIGHT_STARS).toHaveLength(20);
    expect(new Set(BRIGHT_STARS.map((s) => s.name)).size).toBe(20);
  });
  it('matches an independent astronomy-engine computation within 0.05 deg', () => {
    const at = new Date('2026-12-01T21:00:00Z');
    const cands = calibrationCandidates({ ...site, lat: 20 }, at); // low latitude: most stars in range somewhere
    const all = [site, { ...site, lat: 20 }, { ...site, lat: -20 }, { ...site, lon: 120 }];
    let checked = 0;
    for (const st of all) {
      for (const c of calibrationCandidates(st, at).filter((x) => x.kind === 'star')) {
        const star = BRIGHT_STARS.find((b) => `star:${b.name}` === c.id)!;
        A.DefineStar(A.Body.Star1, star.ra / 15, star.dec, 1000);
        const o = new A.Observer(st.lat, st.lon, st.elevation);
        const eq = A.Equator(A.Body.Star1, at, o, true, true);
        const h = A.Horizon(at, o, eq.ra, eq.dec, 'normal');
        expect(Math.abs(h.altitude - c.alt)).toBeLessThan(0.05);
        expect(Math.abs(h.azimuth - c.az)).toBeLessThan(0.05);
        checked++;
      }
    }
    expect(cands.length).toBeGreaterThan(0);
    expect(checked).toBeGreaterThan(10);
  });
});

describe('calibrationCandidates', () => {
  it('keeps alt in 5..60, never offers the Sun, sorts Moon, planets, then stars by magnitude', () => {
    for (const h of [0, 4, 8, 12, 16, 20]) {
      const cs = calibrationCandidates(site, new Date(Date.UTC(2026, 10, 22, h)));
      for (const c of cs) {
        expect(c.alt).toBeGreaterThanOrEqual(5);
        expect(c.alt).toBeLessThanOrEqual(60);
        expect(c.id).not.toMatch(/sun/i);
        expect(c.label).not.toMatch(/sun/i);
      }
      const rank = { moon: 0, planet: 1, star: 2 } as const;
      const ranks = cs.map((c) => rank[c.kind]);
      expect(ranks).toEqual([...ranks].sort());
      const mags = cs.filter((c) => c.kind === 'star').map((c) => BRIGHT_STARS.find((b) => `star:${b.name}` === c.id)!.mag);
      expect(mags).toEqual([...mags].sort((a, b) => a - b));
    }
  });
  it('excludes Venus when it is within 30 deg of the Sun', () => {
    let found: Date | null = null;
    for (let d = 0; d < 365 * 24 && !found; d += 3) {
      const t = new Date(Date.UTC(2026, 0, 1) + d * 3600e3);
      if (A.AngleFromSun(A.Body.Venus, t) >= 30) continue;
      const eq = A.Equator(A.Body.Venus, t, obs, true, true);
      const alt = A.Horizon(t, obs, eq.ra, eq.dec, 'normal').altitude;
      if (alt > 6 && alt < 59) found = t;
    }
    expect(found).not.toBeNull();
    expect(calibrationCandidates(site, found!).map((c) => c.id)).not.toContain('venus');
  });
  it('offers Venus when it is well clear of the Sun and in range', () => {
    let found: Date | null = null;
    for (let d = 0; d < 365 * 24 && !found; d += 3) {
      const t = new Date(Date.UTC(2026, 0, 1) + d * 3600e3);
      if (A.AngleFromSun(A.Body.Venus, t) < 35) continue;
      const eq = A.Equator(A.Body.Venus, t, obs, true, true);
      const alt = A.Horizon(t, obs, eq.ra, eq.dec, 'normal').altitude;
      if (alt > 6 && alt < 59) found = t;
    }
    expect(found).not.toBeNull();
    expect(calibrationCandidates(site, found!).map((c) => c.id)).toContain('venus');
  });
});

describe('offsetFromAim', () => {
  it('solves a simple offset', () => {
    const r = offsetFromAim([{ azMag: 80, alt: 30 }, { azMag: 80, alt: 32 }], { az: 90, alt: 30 }, 0);
    expect(r.offsetDeg).toBeCloseTo(10, 6);
    expect(r.residualAltDeg).toBeCloseTo(1, 6);
    expect(r.spreadDeg).toBeCloseTo(0, 3);
  });
  it('includes declination', () => {
    expect(offsetFromAim([{ azMag: 80, alt: 30 }], { az: 90, alt: 30 }, 4).offsetDeg).toBeCloseTo(6, 6);
  });
  it('wraps across north', () => {
    expect(offsetFromAim([{ azMag: 5, alt: 30 }], { az: 355, alt: 30 }, 0).offsetDeg).toBeCloseTo(-10, 6);
  });
  it('reports spread', () => {
    const r = offsetFromAim([{ azMag: 75, alt: 0 }, { azMag: 85, alt: 0 }], { az: 90, alt: 0 }, 0);
    expect(r.offsetDeg).toBeCloseTo(10, 3);
    expect(r.spreadDeg).toBeGreaterThan(4);
    expect(r.spreadDeg).toBeLessThan(6);
  });
  it('throws on no readings', () => {
    expect(() => offsetFromAim([], { az: 0, alt: 0 }, 0)).toThrow('No readings to calibrate from');
  });
});

describe('rotateProfile', () => {
  it('moves a roof by +10', () => {
    const p = rotateProfile(setRange(flatProfile(), 90, 150, 30), 10);
    expect(p.altitudes[100]).toBeCloseTo(30);
    expect(p.altitudes[160]).toBeCloseTo(30);
    expect(p.altitudes[95]).toBeCloseTo(0);
    expect(p.altitudes[165]).toBeCloseTo(0);
    expect(p.northOffsetDeg).toBe(10);
  });
  it('wraps a feature at 355-5 to 5-15', () => {
    const p = rotateProfile(setRange(flatProfile(), 355, 5, 30), 10);
    expect(p.altitudes[5]).toBeCloseTo(30);
    expect(p.altitudes[15]).toBeCloseTo(30);
    expect(p.altitudes[0]).toBeCloseTo(0);
    expect(p.altitudes[20]).toBeCloseTo(0);
  });
  it('round-trips +7 then -7, is pure, and preserves calibration/createdAt', () => {
    const base = setRange(flatProfile(), 90, 150, 30);
    base.altitudes[200] = 12.5;
    base.seasonal[120] = true;
    base.leafOffAltitudes[120] = 8;
    base.unswept = new Array<boolean>(360).fill(false);
    base.unswept[40] = true;
    base.calibration = { target: 'moon', at: 'x', residualAltDeg: 0.2 };
    const snap = structuredClone(base);
    const r = rotateProfile(rotateProfile(base, 7), -7);
    expect(base).toEqual(snap);
    r.altitudes.forEach((v, i) => expect(Math.abs(v - base.altitudes[i])).toBeLessThan(0.01));
    r.leafOffAltitudes.forEach((v, i) => expect(Math.abs(v - base.leafOffAltitudes[i])).toBeLessThan(0.01));
    expect(r.seasonal).toEqual(base.seasonal);
    expect(r.unswept).toEqual(base.unswept);
    expect(r.calibration).toEqual(base.calibration);
    expect(r.createdAt).toBe(base.createdAt);
    expect(r.northOffsetDeg).toBeCloseTo(0);
  });
  it('interpolates altitudes linearly for fractional shifts but uses nearest for flags', () => {
    const p = flatProfile();
    p.altitudes[10] = 10;
    p.seasonal[10] = true;
    const r = rotateProfile(p, 0.5);
    expect(r.altitudes[10]).toBeCloseTo(5);
    expect(r.altitudes[11]).toBeCloseTo(5);
    expect(r.seasonal.filter(Boolean)).toHaveLength(1);
  });
});
