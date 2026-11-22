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
  it('handles negative azimuth', () => {
    const p = flatProfile();
    p.altitudes[359] = 40;
    p.altitudes[0] = 20;
    expect(heightAt(p, -0.5, false)).toBeCloseTo(30);
    expect(heightAt(p, -1, false)).toBe(40);
  });
  it('handles azimuth >= 360', () => {
    const p = flatProfile();
    p.altitudes[5] = 10;
    p.altitudes[6] = 20;
    expect(heightAt(p, 365.5, false)).toBeCloseTo(15);
    expect(heightAt(p, 360, false)).toBe(0);
  });
  it('interpolates between seasonal and non-seasonal neighbours when bare', () => {
    const p = flatProfile();
    p.altitudes[20] = 30;
    p.seasonal[20] = true;
    p.leafOffAltitudes[20] = 10;
    p.altitudes[21] = 20;
    expect(heightAt(p, 20.5, true)).toBeCloseTo(15);
    expect(heightAt(p, 20.5, false)).toBeCloseTo(25);
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
  it('detects the wall only via the wrap across 0 (az 359)', () => {
    expect(frameClears(wall, false, 33, 359, 1.4, 2)).toBe(false);
  });
  it('clears across the wrap when the wall starts just past 0 (needs working wrap)', () => {
    const east = setRange(flatProfile(), 1, 5, 30);
    // the sample at az 359.5 interpolates idx 359 and idx 0 (wrap) -> 0; wall (30+2) is below frame bottom 32.6
    expect(frameClears(east, false, 34, 359.5, 1.4, 2)).toBe(true);
    // and the same frame at az 359 (samples 360.67 -> interp idx 0/1 ~ 20) also clears
    expect(frameClears(east, false, 33, 359, 1.4, 2)).toBe(true);
  });
  it('detects the wall via negative sample azimuths (az 1)', () => {
    expect(frameClears(wall, false, 33, 1, 1.4, 2)).toBe(false);
  });
  it('evaluates the exact span endpoint between integer azimuths', () => {
    const p = flatProfile();
    p.altitudes[11] = 30; // heightAt(10.905) = 27.15
    // span = 0.85/cos(20deg) ~ 0.905, so the only integer sampled is 10 (height 0)
    expect(frameClears(p, false, 20, 10, 0.85, 2)).toBe(false);
  });
  it('evaluates the target azimuth itself when no integer azimuth is in span', () => {
    const p = flatProfile();
    p.altitudes[100] = 30;
    p.altitudes[101] = 30;
    expect(frameClears(p, false, 20, 100.5, 0.2, 2)).toBe(false);
    expect(frameClears(p, false, 40, 100.5, 0.2, 2)).toBe(true);
  });
  it('treats a non-finite height as blocked', () => {
    const p = flatProfile();
    p.altitudes[50] = NaN;
    expect(frameClears(p, false, 60, 50, 1, 2)).toBe(false);
  });
  it('treats a null profile as height 0', () => {
    expect(frameClears(null, false, 5, 100, 1.4, 2)).toBe(true);
    expect(frameClears(null, false, 3, 100, 1.4, 2)).toBe(false);
  });
});
