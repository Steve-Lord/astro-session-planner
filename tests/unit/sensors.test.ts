import { afterEach, describe, expect, it, vi } from 'vitest'
import { magneticAzimuth, now } from '../../src/lib/sweep/sensors'

const fresh = () => ({ k: null as number | null, samples: 0 })

describe('magneticAzimuth (Ruling P1)', () => {
  it('iOS upright: uses webkitCompassHeading and learns the offset k', () => {
    const r = magneticAzimuth({ platform: 'ios', azRel: 10, beta: 85, compassHeading: 50, absolute: false }, fresh())
    expect(r.azMag).toBeCloseTo(50, 9)
    expect(r.state.k).toBeCloseTo(40, 9)
    expect(r.state.samples).toBe(1)
  })
  it('iOS upright: k is a running circular mean across the 0/360 seam', () => {
    let st = fresh()
    st = magneticAzimuth({ platform: 'ios', azRel: 0, beta: 90, compassHeading: 350, absolute: false }, st).state
    st = magneticAzimuth({ platform: 'ios', azRel: 0, beta: 90, compassHeading: 10, absolute: false }, st).state
    expect(Math.min(Math.abs(st.k!), Math.abs(st.k! - 360))).toBeLessThan(1e-9)
    expect(st.samples).toBe(2)
  })
  it('iOS tilted beyond 50° from upright: azRel + k, k unchanged', () => {
    const st = { k: 40, samples: 5 }
    const r = magneticAzimuth({ platform: 'ios', azRel: 330, beta: 20, compassHeading: 123, absolute: false }, st)
    expect(r.azMag).toBeCloseTo(10, 9)
    expect(r.state).toEqual(st)
  })
  it('iOS tilted with no offset learned yet: null', () => {
    const r = magneticAzimuth({ platform: 'ios', azRel: 330, beta: 150, compassHeading: 123, absolute: false }, fresh())
    expect(r.azMag).toBeNull()
  })
  it('Android absolute: azRel is already north-referenced', () => {
    const r = magneticAzimuth({ platform: 'android', azRel: 271.5, beta: 90, compassHeading: null, absolute: true }, fresh())
    expect(r.azMag).toBeCloseTo(271.5, 9)
  })
  it('non-absolute readings with no compass: null', () => {
    expect(magneticAzimuth({ platform: 'android', azRel: 10, beta: 90, compassHeading: null, absolute: false }, fresh()).azMag).toBeNull()
    expect(magneticAzimuth({ platform: 'other', azRel: 10, beta: 90, compassHeading: null, absolute: false }, fresh()).azMag).toBeNull()
  })
})

describe('now() (R2 test clock)', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('returns window.__testNow when it is a number', () => {
    vi.stubGlobal('window', { __testNow: Date.UTC(2026, 5, 1, 12) })
    expect(now().toISOString()).toBe('2026-06-01T12:00:00.000Z')
  })
  it('otherwise returns the current time', () => {
    vi.stubGlobal('window', { __testNow: 'nope' })
    const before = Date.now()
    const t = now().getTime()
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(Date.now())
  })
})
