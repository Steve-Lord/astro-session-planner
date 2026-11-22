import { describe, it, expect } from 'vitest';
import { flatProfile, heightAt, frameClears, setRange } from '../../src/lib/horizon/profile';

describe('flatProfile', () => {
  it('is all zeros, manual source, length 360', () => {
    const p = flatProfile();
    expect(p.altitudes).toHaveLength(360);
    expect(p.leafOffAltitudes).toHaveLength(360);
    expect(p.seasonal).toHaveLength(360);
    expect(p.altitudes.every((v) => v === 0)).toBe(true);
    expect(p.source).toBe('manual');
  });
});

describe('heightAt', () => {
  it('interpolates linearly between integer azimuths', () => {
    const p = flatProfile();
    p.altitudes[10] = 20;
    p.altitudes[11] = 30;
    expect(heightAt(p, 10.5, false)).toBeCloseTo(25);
  });
  it('wraps 359 -> 0', () => {
    const p = flatProfile();
    p.altitudes[359] = 40;
    p.altitudes[0] = 20;
    expect(heightAt(p, 359.5, false)).toBeCloseTo(30);
  });
  it('uses leaf-off altitudes for seasonal azimuths when trees are bare', () => {
    const p = flatProfile();
    p.altitudes[90] = 35;
    p.seasonal[90] = true;
    p.leafOffAltitudes[90] = 10;
    expect(heightAt(p, 90, false)).toBe(35);
    expect(heightAt(p, 90, true)).toBe(10);
  });
  it('returns 0 for a null profile', () => {
    expect(heightAt(null, 123, true)).toBe(0);
  });
});

describe('setRange', () => {
  it('sets a range wrapping through north, inclusive, without mutating', () => {
    const p = flatProfile();
    const q = setRange(p, 350, 10, 25);
    for (let i = 350; i < 360; i++) expect(q.altitudes[i]).toBe(25);
    for (let i = 0; i <= 10; i++) expect(q.altitudes[i]).toBe(25);
    expect(q.altitudes[11]).toBe(0);
    expect(q.altitudes[349]).toBe(0);
    expect(p.altitudes[355]).toBe(0);
    expect(q.altitudes).not.toBe(p.altitudes);
  });
  it('handles a non-wrapping range', () => {
    const q = setRange(flatProfile(), 100, 102, 5);
    expect([99, 100, 101, 102, 103].map((i) => q.altitudes[i])).toEqual([0, 5, 5, 5, 0]);
  });
});

describe('frameClears', () => {
  const wall = setRange(flatProfile(), 355, 5, 30);
  it('fails when the frame bottom is below wall + clearance', () => {
    expect(frameClears(wall, false, 33.3, 2, 1.4, 2)).toBe(false);
  });
  it('clears away from the wall', () => {
    expect(frameClears(wall, false, 33.5, 20, 1.4, 2)).toBe(true);
  });
  it('clears across the wrap when high enough', () => {
    expect(frameClears(wall, false, 34, 359, 1.4, 2)).toBe(true);
  });
  it('treats a null profile as height 0', () => {
    expect(frameClears(null, false, 5, 100, 1.4, 2)).toBe(true);
    expect(frameClears(null, false, 3, 100, 1.4, 2)).toBe(false);
  });
});
