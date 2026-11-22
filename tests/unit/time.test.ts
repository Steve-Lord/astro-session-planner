import { describe, expect, it } from 'vitest'
import { darkWindow, formatLocal, nightBounds, tonight } from '../../src/lib/astro/time'
import type { Site } from '../../src/lib/types'

const london: Site = {
  id: 'london', name: 'London', lat: 51.5, lon: -0.13, elevation: 0,
  timezone: 'Europe/London', sky: {}, horizon: null, treesBare: false, isDefault: true,
}

describe('darkWindow', () => {
  it('London winter solstice astronomical night', () => {
    const w = darkWindow(london, '2026-12-21', -18)
    expect(w).not.toBeNull()
    const start = new Date('2026-12-21T18:00:00Z').getTime()
    const end = new Date('2026-12-22T06:00:00Z').getTime()
    expect(Math.abs(w!.start - start)).toBeLessThan(10 * 60000)
    expect(Math.abs(w!.end - end)).toBeLessThan(10 * 60000)
  })
  it('London midsummer has no astronomical night but has nautical', () => {
    expect(darkWindow(london, '2026-06-21', -18)).toBeNull()
    expect(darkWindow(london, '2026-06-21', -12)).not.toBeNull()
  })
})

describe('nightBounds / formatLocal', () => {
  it('spans 25 h across the DST end', () => {
    const b = nightBounds('2026-10-24', 'Europe/London')
    expect(b.end - b.start).toBe(90_000_000)
    expect(formatLocal(b.start, 'Europe/London')).toBe('12:00')
    expect(formatLocal(b.end, 'Europe/London')).toBe('12:00')
  })
})

describe('tonight', () => {
  it('before local noon counts as previous date', () => {
    expect(tonight('Europe/London', new Date('2026-11-23T09:00:00Z'))).toBe('2026-11-22')
    expect(tonight('Europe/London', new Date('2026-11-23T13:00:00Z'))).toBe('2026-11-23')
  })
})
