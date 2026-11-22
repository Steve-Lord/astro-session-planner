import { describe, expect, it } from 'vitest'
import * as A from 'astronomy-engine'
import {
  altAz, lstDeg, moonAltAz, moonIllumination, moonRaDec, moonRiseSet, precessToDate, sunAltAz,
} from '../../src/lib/astro/positions'
import type { Site } from '../../src/lib/types'

const london: Site = {
  id: 'london', name: 'London', lat: 51.5, lon: -0.13, elevation: 0,
  timezone: 'Europe/London', sky: {}, horizon: null, treesBare: false, isDefault: true,
}

describe('altAz', () => {
  it('Polaris stays near altitude = latitude, azimuth ~north', () => {
    for (let h = 0; h < 24; h += 3) {
      const t = Date.UTC(2026, 10, 22, h)
      const p = precessToDate(37.954, 89.264, t)
      const r = altAz(p.ra, p.dec, 52, lstDeg(t, 0))
      expect(Math.abs(r.alt - 52)).toBeLessThan(1.0)
      const dAz = Math.min(r.az, 360 - r.az)
      expect(dAz).toBeLessThan(1.5)
    }
  })

  it('matches astronomy-engine Horizon for M31', () => {
    const ra = 10.6847, dec = 41.2687
    const obs = new A.Observer(london.lat, london.lon, 0)
    let checked = 0
    let seed = 12345
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
    for (let i = 0; i < 40 && checked < 10; i++) {
      const t = Date.UTC(2026, 0, 1) + rnd() * 365 * 86400000
      const p = precessToDate(ra, dec, t)
      const mine = altAz(p.ra, p.dec, london.lat, lstDeg(t, london.lon))
      const ref = A.Horizon(new Date(t), obs, p.ra / 15, p.dec, undefined)
      if (ref.altitude <= 5) continue
      checked++
      expect(Math.abs(mine.alt - ref.altitude)).toBeLessThan(0.05)
      expect(Math.abs(mine.az - ref.azimuth)).toBeLessThan(0.1)
    }
    expect(checked).toBe(10)
  })
})

describe('moon', () => {
  it('illumination > 0.99 at full Moon', () => {
    const full = A.SearchMoonPhase(180, new Date('2026-11-20T00:00:00Z'), 10)!
    expect(moonIllumination(full.date.getTime())).toBeGreaterThan(0.99)
  })
  it('new Moon is nearly unilluminated', () => {
    const nm = A.SearchMoonPhase(0, new Date('2026-11-20T00:00:00Z'), 30)!
    expect(moonIllumination(nm.date.getTime())).toBeLessThan(0.01)
  })
  it('positions are sane', () => {
    const t = Date.UTC(2026, 10, 24, 22)
    const m = moonAltAz(t, london)
    expect(m.alt).toBeGreaterThan(-90)
    expect(m.alt).toBeLessThan(90)
    const rd = moonRaDec(t)
    expect(rd.ra).toBeGreaterThanOrEqual(0)
    expect(rd.ra).toBeLessThan(360)
    const s = sunAltAz(Date.UTC(2026, 5, 21, 11), london)
    expect(s.alt).toBeGreaterThan(50)
  })
  it('rise/set within a day window', () => {
    const start = Date.UTC(2026, 10, 22, 12)
    const r = moonRiseSet(london, { start, end: start + 86400000 })
    for (const v of [r.rise, r.set]) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(start)
        expect(v).toBeLessThanOrEqual(start + 86400000)
      }
    }
    expect(r.rise !== null || r.set !== null).toBe(true)
  })
})
