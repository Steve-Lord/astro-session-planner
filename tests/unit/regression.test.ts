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
  it('(d) M101 and NGC 2403 are too faint under a bright Moon', () => {
    expect(hiddenIds(plan, 'too-faint')).toContain('NGC5457')
    expect(hiddenIds(plan, 'too-faint')).toContain('NGC2403')
  })
  it('N1: M42 (core-weighted surface brightness) survives the full Moon with no filter', () => {
    expect(hiddenIds(plan, 'too-faint')).not.toContain('NGC1976')
    expect(entryIds(plan)).toContain('NGC1976')
  })
  it('broadband-faint emission (Heart, Pacman) is too faint with no filter at full Moon', () => {
    expect(hiddenIds(plan, 'too-faint')).toContain('IC1805')
    expect(hiddenIds(plan, 'too-faint')).toContain('NGC0281')
  })
})

// C1 (final review): the top of the shortlist must be trustworthy on real data.
const rank = (p: NightPlan, id: string) => entryIds(p).indexOf(id) + 1   // 0 = not in entries
const top = (p: NightPlan, n: number) => p.entries.slice(0, n)

describe('regression (a): London, 2026-12-09 (new Moon), no filter', () => {
  const plan = run('2026-12-09', 'none')
  it('is a new-Moon night', () => {
    expect(plan.moon.illumination).toBeLessThan(0.05)
  })
  it('M31, M33 and M42 are in the top 20', () => {
    const ids = top(plan, 20).map((e) => e.target.id)
    expect(ids).toContain('NGC0224')
    expect(ids).toContain('NGC0598')
    expect(ids).toContain('NGC1976')
  })
  it('IC 444 (obscure reflection nebula) is not #1 and not in the top 20', () => {
    expect(plan.entries[0].target.id).not.toBe('IC0444')
    expect(top(plan, 20).map((e) => e.target.id)).not.toContain('IC0444')
  })
  it('(d) M101 and NGC 2403 are recommended (not too faint)', () => {
    expect(rank(plan, 'NGC5457')).toBeGreaterThan(0)
    expect(rank(plan, 'NGC2403')).toBeGreaterThan(0)
  })
  it('M81 and M51 are in the top 20', () => {
    const ids = top(plan, 20).map((e) => e.target.id)
    expect(ids).toContain('NGC3031')
    expect(ids).toContain('NGC5194')
  })
  it('every top-20 entry has a known surface brightness', () => {
    for (const e of top(plan, 20)) expect(e.contrastMag, e.target.id).not.toBeNull()
  })
  it('M31 is flagged as a mosaic', () => {
    expect(plan.entries.find((e) => e.target.id === 'NGC0224')!.fit.label).toBe('mosaic')
  })
  it('planetaries under ~1.5′ (M57, Cat\'s Eye) are too small', () => {
    expect(hiddenIds(plan, 'too-small')).toContain('NGC6720')
    expect(hiddenIds(plan, 'too-small')).toContain('NGC6543')
  })
})

describe('regression (b): London, 2026-11-22 (96% Moon), no filter', () => {
  const plan = run('2026-11-22', 'none')
  it('is a bright-Moon night', () => {
    expect(plan.moon.illumination).toBeGreaterThan(0.9)
  })
  it('no reflection nebula in the top 10', () => {
    for (const e of top(plan, 10)) expect(e.target.type, e.target.id).not.toBe('RfN')
  })
  it('the Iris Nebula (reflection) is too faint', () => {
    expect(hiddenIds(plan, 'too-faint')).toContain('NGC7023')
  })
})

describe('regression (c): London, 2026-11-17 (half Moon), dual-band', () => {
  const plan = run('2026-11-17', 'dual-band')
  it('is a roughly half-Moon night', () => {
    expect(plan.moon.illumination).toBeGreaterThan(0.4)
    expect(plan.moon.illumination).toBeLessThan(0.7)
  })
  it('NGC 7000, IC 1805 and NGC 281 are in the top 15', () => {
    const ids = top(plan, 15).map((e) => e.target.id)
    expect(ids).toContain('NGC7000')
    expect(ids).toContain('IC1805')
    expect(ids).toContain('NGC0281')
  })
  it('the top 10 are all emission targets', () => {
    for (const e of top(plan, 10)) expect(e.target.emission, e.target.id).toBe('emission')
  })
  it('the Rosette appears once, as a complex', () => {
    const ids = entryIds(plan)
    expect(ids).toContain('RosetteComplex')
    for (const part of ['NGC2237', 'NGC2238', 'NGC2239', 'NGC2246']) expect(ids).not.toContain(part)
  })
})

describe('regression (c): London, 2026-12-09 (new Moon), dual-band — Orion up', () => {
  const plan = run('2026-12-09', 'dual-band')
  it('IC 434 (Horsehead region) is recommended, not too faint', () => {
    expect(hiddenIds(plan, 'too-faint')).not.toContain('IC0434')
    expect(rank(plan, 'IC0434')).toBeGreaterThan(0)
  })
})

describe('regression: London, 2026-11-20 (83% Moon), dual-band', () => {
  const plan = run('2026-11-20', 'dual-band')
  it('emission favourites survive a bright Moon with dual-band (top 20)', () => {
    const ids = top(plan, 20).map((e) => e.target.id)
    expect(ids).toContain('NGC7000')
    expect(ids).toContain('IC1805')
    expect(ids).toContain('NGC0281')
  })
})
