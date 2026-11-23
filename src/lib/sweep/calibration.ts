import * as A from 'astronomy-engine'
import type { HorizonProfile, Site } from '../types'
import { precessToDate } from '../astro/positions'
import { angDiff, circularMean, wrap360 } from './orientation'

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

export const BRIGHT_STARS: { name: string; ra: number; dec: number; mag: number }[] = [
  { name: 'Sirius', ra: 101.2875, dec: -16.7161, mag: -1.46 },
  { name: 'Arcturus', ra: 213.9153, dec: 19.1824, mag: -0.05 },
  { name: 'Vega', ra: 279.2347, dec: 38.7837, mag: 0.03 },
  { name: 'Capella', ra: 79.1723, dec: 45.998, mag: 0.08 },
  { name: 'Rigel', ra: 78.6345, dec: -8.2016, mag: 0.13 },
  { name: 'Procyon', ra: 114.8255, dec: 5.225, mag: 0.34 },
  { name: 'Betelgeuse', ra: 88.7929, dec: 7.4071, mag: 0.42 },
  { name: 'Altair', ra: 297.6958, dec: 8.8683, mag: 0.77 },
  { name: 'Aldebaran', ra: 68.9802, dec: 16.5093, mag: 0.85 },
  { name: 'Spica', ra: 201.2983, dec: -11.1613, mag: 0.97 },
  { name: 'Antares', ra: 247.3519, dec: -26.432, mag: 1.06 },
  { name: 'Pollux', ra: 116.3289, dec: 28.0262, mag: 1.14 },
  { name: 'Fomalhaut', ra: 344.4127, dec: -29.6222, mag: 1.16 },
  { name: 'Deneb', ra: 310.358, dec: 45.2803, mag: 1.25 },
  { name: 'Regulus', ra: 152.093, dec: 11.9672, mag: 1.35 },
  { name: 'Castor', ra: 113.6494, dec: 31.8883, mag: 1.58 },
  { name: 'Bellatrix', ra: 81.2828, dec: 6.3497, mag: 1.64 },
  { name: 'Elnath', ra: 81.573, dec: 28.6075, mag: 1.65 },
  { name: 'Alioth', ra: 193.5073, dec: 55.9598, mag: 1.76 },
  { name: 'Dubhe', ra: 165.932, dec: 61.751, mag: 1.79 },
]

export interface CalibrationCandidate {
  id: string
  label: string
  alt: number
  az: number
  kind: 'moon' | 'planet' | 'star'
}

const MIN_ALT = 5
const MAX_ALT = 60
const MIN_SUN_SEP = 30
/** Sun altitude below which each kind can be seen: stars and the dim planets need real dusk, Venus is seen in twilight, the Moon by day. */
const MAX_SUN_ALT = { moon: Infinity, venus: 0, planet: -6, star: -6 }

const BODIES: { id: string; label: string; body: A.Body; kind: 'moon' | 'planet' }[] = [
  { id: 'moon', label: 'Moon', body: A.Body.Moon, kind: 'moon' },
  { id: 'venus', label: 'Venus', body: A.Body.Venus, kind: 'planet' },
  { id: 'mars', label: 'Mars', body: A.Body.Mars, kind: 'planet' },
  { id: 'jupiter', label: 'Jupiter', body: A.Body.Jupiter, kind: 'planet' },
  { id: 'saturn', label: 'Saturn', body: A.Body.Saturn, kind: 'planet' },
]

/** Angular separation (deg) between two of-date equatorial positions (RA deg, Dec deg). */
function separation(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const c =
    Math.sin(dec1 * D2R) * Math.sin(dec2 * D2R) +
    Math.cos(dec1 * D2R) * Math.cos(dec2 * D2R) * Math.cos((ra1 - ra2) * D2R)
  return Math.acos(Math.max(-1, Math.min(1, c))) * R2D
}

