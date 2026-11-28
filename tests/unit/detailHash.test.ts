import { describe, it, expect } from 'vitest'
import { initialDate } from '../../src/lib/store/nightDate'
import { detailHash, parseDetailHash } from '../../src/lib/detailHash'

describe('detailHash', () => {
  it('round-trips id and date', () => {
    expect(parseDetailHash(detailHash('custom:a b', '2026-11-22'))).toEqual({ id: 'custom:a b', date: '2026-11-22', from: null })
  })
  it('has null date when absent', () => {
    expect(parseDetailHash('#target=NGC7000')).toEqual({ id: 'NGC7000', date: null, from: null })
  })
  it('has null date when malformed', () => {
    expect(parseDetailHash('#target=NGC7000&date=bad')).toEqual({ id: 'NGC7000', date: null, from: null })
  })
  it('is null for other hashes', () => {
    expect(parseDetailHash('#tonight')).toBeNull()
    expect(parseDetailHash('')).toBeNull()
  })
  it('marks a detail opened from the Sky tab', () => {
    expect(detailHash('M31', '2026-11-22', 'sky')).toBe('#target=M31&date=2026-11-22&from=sky')
    expect(parseDetailHash('#target=M31&date=2026-11-22&from=sky')?.from).toBe('sky')
    expect(parseDetailHash('#target=M31&date=2026-11-22')?.from).toBeNull()
    expect(detailHash('M31', '2026-11-22')).toBe('#target=M31&date=2026-11-22')
  })
  it('initialDate still reads the date with from=sky', () => {
    expect(initialDate('#target=M31&date=2026-11-22&from=sky', '', 'Europe/London').date).toBe('2026-11-22')
  })
})
