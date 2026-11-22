import { describe, expect, it } from 'vitest'
import { estimateSurfBr, isGalaxyType } from '../../src/lib/catalog/surfaceBrightness'

const formula = (mag: number, maj: number, min: number) => mag + 2.5 * Math.log10((Math.PI / 4) * maj * min * 3600)

describe('estimateSurfBr', () => {
  it('estimates mean surface brightness over the ellipse for types whose magnitude is the object itself', () => {
    for (const type of ['G', 'GPair', 'GTrpl', 'GGroup', 'PN', 'HII', 'EmN', 'SNR']) {
      expect(estimateSurfBr(type, 8, 20, 10)).toBeCloseTo(formula(8, 20, 10), 6)
    }
  })
  it('returns null where the catalogued magnitude is an illuminating star or cluster (C1)', () => {
    for (const type of ['Cl+N', 'RfN', 'Neb', 'OCl', 'GCl']) expect(estimateSurfBr(type, 7, 10, 10)).toBeNull()
  })
  it('returns null for unknown types', () => {
    expect(estimateSurfBr('*', 7, 10, 10)).toBeNull()
  })
  it('needs magnitude and a positive size', () => {
    expect(estimateSurfBr('G', null, 10, 10)).toBeNull()
    expect(estimateSurfBr('G', 8, null, 10)).toBeNull()
    expect(estimateSurfBr('G', 8, 10, null)).toBeNull()
    expect(estimateSurfBr('G', 8, 0, 10)).toBeNull()
    expect(estimateSurfBr('G', Number.NaN, 10, 10)).toBeNull()
  })
})

describe('isGalaxyType', () => {
  it('recognises the OpenNGC galaxy types only', () => {
    expect(['G', 'GPair', 'GTrpl', 'GGroup'].every(isGalaxyType)).toBe(true)
    expect(['HII', 'PN', 'OCl', 'RfN'].some(isGalaxyType)).toBe(false)
  })
})
