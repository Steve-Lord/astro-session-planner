import { describe, expect, it } from 'vitest'
import { commonName } from '../../src/lib/catalog/names'

describe('commonName (M1)', () => {
  it('skips catalogue designations including Messier numbers', () => {
    expect(commonName(['NGC 224', 'M 31', 'Andromeda Galaxy'])).toBe('Andromeda Galaxy')
    expect(commonName(['NGC 1952', 'M1', 'Crab Nebula'])).toBe('Crab Nebula')
    expect(commonName(['Sh2-155', 'IC 1', '2MASX J0', 'Cave Nebula'])).toBe('Cave Nebula')
  })
  it('keeps names that merely start with M', () => {
    expect(commonName(['NGC 2174', 'Monkey Head Nebula'])).toBe('Monkey Head Nebula')
    expect(commonName(['IC 443', 'Medusa'])).toBe('Medusa')
    expect(commonName(['NGC 4676', 'Mice Galaxies'])).toBe('Mice Galaxies')
  })
  it('is undefined when there is none', () => {
    expect(commonName(['NGC 1', 'M 2'])).toBeUndefined()
  })
})
