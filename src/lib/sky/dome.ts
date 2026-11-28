import type { Gear, HorizonProfile, Settings, Site, Target, TimeWindow } from '../types'
import {
  altAz, lstDeg, moonAltAz, moonIllumination, precessToDate, sunAltAz,
} from '../astro/positions'
import { heightAt, neededHeight } from '../horizon/profile'
import { fovArcmin } from '../gear/fit'
import { nightEpoch, nightSeries, type NightSeries } from '../plan/series'
import { BRIGHT_STARS } from '../sweep/calibration'

const D2R = Math.PI / 180

/** Polar projection: zenith at the origin, north up, east left. */
export function project(alt: number, az: number, radius: number): { x: number; y: number } {
  const r = (radius * (90 - alt)) / 90
  const a = az * D2R
  return { x: -r * Math.sin(a), y: -r * Math.cos(a) }
}

const pt = (alt: number, az: number, radius: number): string => {
  const { x, y } = project(alt, ((az % 360) + 360) % 360, radius)
  return `${x.toFixed(1)} ${y.toFixed(1)}`
}

/**
 * Closed shapes from the dome edge in to the obstruction height over runs of degrees where `pick`
 * holds. Degree d covers [d - 0.5, d + 0.5], so neighbouring runs (roof next to trees) share an edge;
 * when every degree is picked the shape is a full ring.
 */
function runsPath(
  profile: HorizonProfile, treesBare: boolean, radius: number, pick: (k: number) => boolean,
): string {
  const flags = Array.from({ length: 360 }, (_, k) => pick(k))
  if (!flags.some(Boolean)) return ''
  const h = (k: number) => heightAt(profile, k % 360, treesBare)
  if (flags.every(Boolean)) {
    const inner: string[] = []
    const outer: string[] = []
    for (let k = 0; k < 360; k++) {
      inner.push(pt(h(k), k, radius))
      outer.push(pt(0, k, radius))
    }
    // Opposite windings, so the nonzero fill leaves the sky inside the inner edge open.
    return `M${inner.join('L')}ZM${outer.reverse().join('L')}Z`
  }
  // Start scanning just after a degree that is not picked so no run straddles the scan start.
  const start = flags.indexOf(false) + 1
  const runs: [number, number][] = []
  let cur: [number, number] | null = null
  for (let i = 0; i < 360; i++) {
    const k = (start + i) % 360
    if (flags[k]) {
      if (cur) cur[1] = start + i
      else cur = [start + i, start + i]
    } else if (cur) { runs.push(cur); cur = null }
  }
  if (cur) runs.push(cur)
  return runs.map(([a, b]) => {
    const inner = [pt(h(a), a - 0.5, radius)]
    const outer = [pt(0, a - 0.5, radius)]
    for (let k = a; k <= b; k++) {
      inner.push(pt(h(k), k, radius))
      outer.push(pt(0, k, radius))
    }
    inner.push(pt(h(b), b + 0.5, radius))
    outer.push(pt(0, b + 0.5, radius))
    return `M${inner.join('L')}L${outer.reverse().join('L')}Z`
  }).join('')
}

export function obstructionPaths(
  profile: HorizonProfile | null, treesBare: boolean, radius: number,
): { roof: string; trees: string } {
  if (!profile) return { roof: '', trees: '' }
  return {
    roof: runsPath(profile, treesBare, radius, (k) => !profile.seasonal[k]),
    trees: runsPath(profile, treesBare, radius, (k) => !!profile.seasonal[k]),
  }
}

export interface DomeTrack { id: string; alt: Float32Array; az: Float32Array; usable: Uint8Array }
export interface DomeFrames {
  times: number[]
  span: TimeWindow
  dark: TimeWindow | null
  twilight: NightSeries['twilight']
  sunAlt: Float32Array
  moonAlt: Float32Array
  moonAz: Float32Array
  moonIllum: Float32Array
  targets: DomeTrack[]
  stars: { name: string; alt: Float32Array; az: Float32Array }[]
}

const DUMMY: Target = {
  id: '', names: [], ra: 0, dec: 90, type: '', majArcmin: null, minArcmin: null,
  posAngle: null, mag: null, surfBr: null, emission: 'emission',
}

/** Per-step positions for every target, the Sun, the Moon and bright stars, on the nightSeries grid. */
export function domeFrames(
  site: Site, gear: Gear, settings: Settings, date: string, targets: Target[],
): DomeFrames {
  const s = nightSeries(site, gear, settings, date, targets[0] ?? DUMMY)
  const { times } = s
  const n = times.length
  const mid = nightEpoch(s.span, s.dark)
  const halfDiag = fovArcmin(gear).halfDiagDeg
  const lsts = times.map((t) => lstDeg(t, site.lon))

  const sunAlt = new Float32Array(n)
  const moonAlt = new Float32Array(n)
  const moonAz = new Float32Array(n)
  const moonIllum = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    sunAlt[i] = sunAltAz(times[i], site).alt
    const m = moonAltAz(times[i], site)
    moonAlt[i] = m.alt
    moonAz[i] = m.az
    moonIllum[i] = moonIllumination(times[i])
  }

  const track = (id: string, ra: number, dec: number, withUsable: boolean) => {
    const p = precessToDate(ra, dec, mid)
    const alt = new Float32Array(n)
    const az = new Float32Array(n)
    const usable = new Uint8Array(withUsable ? n : 0)
    for (let i = 0; i < n; i++) {
      const r = altAz(p.ra, p.dec, site.lat, lsts[i])
      alt[i] = r.alt
      az[i] = r.az
      if (withUsable) {
        const needed = Math.fround(
          neededHeight(site.horizon, site.treesBare, r.alt, r.az, halfDiag, settings.clearanceDeg),
        )
        usable[i] = alt[i] >= gear.minAltDeg && alt[i] <= gear.maxAltDeg && alt[i] >= needed ? 1 : 0
      }
    }
    return { id, alt, az, usable }
  }

  return {
    times, span: s.span, dark: s.dark, twilight: s.twilight,
    sunAlt, moonAlt, moonAz, moonIllum,
    targets: targets.map((t) => track(t.id, t.ra, t.dec, true)),
    stars: BRIGHT_STARS.map((b) => {
      const { alt, az } = track(b.name, b.ra, b.dec, false)
      return { name: b.name, alt, az }
    }),
  }
}

/** Slider start: the nearest step to now inside the night, else the dark start (or the first step). */
export function initialIndex(times: number[], now: number, dark: TimeWindow | null): number {
  if (times.length === 0) return 0
  if (now >= times[0] && now <= times[times.length - 1]) {
    let best = 0
    for (let i = 1; i < times.length; i++) {
      if (Math.abs(times[i] - now) < Math.abs(times[best] - now)) best = i
    }
    return best
  }
  if (!dark) return 0
  const i = times.findIndex((t) => t >= dark.start)
  return i < 0 ? 0 : i
}
