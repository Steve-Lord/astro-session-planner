import { describe, expect, it } from 'vitest'
import { domeFrames, initialIndex, obstructionPaths, project } from '../../src/lib/sky/dome'
import { nightSeries } from '../../src/lib/plan/series'
import { flatProfile } from '../../src/lib/horizon/profile'
import { SEESTAR_S50_PRO } from '../../src/lib/gear/fit'
import { DEFAULT_SETTINGS } from '../../src/lib/sky/brightness'
import type { Site, Target } from '../../src/lib/types'

const london: Site = {
  id: 'london', name: 'London', lat: 51.5, lon: -0.13, elevation: 0,
  timezone: 'Europe/London', sky: { bortle: 6 }, horizon: flatProfile(), treesBare: false, isDefault: true,
}
const gear = SEESTAR_S50_PRO
const settings = DEFAULT_SETTINGS
const m31: Target = {
  id: 'M31', names: ['M 31'], ra: 10.68, dec: 41.27, type: 'Gx', majArcmin: null, minArcmin: null,
  posAngle: null, mag: null, surfBr: null, emission: 'none',
}
const date = '2026-11-22'
const near = (a: { x: number; y: number }, x: number, y: number) => {
  expect(a.x).toBeCloseTo(x, 6)
  expect(a.y).toBeCloseTo(y, 6)
}

describe('project', () => {
  it('puts zenith at the centre, north up, east left', () => {
    near(project(90, 0, 100), 0, 0)
    near(project(0, 0, 100), 0, -100)
    near(project(0, 90, 100), -100, 0)
    near(project(45, 180, 100), 0, 50)
  })
})

describe('domeFrames', () => {
  it('matches nightSeries grid and altitudes', () => {
    const f = domeFrames(london, gear, settings, date, [m31])
    const s = nightSeries(london, gear, settings, date, m31)
    expect(f.times).toEqual(s.times)
    expect(Array.from(f.targets[0].alt)).toEqual(Array.from(s.alt))
    expect(Array.from(f.targets[0].az)).toEqual(Array.from(s.az))
  })

  it('usable follows the planner sample rule', () => {
    const p = flatProfile()
    for (let a = 0; a < 360; a++) p.altitudes[a] = a < 90 ? 0 : a < 270 ? 35 : 20
    const site = { ...london, horizon: p }
    const f = domeFrames(site, gear, settings, date, [m31])
    const s = nightSeries(site, gear, settings, date, m31)
    let ones = 0
    let zeros = 0
    for (let i = 0; i < s.times.length; i++) {
      const alt = s.alt[i]
      const want = alt >= gear.minAltDeg && alt <= gear.maxAltDeg && alt >= s.needed[i]
      expect(f.targets[0].usable[i]).toBe(want ? 1 : 0)
      if (want) ones++; else zeros++
    }
    expect(ones).toBeGreaterThan(0)
    expect(zeros).toBeGreaterThan(0)
  })

  it('sun, moon and stars cover every step', () => {
    const f = domeFrames(london, gear, settings, date, [m31])
    const n = f.times.length
    expect(f.sunAlt.length).toBe(n)
    expect(f.moonAlt.length).toBe(n)
    expect(f.moonAz.length).toBe(n)
    expect(f.moonIllum.length).toBe(n)
    expect(f.moonIllum[0]).toBeGreaterThanOrEqual(0)
    expect(f.moonIllum[0]).toBeLessThanOrEqual(1)
    expect(f.stars.length).toBeGreaterThan(0)
    expect(f.stars[0].alt.length).toBe(n)
    expect(f.sunAlt[0]).toBeLessThan(1)
  })

  it('handles an empty target list with no dark window', () => {
    const oslo: Site = { ...london, lat: 60, lon: 10.75, timezone: 'Europe/Oslo' }
    const f = domeFrames(oslo, gear, settings, '2026-06-21', [])
    expect(f.dark).toBeNull()
    expect(f.times.length).toBeGreaterThan(0)
    expect(f.targets).toEqual([])
    for (let i = 0; i < f.times.length; i++) expect(f.sunAlt[i]).toBeGreaterThan(-12)
  })
})

describe('obstructionPaths', () => {
  it('is empty without a profile', () => {
    expect(obstructionPaths(null, false, 100)).toEqual({ roof: '', trees: '' })
  })

  it('splits seasonal degrees into trees', () => {
    const p = flatProfile()
    for (let a = 0; a < 360; a++) p.altitudes[a] = 20
    expect(obstructionPaths(p, false, 100).trees).toBe('')
    expect(obstructionPaths(p, false, 100).roof).not.toBe('')
    for (let a = 90; a <= 120; a++) { p.seasonal[a] = true; p.leafOffAltitudes[a] = 5 }
    const o = obstructionPaths(p, false, 100)
    expect(o.trees).not.toBe('')
    expect(o.roof).not.toBe('')
    expect(obstructionPaths(p, true, 100).trees).not.toBe(o.trees)
  })
})

describe('initialIndex', () => {
  const times = [0, 10, 20, 30, 40, 50].map((m) => 1_000_000_000 + m * 60000)
  const dark = { start: times[2] + 1, end: times[4] }
  it('picks the nearest step inside the span', () => {
    expect(initialIndex(times, times[3] + 2 * 60000, dark)).toBe(3)
    expect(initialIndex(times, times[3] + 6 * 60000, dark)).toBe(4)
  })
  it('falls back to the dark start, then 0', () => {
    expect(initialIndex(times, times[0] - 86400000, dark)).toBe(3)
    expect(initialIndex(times, times[0] - 86400000, null)).toBe(0)
  })
})
