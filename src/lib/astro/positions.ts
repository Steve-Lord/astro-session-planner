import * as A from 'astronomy-engine'
import type { Site, TimeWindow } from '../types'

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

/** J2000 RA/Dec (degrees) -> equator of date (degrees). */
export function precessToDate(ra: number, dec: number, t: number): { ra: number; dec: number } {
  const rot = A.Rotation_EQJ_EQD(new Date(t))
  const v = A.RotateVector(rot, A.VectorFromSphere(new A.Spherical(dec, ra, 1), new Date(t)))
  const eq = A.EquatorFromVector(v)
  return { ra: eq.ra * 15, dec: eq.dec }
}

/** Local apparent sidereal time in degrees [0,360). */
export function lstDeg(t: number, lon: number): number {
  const h = A.SiderealTime(new Date(t)) // Greenwich apparent sidereal hours
  return (((h * 15 + lon) % 360) + 360) % 360
}

/** Hot path: of-date RA/Dec (deg) to alt/az (deg), az north through east, no refraction. */
export function altAz(
  raDate: number, decDate: number, lat: number, lst: number,
): { alt: number; az: number } {
  const ha = (lst - raDate) * D2R
  const dec = decDate * D2R
  const phi = lat * D2R
  const sinDec = Math.sin(dec), cosDec = Math.cos(dec)
  const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi)
  const cosHa = Math.cos(ha)
  const sinAlt = sinDec * sinPhi + cosDec * cosPhi * cosHa
  const alt = Math.asin(sinAlt > 1 ? 1 : sinAlt < -1 ? -1 : sinAlt)
  // az from north through east
  const y = -Math.sin(ha) * cosDec
  const x = sinDec * cosPhi - cosDec * sinPhi * cosHa
  let az = Math.atan2(y, x) * R2D
  if (az < 0) az += 360
  return { alt: alt * R2D, az }
}

function bodyAltAz(body: A.Body, t: number, site: Site): { alt: number; az: number } {
  const d = new Date(t)
  const obs = new A.Observer(site.lat, site.lon, site.elevation)
  const eq = A.Equator(body, d, obs, true, true)
  const h = A.Horizon(d, obs, eq.ra, eq.dec, undefined)
  return { alt: h.altitude, az: h.azimuth }
}

export function sunAltAz(t: number, site: Site): { alt: number; az: number } {
  return bodyAltAz(A.Body.Sun, t, site)
}

export function moonAltAz(t: number, site: Site): { alt: number; az: number } {
  return bodyAltAz(A.Body.Moon, t, site)
}

/** Geocentric Moon RA/Dec of date, degrees. */
export function moonRaDec(t: number): { ra: number; dec: number } {
  const eq = A.Equator(
    A.Body.Moon, new Date(t), new A.Observer(0, 0, 0), true, true,
  )
  return { ra: eq.ra * 15, dec: eq.dec }
}

export function moonIllumination(t: number): number {
  return A.Illumination(A.Body.Moon, new Date(t)).phase_fraction
}

export function moonRiseSet(
  site: Site, window: TimeWindow,
): { rise: number | null; set: number | null } {
  const obs = new A.Observer(site.lat, site.lon, site.elevation)
  const days = (window.end - window.start) / 86400000
  const find = (dir: number): number | null => {
    const r = A.SearchRiseSet(A.Body.Moon, obs, dir, new Date(window.start), days)
    return r ? r.date.getTime() : null
  }
  return { rise: find(+1), set: find(-1) }
}
