import { describe, expect, it } from 'vitest'
import { nightSeries } from '../../src/lib/plan/series'
import { buildContext, pickDarkWindow, visibility } from '../../src/lib/plan/visibility'
import { darkWindow, nightBounds } from '../../src/lib/astro/time'
import { flatProfile, heightAt } from '../../src/lib/horizon/profile'
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
const ngc7000: Target = {
  id: 'NGC7000', names: ['NGC 7000'], ra: 314.7, dec: 44.3, type: 'Neb', majArcmin: null, minArcmin: null,
  posAngle: null, mag: null, surfBr: null, emission: 'emission',
}
const date = '2026-11-22'
const at = (hm: string) => fromZonedTime(`${date}T${hm}:00`, 'Europe/London').getTime()

describe('nightSeries', () => {
  it('span runs sunset to sunrise', () => {
    const s = nightSeries(london, gear, settings, date, ngc7000)
    expect(s.span.start).toBeGreaterThanOrEqual(at('16:00'))
    expect(s.span.start).toBeLessThanOrEqual(at('16:10'))
    const nextMorning = fromZonedTime('2026-11-23T07:30:00', 'Europe/London').getTime()
    expect(s.span.end).toBeGreaterThanOrEqual(nextMorning)
    expect(s.span.end).toBeLessThanOrEqual(nextMorning + 30 * 60000)
    expect(s.twilight.astro).toEqual(darkWindow(london, date, -18))
    expect(s.twilight.civil!.start).toBeGreaterThan(s.span.start)
    expect(s.twilight.nautical!.start).toBeGreaterThan(s.twilight.civil!.start)
    expect(s.twilight.astro!.start).toBeGreaterThan(s.twilight.nautical!.start)
  })

  it('target samples agree with visibility', () => {
    const s = nightSeries(london, gear, settings, date, ngc7000)
    const { ctx } = buildContext(london, gear, settings, date)
    const v = visibility(ngc7000, ctx!)
    let common = 0
    ctx!.times.forEach((t, j) => {
      const i = s.times.indexOf(t)
      if (i < 0) return
      common++
      expect(Math.abs(s.alt[i] - v.alts[j])).toBeLessThan(1e-6)
    })
    expect(common).toBe(ctx!.times.length)
    expect(s.times[0]).toBeGreaterThanOrEqual(s.span.start)
    expect(s.times[s.times.length - 1]).toBeLessThanOrEqual(s.span.end)
    expect(s.times[0] - s.span.start).toBeLessThan(5 * 60000)
    expect(s.span.end - s.times[s.times.length - 1]).toBeLessThan(5 * 60000)
  })

  it('horizon and needed', () => {
    const p = flatProfile()
    for (let a = 0; a < 360; a++) p.altitudes[a] = a < 90 ? 0 : a < 270 ? 35 : 20
    const site = { ...london, horizon: p }
    const s = nightSeries(site, gear, settings, date, ngc7000)
    for (let i = 0; i < s.times.length; i++) {
      expect(s.horizon[i]).toBeCloseTo(heightAt(p, s.az[i], false), 2)
      expect(s.needed[i]).toBeGreaterThanOrEqual(s.horizon[i] + settings.clearanceDeg - 1e-4)
    }
  })

  it('moonSep is NaN exactly while the Moon is down', () => {
    const s = nightSeries(london, gear, settings, date, ngc7000)
    let up = 0
    let down = 0
    for (let i = 0; i < s.times.length; i++) {
      if (s.moonAlt[i] > 0) { up++; expect(Number.isNaN(s.moonSep[i])).toBe(false) }
      else { down++; expect(Number.isNaN(s.moonSep[i])).toBe(true) }
    }
    expect(up + down).toBe(s.times.length)
    expect(s.moonIllum).toBeGreaterThanOrEqual(0)
    expect(s.moonIllum).toBeLessThanOrEqual(1)
  })

  it('no sunset: span is nightBounds and no astro twilight', () => {
    const arctic = { ...london, lat: 70, lon: 25, timezone: 'Europe/Oslo' }
    const s = nightSeries(arctic, gear, settings, '2026-06-21', ngc7000)
    expect(s.span).toEqual(nightBounds('2026-06-21', 'Europe/Oslo'))
    expect(s.twilight.astro).toBeNull()
    expect(s.times[0]).toBe(s.span.start)
    expect(s.times.length).toBeGreaterThan(200)
  })
})

describe('pickDarkWindow', () => {
  it('matches buildContext and feeds series.dark', () => {
    const r = pickDarkWindow(london, date, settings)
    const b = buildContext(london, gear, settings, date)
    expect(r.dark).toEqual(b.ctx!.dark)
    expect(r.darkSunAltUsed).toBe(b.darkSunAltUsed)
    expect(r.noAstroDark).toBe(b.noAstroDark)
    expect(r.dark).toEqual(darkWindow(london, date, -18))
    expect(nightSeries(london, gear, settings, date, ngc7000).dark).toEqual(r.dark)
  })

  it('falls back to -12 with no astronomical darkness', () => {
    const north = london  // London in June: Sun bottoms out near -15°
    const r = pickDarkWindow(north, '2026-06-21', settings)
    expect(r.noAstroDark).toBe(true)
    expect(r.darkSunAltUsed).toBe(-12)
    expect(r.dark).toEqual(darkWindow(north, '2026-06-21', -12))
    expect(nightSeries(north, gear, settings, '2026-06-21', ngc7000).dark).toEqual(r.dark)
  })
})
