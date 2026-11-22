import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { contrastMag, isTooFaint } from '../../src/lib/plan/faintness'
import { DEFAULT_SETTINGS, effectiveSky } from '../../src/lib/sky/brightness'
import type { EmissionClass, Target } from '../../src/lib/types'

// Spec §7.10 anchors: Bortle 6 baseline 19.3; half Moon ≈ 18.3; bright Moon ≈ 17.6.
const s = DEFAULT_SETTINGS
const addendum = JSON.parse(readFileSync('data/addendum.json', 'utf8')) as {
  override: Record<string, { surfBr?: number }>
}
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
  it('IC 1805 and NGC 281 (addendum surfBr), dual-band, half Moon → OK', () => {
    const ic1805 = addendum.override.IC1805.surfBr!
    const ngc281 = addendum.override.NGC0281.surfBr!
    expect(ic1805).toBeGreaterThan(22)
    expect(ngc281).toBeGreaterThan(22)
    expect(verdict(tgt('IC1805', ic1805, 'emission'), 18.3, 'dual-band')).toBe(false)
    expect(verdict(tgt('NGC0281', ngc281, 'emission'), 18.3, 'dual-band')).toBe(false)
  })
  it('NGC 2403 (23.4), bright Moon (17.6), no filter → too faint', () => {
    expect(verdict(tgt('NGC2403', 23.4, 'broadband'), 17.6, 'none')).toBe(true)
  })
})
