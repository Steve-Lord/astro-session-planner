import type { FitLabel, PlanEntry, ScoreBreakdown, Settings } from '../types'

/** All ranking constants. The score is the product of the factors, so any zero kills it. */
export const WEIGHTS = {
  /** Total usable hours at which the hours factor saturates at 1. */
  hoursFull: 4,
  /** Altitude at which the altitude factor is 0 (sin-scaled up to 1 at the zenith). */
  altitudeFloorDeg: 15,
  /** Fit factor per label; mosaic is divided by √(panel count). */
  fit: { good: 1, tight: 0.9, 'size-unknown': 0.8, mosaic: 0.7, 'too-small': 0 } satisfies Record<FitLabel, number>,
  contrastMin: 0.1,
  /** Contrast factor when surface brightness is unknown: listed, but kept off the top of the shortlist. */
  unknownContrast: 0.3,
  /**
   * Moon factor = clamp((sep − moonSepZeroDeg) / moonSepSpanDeg, moonMin, 1), applied ONLY when contrast
   * is unknown. A known contrast already uses moonlitSqm (phase, altitude, separation), so a second
   * Moon penalty would double-count moonlight (ruling R15).
   */
  moonSepZeroDeg: 10,
  moonSepSpanDeg: 50,
  moonMin: 0.3,
  /** The Moon factor only applies above this illuminated fraction. */
  moonIllumThreshold: 0.3,
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const sinDeg = (d: number) => Math.sin(d * Math.PI / 180)

/**
 * Ranking score for a plan entry.
 * `moonIllum` is the Moon's illuminated fraction at the best window's midpoint; the Moon factor
 * applies only when contrastMag is null (a known contrast already includes moonlight), the Moon is up
 * during the best window (minMoonSepDeg non-null) and moonIllum > 0.3.
 */
export function scoreEntry(
  e: Omit<PlanEntry, 'score' | 'breakdown'>, s: Settings, moonIllum: number,
): { score: number; breakdown: ScoreBreakdown } {
  const W = WEIGHTS
  const hours = Math.min(1, e.totalHours / W.hoursFull)
  const sinFloor = sinDeg(W.altitudeFloorDeg)
  const altitude = Math.max(0, (sinDeg(e.peakAlt) - sinFloor) / (1 - sinFloor))
  let fit = W.fit[e.fit.label]
  if (e.fit.label === 'mosaic' && e.fit.panels) fit /= Math.sqrt(e.fit.panels[0] * e.fit.panels[1])
  const contrast = e.contrastMag === null
    ? W.unknownContrast
    : clamp((s.faintLimitMag - e.contrastMag) / s.faintLimitMag, W.contrastMin, 1)
  const moon = e.contrastMag === null && e.minMoonSepDeg !== null && moonIllum > W.moonIllumThreshold
    ? clamp((e.minMoonSepDeg - W.moonSepZeroDeg) / W.moonSepSpanDeg, W.moonMin, 1)
    : 1
  const breakdown: ScoreBreakdown = { hours, altitude, fit, contrast, moon }
  return { score: hours * altitude * fit * contrast * moon, breakdown }
}
