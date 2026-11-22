import * as A from 'astronomy-engine'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import type { Site, TimeWindow } from '../types'

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Local 12:00 on `date` to local 12:00 the next day (site timezone), epoch ms. */
export function nightBounds(date: string, timezone: string): TimeWindow {
  return {
    start: fromZonedTime(`${date}T12:00:00`, timezone).getTime(),
    end: fromZonedTime(`${addDays(date, 1)}T12:00:00`, timezone).getTime(),
  }
}

/**
 * Span within nightBounds during which the Sun is below `sunAlt`; null if never.
 * If the Sun is already below at window start (or still below at end) the span is clamped.
 */
export function darkWindow(site: Site, date: string, sunAlt: -18 | -12): TimeWindow | null {
  const b = nightBounds(date, site.timezone)
  const obs = new A.Observer(site.lat, site.lon, site.elevation)
  const days = (b.end - b.start) / 86400000
  const startDate = new Date(b.start)
  const startAlt = A.Horizon(startDate, obs, ...sunEq(startDate, obs), undefined).altitude
  const below0 = startAlt < sunAlt
  // Falling crossing (dusk) then rising crossing (dawn).
  let start: number
  if (below0) {
    start = b.start
  } else {
    const dusk = A.SearchAltitude(A.Body.Sun, obs, -1, startDate, days, sunAlt)
    if (!dusk || dusk.date.getTime() > b.end) return null
    start = dusk.date.getTime()
  }
  const dawn = A.SearchAltitude(A.Body.Sun, obs, +1, new Date(start), (b.end - start) / 86400000, sunAlt)
  const end = dawn && dawn.date.getTime() <= b.end ? dawn.date.getTime() : b.end
  if (end <= start) return null
  return { start, end }
}

function sunEq(d: Date, obs: A.Observer): [number, number] {
  const e = A.Equator(A.Body.Sun, d, obs, true, true)
  return [e.ra, e.dec]
}

/** Local date of "tonight": before local 12:00 counts as the previous date's night. */
export function tonight(timezone: string, now: Date = new Date()): string {
  const local = formatInTimeZone(now, timezone, 'yyyy-MM-dd HH')
  const date = local.slice(0, 10)
  return Number(local.slice(11)) < 12 ? addDays(date, -1) : date
}

export function formatLocal(t: number, timezone: string): string {
  return formatInTimeZone(new Date(t), timezone, 'HH:mm')
}
