import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildContext, neverRises, visibility } from '../../src/lib/plan/visibility'
import { altAz, lstDeg, precessToDate } from '../../src/lib/astro/positions'
import { flatProfile, setRange } from '../../src/lib/horizon/profile'
import { SEESTAR_S50_PRO } from '../../src/lib/gear/fit'
import { DEFAULT_SETTINGS } from '../../src/lib/sky/brightness'
import { fromZonedTime } from 'date-fns-tz'
import type { Site, Target } from '../../src/lib/types'

const london: Site = {
  id: 'london', name: 'London', lat: 51.5, lon: -0.13, elevation: 0,
  timezone: 'Europe/London', sky: { bortle: 6 }, horizon: flatProfile(), treesBare: false, isDefault: true,
}
const gear = SEESTAR_S50_PRO
const settings = DEFAULT_SETTINGS
const tgt = (id: string, ra: number, dec: number): Target => ({
  id, names: [id], ra, dec, type: 'Neb', majArcmin: null, minArcmin: null, posAngle: null,
  mag: null, surfBr: null, emission: 'emission',
})

describe('buildContext', () => {
  it('falls back to nautical at midsummer', () => {
    const r = buildContext(london, gear, settings, '2026-06-21')
    expect(r.noAstroDark).toBe(true)
    expect(r.darkSunAltUsed).toBe(-12)
    expect(r.ctx).not.toBeNull()
  })
  it('uses astronomical dark in winter', () => {
    const r = buildContext(london, gear, settings, '2026-12-21')
    expect(r.noAstroDark).toBe(false)
    expect(r.darkSunAltUsed).toBe(-18)
    expect(r.ctx!.times.length).toBe(r.ctx!.moon.length)
  })
})

describe('visibility', () => {
  const { ctx } = buildContext(london, gear, settings, '2026-12-21')

  it('circumpolar target has one window spanning the dark period', () => {
    const v = visibility(tgt('circ', 0, 72), ctx!)
    expect(v.windows.length).toBe(1)
    expect(Math.abs(v.windows[0].start - ctx!.dark.start)).toBeLessThanOrEqual(5 * 60000)
    expect(Math.abs(v.windows[0].end - ctx!.dark.end)).toBeLessThanOrEqual(5 * 60000)
    expect(v.best).toEqual(v.windows[0])
    expect(v.peakAlt).toBeGreaterThan(60)
  })

  it('a horizon obstruction splits the run in two', () => {
    const m42 = tgt('M42', 83.82, -5.39)
    const t23 = fromZonedTime('2026-12-21T23:00:00', 'Europe/London').getTime()
    const p = precessToDate(m42.ra, m42.dec, t23)
    const az = altAz(p.ra, p.dec, london.lat, lstDeg(t23, london.lon)).az
    const blocked: Site = { ...london, horizon: setRange(flatProfile(), az - 5, az + 5, 60) }
    const { ctx: c2 } = buildContext(blocked, gear, settings, '2026-12-21')
    const v = visibility(m42, c2!)
    expect(v.windows.length).toBe(2)
    const sum = v.windows.reduce((s, w) => s + (w.end - w.start), 0) / 3600000
    expect(v.totalHours).toBeCloseTo(sum, 9)
  })

  it('neverRises for far-south declinations', () => {
    expect(neverRises(tgt('s', 10, -60), 51.5, 15)).toBe(true)
    expect(neverRises(tgt('n', 10, 40), 51.5, 15)).toBe(false)
  })

  it('processes the whole catalog in under 2000 ms', () => {
    const raw = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Partial<Target>[]
    const cat = raw.map((t) => ({
      majArcmin: null, minArcmin: null, posAngle: null, mag: null, surfBr: null, ...t,
    })) as Target[]
    const t0 = performance.now()
    let sink = 0
    for (const t of cat) sink += visibility(t, ctx!).totalHours
    const ms = performance.now() - t0
    console.log(`catalog ${cat.length} targets in ${ms.toFixed(0)} ms (${sink.toFixed(0)} h)`)
    expect(ms).toBeLessThan(2000)
  })
})
