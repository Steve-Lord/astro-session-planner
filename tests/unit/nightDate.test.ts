import { describe, it, expect } from 'vitest'
import { initialDate, shiftDate } from '../../src/lib/store/nightDate'
import { tonight } from '../../src/lib/astro/time'

describe('initialDate', () => {
  it('prefers the detail-hash date', () => {
    expect(initialDate('#target=M31&date=2026-11-22', '?date=2026-01-01', 'Europe/London')).toEqual({ date: '2026-11-22', picked: true })
  })
  it('falls back to ?date=', () => {
    expect(initialDate('', '?date=2026-01-01', 'Europe/London')).toEqual({ date: '2026-01-01', picked: true })
  })
  it('ignores a malformed date and uses tonight', () => {
    const r = initialDate('', '?date=junk', 'Europe/London')
    expect(r.picked).toBe(false)
    expect(r.date).toBe(tonight('Europe/London'))
  })
})

describe('shiftDate', () => {
  it('crosses month and year ends', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
  })
})
