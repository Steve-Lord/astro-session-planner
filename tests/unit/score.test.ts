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
  it('altitude factor is 0 at 15° and rises with sin(peak)', () => {
    expect(scoreEntry(base({ peakAlt: 15 }), s, 0).breakdown.altitude).toBeCloseTo(0, 9)
    const sin15 = Math.sin(15 * Math.PI / 180)
    expect(scoreEntry(base({ peakAlt: 45 }), s, 0).breakdown.altitude)
      .toBeCloseTo((Math.sin(Math.PI / 4) - sin15) / (1 - sin15), 9)
  })
  it('mosaic 2×2 scores lower than an identical good fit', () => {
    const good = scoreEntry(base(), s, 0).score
    const mosaic = scoreEntry(base({ fit: { label: 'mosaic', fill: 1.5, panels: [2, 2] } }), s, 0)
    expect(mosaic.breakdown.fit).toBeCloseTo(0.7 / 2, 9)
    expect(mosaic.score).toBeLessThan(good)
  })
  it('fit factors for tight and size-unknown', () => {
    expect(scoreEntry(base({ fit: { label: 'tight', fill: 0.9, panels: null } }), s, 0).breakdown.fit).toBe(0.9)
    expect(scoreEntry(base({ fit: { label: 'size-unknown', fill: null, panels: null } }), s, 0).breakdown.fit).toBe(0.8)
  })
  it('contrast factor is clamped to [0.1, 1] and WEIGHTS.unknownContrast (0.3) when null', () => {
    expect(scoreEntry(base({ contrastMag: 2.5 }), s, 0).breakdown.contrast).toBeCloseTo(0.5, 9)
    expect(scoreEntry(base({ contrastMag: 4.9 }), s, 0).breakdown.contrast).toBeCloseTo(0.1, 9)
    expect(scoreEntry(base({ contrastMag: -3 }), s, 0).breakdown.contrast).toBe(1)
    expect(WEIGHTS.unknownContrast).toBe(0.3)
    expect(scoreEntry(base({ contrastMag: null }), s, 0).breakdown.contrast).toBe(0.3)
  })
  it('moon factor applies only when the Moon is up in the best window and illum > 0.3', () => {
    expect(scoreEntry(base({ minMoonSepDeg: 35 }), s, 0.8).breakdown.moon).toBeCloseTo(0.5, 9)
    expect(scoreEntry(base({ minMoonSepDeg: 5 }), s, 0.8).breakdown.moon).toBe(0.3)
    expect(scoreEntry(base({ minMoonSepDeg: 90 }), s, 0.8).breakdown.moon).toBe(1)
    expect(scoreEntry(base({ minMoonSepDeg: 35 }), s, 0.3).breakdown.moon).toBe(1)
    expect(scoreEntry(base({ minMoonSepDeg: null }), s, 0.9).breakdown.moon).toBe(1)
  })
  it('exposes weights in one WEIGHTS object', () => {
    expect(WEIGHTS.fit.good).toBe(1)
    expect(WEIGHTS.hoursFull).toBe(4)
  })
})
