import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { planNight } from '../../src/lib/plan/night'
import { flatProfile } from '../../src/lib/horizon/profile'
import { SEESTAR_S50_PRO } from '../../src/lib/gear/fit'
import { DEFAULT_SETTINGS } from '../../src/lib/sky/brightness'
import type { NightPlan, Site, Target } from '../../src/lib/types'

// Pins the default faintness/fit calibration against spec §7.10 known cases.
// If a case fails, check the model and data/addendum.json before changing an assertion,
// and record the reason here.
const raw = JSON.parse(readFileSync('public/catalog.json', 'utf8')) as Partial<Target>[]
const catalog = raw.map((t) => ({
  majArcmin: null, minArcmin: null, posAngle: null, mag: null, surfBr: null, ...t,
})) as Target[]

const london: Site = {
  id: 'london', name: 'London', lat: 51.5, lon: -0.13, elevation: 0,
  timezone: 'Europe/London', sky: { bortle: 6 }, horizon: flatProfile(), treesBare: false, isDefault: true,
}
const run = (date: string, filterId: string): NightPlan =>
  planNight({ site: london, gear: SEESTAR_S50_PRO, filterId, settings: DEFAULT_SETTINGS, date, catalog })
const entryIds = (p: NightPlan) => p.entries.map((e) => e.target.id)
const hiddenIds = (p: NightPlan, r: keyof NightPlan['hidden']) => p.hidden[r].map((t) => t.id)

describe('regression: London, Bortle 6, S50 Pro, 2026-11-22, dual-band', () => {
  const t0 = performance.now()
  const plan = run('2026-11-22', 'dual-band')
  const ms = performance.now() - t0

  it('has a dark window and entries sorted by score desc', () => {
    expect(plan.darkWindow).not.toBeNull()
    expect(plan.entries.length).toBeGreaterThan(0)
    for (let i = 1; i < plan.entries.length; i++) {
      expect(plan.entries[i - 1].score).toBeGreaterThanOrEqual(plan.entries[i].score)
    }
  })
  it('places every catalog target exactly once across entries and hidden lists', () => {
    const all = [...entryIds(plan), ...hiddenIds(plan, 'blocked'), ...hiddenIds(plan, 'too-small'),
      ...hiddenIds(plan, 'too-faint')]
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBe(catalog.length)
  })
  it('emission favourites NGC 7000, NGC 281, IC 1805 are recommended', () => {
    const ids = entryIds(plan)
    expect(ids).toContain('NGC7000')
    expect(ids).toContain('NGC0281')
    expect(ids).toContain('IC1805')
  })
  it('NGC 7000, NGC 281 and IC 1805 each rank in the top 40 (ruling R13)', () => {
    const top = entryIds(plan).slice(0, 40)
    expect(top).toContain('NGC7000')
    expect(top).toContain('NGC0281')
    expect(top).toContain('IC1805')
  })
  it('NGC 7000 is a mosaic', () => {
    expect(plan.entries.find((e) => e.target.id === 'NGC7000')!.fit.label).toBe('mosaic')
  })
  it('NGC 7662 (0.28′ planetary) is too small', () => {
    expect(hiddenIds(plan, 'too-small')).toContain('NGC7662')
  })
  it('runs the full catalog in under 2 s', () => {
    expect(ms).toBeLessThan(2000)
  })
})

describe('regression: London, 2026-11-24 (near full Moon), no filter', () => {
  const plan = run('2026-11-24', 'none')
  it('M33 is too faint', () => {
    expect(plan.moon.illumination).toBeGreaterThan(0.9)
    expect(hiddenIds(plan, 'too-faint')).toContain('NGC0598')
  })
})
