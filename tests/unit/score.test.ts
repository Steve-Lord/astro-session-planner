import { describe, expect, it } from 'vitest'
import { scoreEntry, WEIGHTS } from '../../src/lib/plan/score'
import { DEFAULT_SETTINGS } from '../../src/lib/sky/brightness'
import type { PlanEntry, Target } from '../../src/lib/types'

const s = DEFAULT_SETTINGS
const target: Target = {
  id: 'x', names: ['x'], ra: 0, dec: 0, type: 'G', majArcmin: 30, minArcmin: 20, posAngle: null,
  mag: null, surfBr: 22, emission: 'emission',
}
const H = 3600000
const base = (o: Partial<Omit<PlanEntry, 'score' | 'breakdown'>> = {}): Omit<PlanEntry, 'score' | 'breakdown'> => ({
  target, windows: [{ start: 0, end: 4 * H }], totalHours: 4, best: { start: 0, end: 4 * H },
  peakAlt: 90, fit: { label: 'good', fill: 0.3, panels: null }, contrastMag: 0, minMoonSepDeg: null, ...o,
})

describe('scoreEntry', () => {
  it('perfect entry scores 1 with all factors 1', () => {
    const r = scoreEntry(base(), s, 0)
    expect(r.score).toBeCloseTo(1, 9)
    expect(r.breakdown).toEqual({ hours: 1, altitude: 1, fit: 1, contrast: 1, moon: 1 })
  })
  it('is 0 when totalHours = 0', () => {
    expect(scoreEntry(base({ totalHours: 0 }), s, 0).score).toBe(0)
  })
  it('hours factor is min(1, h/4)', () => {
    expect(scoreEntry(base({ totalHours: 2 }), s, 0).breakdown.hours).toBeCloseTo(0.5, 9)
    expect(scoreEntry(base({ totalHours: 8 }), s, 0).breakdown.hours).toBe(1)
  })
  it('altitude factor is 0 at 15°, rises with sin(peak) and saturates at WEIGHTS.altitudeFullDeg (50°)', () => {
    expect(scoreEntry(base({ peakAlt: 15 }), s, 0).breakdown.altitude).toBeCloseTo(0, 9)
    const sin = (d: number) => Math.sin(d * Math.PI / 180)
    expect(WEIGHTS.altitudeFullDeg).toBe(50)
    expect(scoreEntry(base({ peakAlt: 33 }), s, 0).breakdown.altitude)
      .toBeCloseTo((sin(33) - sin(15)) / (sin(50) - sin(15)), 9)
    expect(scoreEntry(base({ peakAlt: 50 }), s, 0).breakdown.altitude).toBeCloseTo(1, 9)
    expect(scoreEntry(base({ peakAlt: 75 }), s, 0).breakdown.altitude).toBe(1)
  })
  it('mosaic 2×2 scores lower than an identical good fit', () => {
    const good = scoreEntry(base(), s, 0).score
    const mosaic = scoreEntry(base({ fit: { label: 'mosaic', fill: 1.5, panels: [2, 2] } }), s, 0)
    expect(mosaic.breakdown.fit).toBeCloseTo(WEIGHTS.fit.mosaic / 2, 9)
    expect(mosaic.score).toBeLessThan(good)
  })
  it('fit factors for tight and size-unknown', () => {
    expect(scoreEntry(base({ fit: { label: 'tight', fill: 0.9, panels: null } }), s, 0).breakdown.fit).toBe(0.9)
    expect(scoreEntry(base({ fit: { label: 'size-unknown', fill: null, panels: null } }), s, 0).breakdown.fit).toBe(0.8)
  })
  it('contrast factor is 1 up to contrastFullMag, falls linearly to contrastAtLimit at the faint limit', () => {
    const c = (m: number | null) => scoreEntry(base({ contrastMag: m }), s, 0).breakdown.contrast
    expect(s.faintLimitMag).toBe(4)
    expect(c(-3)).toBe(1)
    expect(c(WEIGHTS.contrastFullMag)).toBeCloseTo(1, 9)
    expect(c(2.5)).toBeCloseTo(1 - 0.7 * 1.5 / 3, 9)    // halfway between 1.0 and 4.0 → 0.65
    expect(c(4)).toBeCloseTo(WEIGHTS.contrastAtLimit, 9)
    expect(c(6)).toBe(WEIGHTS.contrastAtLimit)
  })
  it('a bright galaxy (c ≈ 3) is no longer crushed: contrast factor ≥ 0.5 (C1)', () => {
    expect(scoreEntry(base({ contrastMag: 3.05 }), s, 0).breakdown.contrast).toBeGreaterThan(0.5)
  })
  it('unknown contrast gets WEIGHTS.unknownContrast (0.15)', () => {
    expect(WEIGHTS.unknownContrast).toBe(0.15)
    expect(scoreEntry(base({ contrastMag: null }), s, 0).breakdown.contrast).toBe(0.15)
  })
  it('small good/tight fits ramp from smallFillMin at tooSmallFill to 1 at smallFillFull', () => {
    const f = (fill: number) => scoreEntry(base({ fit: { label: 'good', fill, panels: null } }), s, 0).breakdown.fit
    expect(f(s.tooSmallFill)).toBeCloseTo(WEIGHTS.smallFillMin, 9)
    expect(f(WEIGHTS.smallFillFull)).toBeCloseTo(1, 9)
    expect(f(0.5)).toBe(1)
    const mid = (s.tooSmallFill + WEIGHTS.smallFillFull) / 2
    expect(f(mid)).toBeCloseTo((1 + WEIGHTS.smallFillMin) / 2, 9)
    expect(scoreEntry(base({ fit: { label: 'tight', fill: 0.9, panels: null } }), s, 0).breakdown.fit).toBe(0.9)
  })
  it('moon factor applies only for unknown contrast, Moon up in the best window and illum > 0.3 (R15)', () => {
    const u = (o: Partial<Omit<PlanEntry, 'score' | 'breakdown'>>) => base({ contrastMag: null, ...o })
    expect(scoreEntry(u({ minMoonSepDeg: 35 }), s, 0.8).breakdown.moon).toBeCloseTo(0.5, 9)
    expect(scoreEntry(u({ minMoonSepDeg: 5 }), s, 0.8).breakdown.moon).toBe(0.3)
    expect(scoreEntry(u({ minMoonSepDeg: 90 }), s, 0.8).breakdown.moon).toBe(1)
    expect(scoreEntry(u({ minMoonSepDeg: 35 }), s, 0.3).breakdown.moon).toBe(1)
    expect(scoreEntry(u({ minMoonSepDeg: null }), s, 0.9).breakdown.moon).toBe(1)
  })
  it('known contrast near a bright Moon gets moon factor 1 (moonlight is already in the contrast)', () => {
    const r = scoreEntry(base({ contrastMag: 2.5, minMoonSepDeg: 15 }), s, 0.95)
    expect(r.breakdown.moon).toBe(1)
    expect(r.score).toBeCloseTo(r.breakdown.contrast, 9)
  })
  it('unknown contrast near a bright Moon is penalised', () => {
    const r = scoreEntry(base({ contrastMag: null, minMoonSepDeg: 15 }), s, 0.95)
    expect(r.breakdown.moon).toBe(0.3)
    expect(r.score).toBeCloseTo(WEIGHTS.unknownContrast * 0.3, 9)
  })
  it('exposes weights in one WEIGHTS object', () => {
    expect(WEIGHTS.fit.good).toBe(1)
    expect(WEIGHTS.hoursFull).toBe(4)
  })
})
