import { describe, it, expect } from 'vitest'
import { detailHash, parseDetailHash } from '../../src/lib/detailHash'

describe('detailHash', () => {
  it('round-trips id and date', () => {
    expect(parseDetailHash(detailHash('custom:a b', '2026-11-22'))).toEqual({ id: 'custom:a b', date: '2026-11-22' })
  })
  it('has null date when absent', () => {
    expect(parseDetailHash('#target=NGC7000')).toEqual({ id: 'NGC7000', date: null })
  })
  it('has null date when malformed', () => {
    expect(parseDetailHash('#target=NGC7000&date=bad')).toEqual({ id: 'NGC7000', date: null })
  })
  it('is null for other hashes', () => {
    expect(parseDetailHash('#tonight')).toBeNull()
    expect(parseDetailHash('')).toBeNull()
  })
})
