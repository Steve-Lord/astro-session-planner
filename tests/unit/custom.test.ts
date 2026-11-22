import { describe, expect, it } from 'vitest'
import { customTarget } from '../../src/lib/catalog/custom'

const base = { id: 'custom-1', name: 'My galaxy', ra: 10, dec: 20, majArcmin: 20, minArcmin: 10, type: 'G', mag: 9 }

describe('customTarget (I2)', () => {
  it('estimates surface brightness from magnitude and size for a galaxy', () => {
    const t = customTarget(base)
    expect(t.surfBr).toBeCloseTo(9 + 2.5 * Math.log10((Math.PI / 4) * 20 * 10 * 3600), 6)
    expect(t).toMatchObject({ id: 'custom-1', names: ['My galaxy'], emission: 'broadband', posAngle: null, mag: 9 })
  })
  it('estimates for emission nebulae and sets the emission class', () => {
    const t = customTarget({ ...base, type: 'EmN' })
    expect(t.surfBr).not.toBeNull()
    expect(t.emission).toBe('emission')
  })
  it('leaves surface brightness unknown for reflection nebulae and clusters (C1 type rules)', () => {
    expect(customTarget({ ...base, type: 'RfN' }).surfBr).toBeNull()
    expect(customTarget({ ...base, type: 'OCl' }).surfBr).toBeNull()
  })
  it('leaves surface brightness unknown without a magnitude', () => {
    expect(customTarget({ ...base, mag: null }).surfBr).toBeNull()
  })
})
