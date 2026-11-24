import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { explainTarget, planNight } from '../../src/lib/plan/night'
import { buildContext, visibility } from '../../src/lib/plan/visibility'
import { altAz, precessToDate } from '../../src/lib/astro/positions'
import { flatProfile } from '../../src/lib/horizon/profile'
import { SEESTAR_S50_PRO } from '../../src/lib/gear/fit'
import { DEFAULT_SETTINGS } from '../../src/lib/sky/brightness'
import type { Site, Target } from '../../src/lib/types'

const raw = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Partial<Target>[]
const catalog = raw.map((t) => ({
  majArcmin: null, minArcmin: null, posAngle: null, mag: null, surfBr: null, ...t,
})) as Target[]
const byId = (id: string) => catalog.find((t) => t.id === id)!

const london: Site = {
  id: 'london', name: 'London', lat: 51.5, lon: -0.13, elevation: 0,
  timezone: 'Europe/London', sky: { bortle: 6 }, horizon: flatProfile(), treesBare: false, isDefault: true,
}
const base = { gear: SEESTAR_S50_PRO, filterId: 'dual-band', settings: DEFAULT_SETTINGS, date: '2026-11-22' }
const input = { site: london, ...base }

describe('explainTarget', () => {
  const plan = planNight({ ...input, catalog })

  it('matches planNight for every shown entry and hidden target', () => {
    for (const e of plan.entries) {
      expect(explainTarget(input, e.target)).toEqual({ kind: 'entry', entry: e })
    }
    for (const r of ['blocked', 'too-small', 'too-faint'] as const) {
      for (const t of plan.hidden[r].filter((_, i) => i % 7 === 0)) { // each call rebuilds the night context
        const v = explainTarget(input, t)
        expect(v.kind).toBe('hidden')
        if (v.kind === 'hidden') expect(v.reason).toBe(r)
      }
    }
  }, 60_000)

  describe('causes', () => {
    it('never-rises', () => {
      expect(explainTarget(input, byId('NGC0104'))).toMatchObject({ kind: 'hidden', reason: 'blocked', cause: 'never-rises' })
    })
    it('too-small carries the fill', () => {
      const v = explainTarget(input, byId('NGC7662'))
      expect(v).toMatchObject({ kind: 'hidden', reason: 'too-small', cause: 'too-small' })
      if (v.kind === 'hidden') expect(v.fill).toBeCloseTo(0.28 / 147.3, 2)
    })
    it('never-clears under a horizon flat at 89 degrees', () => {
      const wall = flatProfile()
      wall.altitudes.fill(89)
      const v = explainTarget({ ...input, site: { ...london, horizon: wall } }, byId('NGC7000'))
      expect(v).toMatchObject({ kind: 'hidden', reason: 'blocked', cause: 'never-clears' })
    })
    it('no-dark at Oslo on midsummer night', () => {
      const oslo: Site = { ...london, id: 'oslo', lat: 60, lon: 10.7, timezone: 'Europe/Oslo' }
      expect(explainTarget({ ...input, site: oslo, date: '2026-06-21' }, byId('NGC7000'))).toEqual({
        kind: 'hidden', reason: 'blocked', cause: 'no-dark', fill: null, contrastMag: null,
      })
    })
    it('short-gaps when only a brief notch of sky is open', () => {
      // Open a narrow azimuth notch around where NGC 7000 is at one instant of the night.
      const { ctx } = buildContext(london, base.gear, base.settings, base.date)
      const t = byId('NGC7000')
      const p = precessToDate(t.ra, t.dec, (ctx!.dark.start + ctx!.dark.end) / 2)
      const i = Math.floor(ctx!.times.length / 4)
      const az = altAz(p.ra, p.dec, london.lat, ctx!.lst[i]).az
      const notch = flatProfile()
      notch.altitudes.fill(89)
      const half = 3
      for (let d = -half; d <= half; d++) notch.altitudes[(Math.round(az) + d + 360) % 360] = 0
      const site = { ...london, horizon: notch }
      const v = explainTarget({ ...input, site }, t)
      expect(v).toMatchObject({ kind: 'hidden', reason: 'blocked', cause: 'short-gaps' })
      const { ctx: c2 } = buildContext(site, base.gear, base.settings, base.date)
      const vis = visibility(t, c2!)
      expect(vis.best).toBeNull()
      expect(vis.usable.some((u) => u === 1)).toBe(true)
    })
    it('too-faint carries the contrast', () => {
      const first = plan.hidden['too-faint'][0]
      const v = explainTarget(input, first)
      expect(v).toMatchObject({ kind: 'hidden', reason: 'too-faint', cause: 'too-faint' })
      if (v.kind === 'hidden') expect(Number.isFinite(v.contrastMag)).toBe(true)
    })
  })
})
