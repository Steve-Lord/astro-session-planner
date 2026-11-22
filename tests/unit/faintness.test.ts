import { describe, expect, it } from 'vitest'
import { contrastMag, isTooFaint } from '../../src/lib/plan/faintness'
import { DEFAULT_SETTINGS, effectiveSky } from '../../src/lib/sky/brightness'
import type { EmissionClass, Target } from '../../src/lib/types'

// Spec §7.10 anchors: Bortle 6 baseline 19.3; half Moon ≈ 18.3; bright Moon ≈ 17.6.
const s = DEFAULT_SETTINGS
const tgt = (id: string, surfBr: number | null, emission: EmissionClass): Target => ({
  id, names: [id], ra: 0, dec: 0, type: 'X', majArcmin: 30, minArcmin: 30, posAngle: null,
  mag: null, surfBr, emission,
})
const verdict = (t: Target, sky: number, filter: 'none' | 'dual-band') =>
  isTooFaint(contrastMag(t, effectiveSky(sky, t.emission, filter, s)), s)

describe('contrastMag', () => {
  it('is surface brightness minus effective sky', () => {
    expect(contrastMag(tgt('a', 22.8, 'emission'), 20.8)).toBeCloseTo(2.0, 9)
  })
  it('is null when surface brightness is unknown', () => {
    expect(contrastMag(tgt('a', null, 'emission'), 20)).toBeNull()
  })
})

describe('isTooFaint', () => {
  it('null contrast is never too faint', () => {
    expect(isTooFaint(null, s)).toBe(false)
  })
  it('compares against faintLimitMag (strictly greater)', () => {
    expect(isTooFaint(s.faintLimitMag, s)).toBe(false)
    expect(isTooFaint(s.faintLimitMag + 0.01, s)).toBe(true)
  })
})

describe('faintness verdicts (spec §7.10)', () => {
  it('NGC 7000, dual-band, half Moon (18.3) → OK', () => {
    expect(verdict(tgt('NGC7000', 22.8, 'emission'), 18.3, 'dual-band')).toBe(false)
  })
  it('M101 (23.7, broadband), dual-band, half Moon (18.3) → too faint', () => {
    expect(verdict(tgt('M101', 23.7, 'broadband'), 18.3, 'dual-band')).toBe(true)
  })
  it('M101, no filter, new Moon (19.3) → OK', () => {
    expect(verdict(tgt('M101', 23.7, 'broadband'), 19.3, 'none')).toBe(false)
  })
  it('IC 1805 (24.0) and NGC 281 (23.6), dual-band, half Moon → OK', () => {
    expect(verdict(tgt('IC1805', 24.0, 'emission'), 18.3, 'dual-band')).toBe(false)
    expect(verdict(tgt('NGC0281', 23.6, 'emission'), 18.3, 'dual-band')).toBe(false)
  })
  it('NGC 2403 (23.4), bright Moon (17.6), no filter → too faint', () => {
    expect(verdict(tgt('NGC2403', 23.4, 'broadband'), 17.6, 'none')).toBe(true)
  })
})