/** Bright objects usable as a compass reference now: apparent (refracted) alt/az, 5-60 deg up, 30+ deg from the Sun, and dark enough to see (Moon any time; Venus Sun < 0 deg; others Sun < -6 deg). */
export function calibrationCandidates(site: Site, at: Date): CalibrationCandidate[] {
  const obs = new A.Observer(site.lat, site.lon, site.elevation)
  const sun = A.Equator(A.Body.Sun, at, obs, true, true)
  const sunRa = sun.ra * 15
  const sunAlt = A.Horizon(at, obs, sun.ra, sun.dec, 'normal').altitude
  const out: CalibrationCandidate[] = []

  const consider = (id: string, label: string, kind: CalibrationCandidate['kind'], raDeg: number, dec: number) => {
    if (sunAlt >= (id === 'venus' ? MAX_SUN_ALT.venus : MAX_SUN_ALT[kind])) return
    if (separation(raDeg, dec, sunRa, sun.dec) < MIN_SUN_SEP) return
    const h = A.Horizon(at, obs, raDeg / 15, dec, 'normal')
    if (h.altitude < MIN_ALT || h.altitude > MAX_ALT) return
    out.push({ id, label, alt: h.altitude, az: h.azimuth, kind })
  }

  for (const b of BODIES) {
    const eq = A.Equator(b.body, at, obs, true, true)
    consider(b.id, b.label, b.kind, eq.ra * 15, eq.dec)
  }
  const stars = [...BRIGHT_STARS].sort((a, b) => a.mag - b.mag)
  for (const s of stars) {
    const d = precessToDate(s.ra, s.dec, at.getTime())
    consider(`star:${s.name}`, s.name, 'star', d.ra, d.dec)
  }
  return out
}

/**
 * Solve the compass offset from readings aimed at a known object.
 * offset = circular mean of truth.az - (azMag + declination).
 */
export function offsetFromAim(
  aimed: { azMag: number; alt: number }[],
  truth: { az: number; alt: number },
  declinationDeg: number,
): { offsetDeg: number; residualAltDeg: number; spreadDeg: number } {
  if (aimed.length === 0) throw new Error('No readings to calibrate from')
  const offsets = aimed.map((r) => wrap360(truth.az - (r.azMag + declinationDeg)))
  const mean = circularMean(offsets)
  let s = 0
  let c = 0
  for (const o of offsets) {
    s += Math.sin(o * D2R)
    c += Math.cos(o * D2R)
  }
  const R = Math.min(1, Math.hypot(s, c) / offsets.length)
  const spreadDeg = Math.max(0, Math.sqrt(-2 * Math.log(Math.max(R, 1e-12))) * R2D)
  const meanAlt = aimed.reduce((a, r) => a + r.alt, 0) / aimed.length
  return { offsetDeg: angDiff(0, mean), residualAltDeg: meanAlt - truth.alt, spreadDeg }
}

const N = 360
const mod = (n: number) => ((n % N) + N) % N

/** Shift per-azimuth arrays so a feature at az A moves to A + deltaDeg. Pure. */
export function rotateProfile(p: HorizonProfile, deltaDeg: number): HorizonProfile {
  const lerp = (arr: number[]) =>
    arr.map((_, i) => {
      const src = mod(i - deltaDeg)
      const i0 = Math.floor(src)
      const f = src - i0
      const a = arr[i0 % N]
      return f === 0 ? a : a + (arr[(i0 + 1) % N] - a) * f
    })
  const nearest = <T>(arr: T[]) => arr.map((_, i) => arr[Math.round(mod(i - deltaDeg)) % N])
  const out: HorizonProfile = {
    ...p,
    altitudes: lerp(p.altitudes),
    seasonal: nearest(p.seasonal),
    leafOffAltitudes: lerp(p.leafOffAltitudes),
    northOffsetDeg: p.northOffsetDeg + deltaDeg,
    calibration: p.calibration ? { ...p.calibration } : null,
  }
  if (p.unswept) out.unswept = nearest(p.unswept)
  return out
}
