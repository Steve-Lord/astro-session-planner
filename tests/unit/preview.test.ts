import { describe, expect, it } from 'vitest';
import { SEESTAR_S50_PRO, frameFit } from '../../src/lib/gear/fit';
import { framePreview } from '../../src/lib/gear/preview';
import type { Target } from '../../src/lib/types';

function target(maj: number | null, min: number | null, posAngle: number | null = null): Target {
  return { id: 'T', names: ['T'], ra: 0, dec: 0, type: 'Neb', majArcmin: maj, minArcmin: min,
    posAngle, mag: null, surfBr: null, emission: 'emission' };
}

const g = SEESTAR_S50_PRO;

describe('framePreview', () => {
  it('draws the S50 frame landscape at its field of view', () => {
    const p = framePreview(target(10, 10), g, frameFit(target(10, 10), g, 0.05));
    expect(p.frameW).toBeCloseTo(147.3, 1);
    expect(p.frameH).toBeCloseTo(82.8, 1);
  });

  it('M31 mosaic uses the fit panels and a rotated ellipse', () => {
    const m31 = target(178, 70, 35);
    const fit = frameFit(m31, g, 0.05);
    const p = framePreview(m31, g, fit);
    expect(p.cols).toBe(fit.panels![0]);
    expect(p.rows).toBe(fit.panels![1]);
    expect(p.gridW).toBeGreaterThanOrEqual(178);
    expect(p.ellipse).not.toBeNull();
    expect(p.ellipse!.rotateDeg).toBe(55);
    expect(p.orientationKnown).toBe(true);
    expect(p.ellipse!.rx).toBe(89);
    expect(p.ellipse!.ry).toBe(35);
  });

  it('grid size follows the overlap formula', () => {
    const m31 = target(178, 70, 35);
    const fit = frameFit(m31, g, 0.05);
    const p = framePreview(m31, g, fit);
    expect(p.gridW).toBeCloseTo(p.cols * 0.85 * p.frameW + 0.15 * p.frameW, 6);
    expect(p.gridH).toBeCloseTo(p.rows * 0.85 * p.frameH + 0.15 * p.frameH, 6);
  });

  it('a 1x1 fit has grid equal to the frame', () => {
    const m33 = target(70.8, 41.7, 0);
    const p = framePreview(m33, g, frameFit(m33, g, 0.05));
    expect(p.cols).toBe(1);
    expect(p.rows).toBe(1);
    expect(p.gridW).toBeCloseTo(p.frameW, 6);
    expect(p.gridH).toBeCloseTo(p.frameH, 6);
  });

  it('NGC 7000 without position angle is unoriented', () => {
    const n7000 = target(120, 100, null);
    const p = framePreview(n7000, g, frameFit(n7000, g, 0.05));
    expect(p.ellipse!.rotateDeg).toBe(0);
    expect(p.orientationKnown).toBe(false);
    expect(p.ellipse!.ry).toBe(50);
  });

  it('a target with no minor axis is a circle', () => {
    const ngc104 = target(32, null);
    const p = framePreview(ngc104, g, frameFit(ngc104, g, 0.05));
    expect(p.ellipse!.rx).toBe(16);
    expect(p.ellipse!.ry).toBe(16);
    expect(p.ellipse!.rx).toBe(p.ellipse!.ry);
  });

  it('a size-unknown target has no ellipse and a 1x1 grid', () => {
    const unknown = target(null, null);
    const p = framePreview(unknown, g, frameFit(unknown, g, 0.05));
    expect(p.ellipse).toBeNull();
    expect(p.cols).toBe(1);
    expect(p.rows).toBe(1);
  });

  it('maps position angle to rotation north up, east left', () => {
    const rot = (pa: number) => {
      const t = target(10, 5, pa);
      return framePreview(t, g, frameFit(t, g, 0.05)).ellipse!.rotateDeg;
    };
    expect(rot(90)).toBe(0);
    expect(rot(0)).toBe(90);
    expect(rot(170)).toBe(100);
  });
});
