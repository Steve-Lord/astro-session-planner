import type { Gear, Settings, Site, Target, TimeWindow } from '../types'
import { darkWindow } from '../astro/time'
import {
  altAz, lstDeg, moonAltAz, moonIllumination, moonRaDec, precessToDate, sunAltAz,
} from '../astro/positions'
import { frameClears } from '../horizon/profile'
import { fovArcmin } from '../gear/fit'

const STEP_MS = 5 * 60000
const MIN_RUN_MS = 30 * 60000

export interface MoonSample { alt: number; az: number; ra: number; dec: number; illum: number }

export interface NightContext {
  site: Site
  gear: Gear
  settings: Settings
  dark: TimeWindow
  times: number[]
  lst: number[]
  sun: number[]
  moon: MoonSample[]
}

/**
 * The dark window the planner uses: Sun below -18° (or -12° when settings ask for it), falling back
 * to -12° on nights with no astronomical darkness.
 */
export function pickDarkWindow(
  site: Site, date: string, settings: Settings,
): { dark: TimeWindow | null; darkSunAltUsed: -18 | -12; noAstroDark: boolean } {
  const astro = darkWindow(site, date, -18)
  const noAstroDark = astro === null
  let darkSunAltUsed: -18 | -12 = settings.darkSunAlt
  let dark: TimeWindow | null
  if (darkSunAltUsed === -18) {
    dark = astro
    if (!dark) {
      darkSunAltUsed = -12
      dark = darkWindow(site, date, -12)
    }
  } else {
    dark = darkWindow(site, date, -12)
  }
  return { dark, darkSunAltUsed, noAstroDark }
}

export function buildContext(
  site: Site, gear: Gear, settings: Settings, date: string,
): { ctx: NightContext | null; darkSunAltUsed: -18 | -12; noAstroDark: boolean } {
  const { dark, darkSunAltUsed, noAstroDark } = pickDarkWindow(site, date, settings)
  if (!dark) return { ctx: null, darkSunAltUsed, noAstroDark }

  const times: number[] = []
  const lst: number[] = []
  const sun: number[] = []
  const moon: MoonSample[] = []
  for (let t = dark.start; t <= dark.end; t += STEP_MS) {
    times.push(t)
    lst.push(lstDeg(t, site.lon))
    sun.push(sunAltAz(t, site).alt)
    const m = moonAltAz(t, site)
    const eq = moonRaDec(t)
    moon.push({ alt: m.alt, az: m.az, ra: eq.ra, dec: eq.dec, illum: moonIllumination(t) })
  }
  return { ctx: { site, gear, settings, dark, times, lst, sun, moon }, darkSunAltUsed, noAstroDark }
}

export function visibility(t: Target, ctx: NightContext): {
  windows: TimeWindow[]; totalHours: number; best: TimeWindow | null; peakAlt: number
  alts: Float32Array; usable: Uint8Array
} {
  const { site, gear, settings, dark, times, lst } = ctx
  const n = times.length
  const alts = new Float32Array(n)
  const usable = new Uint8Array(n)
  const halfDiag = fovArcmin(gear).halfDiagDeg
  const p = precessToDate(t.ra, t.dec, (dark.start + dark.end) / 2)

  const windows: TimeWindow[] = []
  let peakAlt = 0
  let runStart = -1
  let runPeak = 0
  const close = (lastIdx: number) => {
    const start = times[runStart]
    const end = Math.min(times[lastIdx] + STEP_MS, dark.end)
    if (end - start >= MIN_RUN_MS) {
      windows.push({ start, end })
      if (runPeak > peakAlt) peakAlt = runPeak
    }
    runStart = -1
  }
  for (let i = 0; i < n; i++) {
    const r = altAz(p.ra, p.dec, site.lat, lst[i])
    alts[i] = r.alt
    const ok = r.alt >= gear.minAltDeg && r.alt <= gear.maxAltDeg &&
      frameClears(site.horizon, site.treesBare, r.alt, r.az, halfDiag, settings.clearanceDeg)
    if (ok) {
      usable[i] = 1
      if (runStart < 0) { runStart = i; runPeak = r.alt } else if (r.alt > runPeak) runPeak = r.alt
    } else if (runStart >= 0) {
      close(i - 1)
    }
  }
  if (runStart >= 0) close(n - 1)

  let total = 0
  let best: TimeWindow | null = null
  for (const w of windows) {
    total += w.end - w.start
    if (!best || w.end - w.start > best.end - best.start) best = w
  }
  return { windows, totalHours: total / 3600000, best, peakAlt, alts, usable }
}

export function neverRises(t: Target, lat: number, minAlt: number): boolean {
  return 90 - Math.abs(lat - t.dec) < minAlt
}
