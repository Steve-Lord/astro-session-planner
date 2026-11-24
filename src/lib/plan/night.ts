import type { FilterKind, Gear, HiddenCause, HiddenReason, NightPlan, PlanEntry, Settings, Site, Target, TargetVerdict } from '../types'
import { buildContext, neverRises, visibility, type NightContext } from './visibility'
import { moonIllumination, moonRiseSet, precessToDate } from '../astro/positions'
import { nightBounds } from '../astro/time'
import { frameFit } from '../gear/fit'
import { baselineSqm, effectiveSky, moonlitSqm } from '../sky/brightness'
import { contrastMag, isTooFaint } from './faintness'
import { scoreEntry } from './score'

export interface PlanInput {
  site: Site; gear: Gear; filterId: string; settings: Settings; date: string; catalog: Target[]
}

const D2R = Math.PI / 180

/** Great-circle separation in degrees between two RA/Dec positions (degrees). */
export function sepDeg(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const c = Math.sin(dec1 * D2R) * Math.sin(dec2 * D2R) +
    Math.cos(dec1 * D2R) * Math.cos(dec2 * D2R) * Math.cos((ra1 - ra2) * D2R)
  return Math.acos(c > 1 ? 1 : c < -1 ? -1 : c) / D2R
}

const hiddenVerdict = (
  reason: HiddenReason, cause: HiddenCause, fill: number | null = null, contrast: number | null = null,
): TargetVerdict => ({ kind: 'hidden', reason, cause, fill, contrastMag: contrast })

/** Evaluate one target against a night: a scored entry, or why it is hidden. */
export function evaluateTarget(
  t: Target, ctx: NightContext, env: { filterKind: FilterKind; baseSqm: number; mid: number },
): TargetVerdict {
  const { site, gear, settings, times, moon } = ctx
  const { filterKind, baseSqm, mid } = env
  if (neverRises(t, site.lat, gear.minAltDeg)) return hiddenVerdict('blocked', 'never-rises')
  const v = visibility(t, ctx)
  if (!v.best) {
    return hiddenVerdict('blocked', v.usable.some((u) => u === 1) ? 'short-gaps' : 'never-clears')
  }
  const fit = frameFit(t, gear, settings.tooSmallFill)
  if (fit.label === 'too-small') return hiddenVerdict('too-small', 'too-small', fit.fill)

  // Best-window samples: minimum Moon separation while the Moon is up, and the midpoint sample.
  const p = precessToDate(t.ra, t.dec, mid)
  const bestMid = (v.best.start + v.best.end) / 2
  let minSep: number | null = null
  let midIdx = -1
  for (let i = 0; i < times.length; i++) {
    const ti = times[i]
    if (ti < v.best.start || ti >= v.best.end) continue
    if (midIdx < 0 || Math.abs(ti - bestMid) < Math.abs(times[midIdx] - bestMid)) midIdx = i
    if (moon[i].alt > 0) {
      const sep = sepDeg(p.ra, p.dec, moon[i].ra, moon[i].dec)
      if (minSep === null || sep < minSep) minSep = sep
    }
  }
  const m = moon[midIdx]
  const sky = m.alt > 0
    ? moonlitSqm(baseSqm, m.alt, m.illum, v.alts[midIdx], sepDeg(p.ra, p.dec, m.ra, m.dec))
    : baseSqm
  const contrast = contrastMag(t, effectiveSky(sky, t.emission, filterKind, settings))
  if (isTooFaint(contrast, settings)) return hiddenVerdict('too-faint', 'too-faint', null, contrast)

  const e = {
    target: t, windows: v.windows, totalHours: v.totalHours, best: v.best, peakAlt: v.peakAlt,
    fit, contrastMag: contrast, minMoonSepDeg: minSep,
  }
  return { kind: 'entry', entry: { ...e, ...scoreEntry(e, settings, m.illum) } }
}

/** Explain one target for a night with exactly the numbers planNight uses. */
export function explainTarget(input: Omit<PlanInput, 'catalog'>, target: Target): TargetVerdict {
  const { site, gear, filterId, settings, date } = input
  const { ctx } = buildContext(site, gear, settings, date)
  if (!ctx) return hiddenVerdict('blocked', 'no-dark')
  const filterKind: FilterKind = gear.filters.find((f) => f.id === filterId)?.kind ?? 'none'
  return evaluateTarget(target, ctx, {
    filterKind, baseSqm: baselineSqm(site.sky), mid: (ctx.dark.start + ctx.dark.end) / 2,
  })
}

export function planNight(input: PlanInput): NightPlan {
  const { site, gear, filterId, settings, date, catalog } = input
  const bounds = nightBounds(date, site.timezone)
  const { ctx, darkSunAltUsed, noAstroDark } = buildContext(site, gear, settings, date)
  const hidden: Record<HiddenReason, Target[]> = { blocked: [], 'too-small': [], 'too-faint': [] }
  const rs = moonRiseSet(site, bounds)

  if (!ctx) {
    hidden.blocked.push(...catalog)
    return {
      siteId: site.id, date, darkWindow: null, darkSunAltUsed, noAstroDark,
      moon: { illumination: moonIllumination((bounds.start + bounds.end) / 2), rise: rs.rise, set: rs.set },
      entries: [], hidden,
    }
  }

  const filterKind: FilterKind = gear.filters.find((f) => f.id === filterId)?.kind ?? 'none'
  const baseSqm = baselineSqm(site.sky)
  const mid = (ctx.dark.start + ctx.dark.end) / 2
  const entries: PlanEntry[] = []

  const env = { filterKind, baseSqm, mid }
  for (const t of catalog) {
    const v = evaluateTarget(t, ctx, env)
    if (v.kind === 'entry') entries.push(v.entry)
    else hidden[v.reason].push(t)
  }
  entries.sort((a, b) => b.score - a.score || a.target.id.localeCompare(b.target.id))

  return {
    siteId: site.id, date, darkWindow: ctx.dark, darkSunAltUsed, noAstroDark,
    moon: { illumination: moonIllumination(mid), rise: rs.rise, set: rs.set },
    entries, hidden,
  }
}
