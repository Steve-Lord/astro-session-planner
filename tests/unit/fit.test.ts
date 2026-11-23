import { describe, expect, it } from 'vitest';
import { SEESTAR_S50_PRO, fovArcmin, frameFit, withMount } from '../../src/lib/gear/fit';
import type { Target } from '../../src/lib/types';

function target(maj: number | null, min: number | null): Target {
  return { id: 'T', names: ['T'], ra: 0, dec: 0, type: 'Neb', majArcmin: maj, minArcmin: min,
    posAngle: null, mag: null, surfBr: null, emission: 'emission' };
}

describe('SEESTAR_S50_PRO', () => {
  it('has the built-in profile', () => {
    expect(SEESTAR_S50_PRO).toMatchObject({ id: 'seestar-s50-pro', focalLengthMm: 260, sensorWmm: 11.14,
      sensorHmm: 6.26, pixelUm: 2.9, mount: 'altaz', minAltDeg: 15, maxAltDeg: 80, builtIn: true });
    expect(SEESTAR_S50_PRO.filters.map((f) => f.id)).toEqual(['none', 'dual-band']);
  });
});

describe('fovArcmin', () => {
  it('computes the S50 Pro field of view', () => {
    const f = fovArcmin(SEESTAR_S50_PRO);
    expect(f.long).toBeCloseTo(147.3, 0);
    expect(Math.abs(f.long - 147.3)).toBeLessThan(0.5);
    expect(Math.abs(f.short - 82.8)).toBeLessThan(0.5);
    expect(Math.abs(f.halfDiagDeg - 1.4)).toBeLessThan(0.02);
  });
});

describe('frameFit', () => {
  const g = SEESTAR_S50_PRO;
  it('NGC 7000 needs a 1x2 mosaic', () => {
    const r = frameFit(target(120, 100), g, 0.05);
    expect(r.label).toBe('mosaic');
    expect(r.panels).toEqual([1, 2]);
  });
  it('M31 needs a 2x1 mosaic', () => {
    const r = frameFit(target(190, 60), g, 0.05);
    expect(r.label).toBe('mosaic');
    expect(r.panels).toEqual([2, 1]);
  });
  it('M33 is a good fit', () => {
    const r = frameFit(target(70.8, 41.7), g, 0.05);
    expect(r.label).toBe('good');
    expect(r.fill).toBeCloseTo(0.48, 2);
    expect(r.panels).toBeNull();
  });
  it('tiny targets are too small', () => {
    expect(frameFit(target(0.5, 0.5), g, 0.05).label).toBe('too-small');
  });
  it('null size is size-unknown', () => {
    expect(frameFit(target(null, null), g, 0.05)).toEqual({ label: 'size-unknown', fill: null, panels: null });
  });
  it('is tight above 80% fill', () => {
    expect(frameFit(target(130, 50), g, 0.05).label).toBe('tight');
  });
  it('treats null minor as major', () => {
    const r = frameFit(target(100, null), g, 0.05);
    expect(r.label).toBe('mosaic');
    expect(r.panels).toEqual([1, 2]);
  });
  it('too-small wins over mosaic and fill is maj/long for mosaics', () => {
    expect(frameFit(target(190, 60), g, 2).label).toBe('too-small');
    expect(frameFit(target(190, 60), g, 0.05).fill).toBeCloseTo(190 / fovArcmin(g).long, 6);
  });
});

describe('withMount', () => {
  it('withMount sets mount and the zenith limit', () => {
    const eq = withMount(SEESTAR_S50_PRO, 'eq');
    expect(eq.mount).toBe('eq');
    expect(eq.maxAltDeg).toBe(90);
    expect(withMount(eq, 'altaz').maxAltDeg).toBe(80);
    expect(SEESTAR_S50_PRO.mount).toBe('altaz');
    const { mount: _m, maxAltDeg: _x, ...rest } = eq;
    const { mount: _m2, maxAltDeg: _x2, ...orig } = SEESTAR_S50_PRO;
    expect(rest).toEqual(orig);
  });
});
