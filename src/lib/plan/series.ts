import type { Gear, Settings, Site, Target, TimeWindow } from '../types'
import { darkWindow, nightBounds } from '../astro/time'
import {
  altAz, lstDeg, moonAltAz, moonIllumination, moonRaDec, moonRiseSet, precessToDate,
} from '../astro/positions'
import { heightAt, neededHeight } from '../horizon/profile'
import { fovArcmin } from '../gear/fit'
import { sepDeg } from './night'

const STEP_MS = 5 * 60000

export interface NightSeries {
  span: TimeWindow
  twilight: { civil: TimeWindow | null; nautical: TimeWindow | null; astro: TimeWindow | null }
  times: number[]
  alt: Float32Array
  az: Float32Array
  horizon: Float32Array
  needed: Float32Array
  moonAlt: Float32Array
  /** NaN while the Moon is below 0 degrees. */
  moonSep: Float32Array
  moonIllum: number
  moonRise: number | null
  moonSet: number | null
}

/** Per-target altitude series from sunset to sunrise, on the same 5-min grid as buildContext. */
export function nightSeries(
  site: Site, gear: Gear, settings: Settings, date: string, target: Target,
): NightSeries {
  const bounds = nightBounds(date, site.timezone)
  const span = darkWindow(site, date, -0.833) ?? bounds
  const astro = darkWindow(site, date, -18)
  const dark = (settings.darkSunAlt === -18 ? astro : null) ?? darkWindow(site, date, -12)

  // Align to the buildContext grid (dark.start + k*STEP) when there is a dark window.
  const origin = dark ? dark.start : span.start
  const k0 = Math.ceil((span.start - origin) / STEP_MS)
  const times: number[] = []
  for (let t = origin + k0 * STEP_MS; t <= span.end; t += STEP_MS) times.push(t)

  const mid = dark ? (dark.start + dark.end) / 2 : (span.start + span.end) / 2
  const p = precessToDate(target.ra, target.dec, mid)
  const halfDiag = fovArcmin(gear).halfDiagDeg
  const n = times.length
  const alt = new Float32Array(n)
  const az = new Float32Array(n)
  const horizon = new Float32Array(n)
  const needed = new Float32Array(n)
  const moonAlt = new Float32Array(n)
  const moonSep = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = times[i]
    const r = altAz(p.ra, p.dec, site.lat, lstDeg(t, site.lon))
    alt[i] = r.alt
    az[i] = r.az
    horizon[i] = heightAt(site.horizon, r.az, site.treesBare)
    needed[i] = neededHeight(site.horizon, site.treesBare, r.alt, r.az, halfDiag, settings.clearanceDeg)
    const m = moonAltAz(t, site)
    moonAlt[i] = m.alt
    if (m.alt > 0) {
      const eq = moonRaDec(t)
      moonSep[i] = sepDeg(p.ra, p.dec, eq.ra, eq.dec)
    } else {
      moonSep[i] = NaN
    }
  }

  const { rise, set } = moonRiseSet(site, bounds)
  return {
    span,
    twilight: {
      civil: darkWindow(site, date, -6),
      nautical: darkWindow(site, date, -12),
      astro,
    },
    times, alt, az, horizon, needed, moonAlt, moonSep,
    moonIllum: moonIllumination((span.start + span.end) / 2),
    moonRise: rise,
    moonSet: set,
  }
}
