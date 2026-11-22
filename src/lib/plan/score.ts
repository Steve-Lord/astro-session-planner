import type { FitLabel, PlanEntry, ScoreBreakdown, Settings } from '../types'

/**
 * All ranking constants. The score is the product of the factors, so any zero kills it.
 * Calibrated (C1, final review) against the spec §7.10 regression set in tests/unit/regression.test.ts.
 */
export const WEIGHTS = {
  /**
   * Total usable hours at which the hours factor saturates at 1. Ruling R18: the hours factor uses
   * totalHours (all windows), the spec's primary figure, not the best window alone.
   */
  hoursFull: 4,
  /** Altitude at which the altitude factor is 0 (sin-scaled up to 1 at altitudeFullDeg). */
  altitudeFloorDeg: 15,
  /**
   * Altitude at which the altitude factor reaches 1. C1: scaling to the zenith gave M42 (peak 33°
   * from London) 0.39; above 50° airmass is < 1.31 and an alt-az mount (zenith limit ~80°) gains
   * little more. M42 now gets 0.57.
   */
  altitudeFullDeg: 50,
  /**
   * Fit factor per label; mosaic is divided by √(panel count). C1: mosaic 0.7 → 0.9 so a 2×1 mosaic
   * (M31: 178′ D25 vs a 147′ frame) scores 0.64 rather than 0.49 — still below a good fit.
   */
  fit: { good: 1, tight: 0.9, 'size-unknown': 0.8, mosaic: 0.9, 'too-small': 0 } satisfies Record<FitLabel, number>,
  /**
   * Small-target ramp for 'good'/'tight': the fit factor rises linearly from smallFillMin at the
   * too-small threshold (Settings.tooSmallFill) to 1 at smallFillFull (25% of the frame's long side,
   * ~37′). C1: without it, dozens of 8–10′ galaxies (5–7% of the frame) outranked M31/M33 — they are
   * small in a 2.45° field. M51 (11′) gets 0.54, M81 (27′) 0.70, M33 (71′) 1.
   */
  smallFillFull: 0.25,
  smallFillMin: 0.4,
  /**
   * Contrast factor: 1 at or below contrastFullMag, falling linearly to contrastAtLimit at
   * Settings.faintLimitMag (beyond which the target is hidden as too faint). C1: the old
   * (limit − c)/limit curve saturated at 1 for anything with c ≤ 0 (inflated reflection-nebula
   * estimates) and crushed bright galaxies at c ≈ 4 to 0.1–0.2. The limit itself hides targets, so
   * the factor at the limit (0.3) only needs to keep marginal targets below comfortable ones.
   */
  contrastFullMag: 1.0,
  contrastAtLimit: 0.3,
  /**
   * Contrast factor when surface brightness is unknown: listed, but kept off the top of the shortlist.
   * C1: 0.3 let hundreds of unmeasured open clusters outrank M31 and M33 on a new Moon.
   */
  unknownContrast: 0.15,
  /**
   * Galaxy surface brightness offset (mag, subtracted from catalogued surfBr before contrast).
   * OpenNGC SurfBr for galaxies is the B-band mean inside the 25 mag/arcsec² isophote (D25), which
   * understates what a camera records against a V-ish sky: (1) B−V ≈ 0.7 for typical spirals
   * (OpenNGC B/V: M31 0.85, M33 0.56, M101 0.46, M81 0.87); (2) the bright body inside the
   * half-light radius, which is what the image is made of, is ~0.5 mag brighter than the D25 mean.
   * 1.25 total; with faintLimitMag 4.0 this keeps the §7.10 verdicts from Bortle 6: M101 and
   * NGC 2403 OK on a new Moon (c ≈ 3.45, 2.95), too faint at full Moon; M33 too faint at full Moon.
   */
  galaxySbOffsetMag: 1.25,
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

/** Contrast factor for a known contrast (see WEIGHTS.contrastFullMag / contrastAtLimit). */
export function contrastFactor(c: number, faintLimitMag: number): number {
  const W = WEIGHTS
  const span = faintLimitMag - W.contrastFullMag
  if (span <= 0) return c <= faintLimitMag ? 1 : W.contrastAtLimit
  return clamp(1 - (1 - W.contrastAtLimit) * (c - W.contrastFullMag) / span, W.contrastAtLimit, 1)
}

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
  // R18: totalHours (sum of all usable windows), the spec's primary figure.
  const hours = Math.min(1, e.totalHours / W.hoursFull)
  const sinFloor = sinDeg(W.altitudeFloorDeg)
  const altitude = clamp((sinDeg(e.peakAlt) - sinFloor) / (sinDeg(W.altitudeFullDeg) - sinFloor), 0, 1)
  let fit = W.fit[e.fit.label]
  if (e.fit.label === 'mosaic' && e.fit.panels) fit /= Math.sqrt(e.fit.panels[0] * e.fit.panels[1])
  if ((e.fit.label === 'good' || e.fit.label === 'tight') && e.fit.fill !== null && W.smallFillFull > s.tooSmallFill) {
    const t = clamp((e.fit.fill - s.tooSmallFill) / (W.smallFillFull - s.tooSmallFill), 0, 1)
    fit *= W.smallFillMin + (1 - W.smallFillMin) * t
  }
  const contrast = e.contrastMag === null ? W.unknownContrast : contrastFactor(e.contrastMag, s.faintLimitMag)
  const moon = e.contrastMag === null && e.minMoonSepDeg !== null && moonIllum > W.moonIllumThreshold
    ? clamp((e.minMoonSepDeg - W.moonSepZeroDeg) / W.moonSepSpanDeg, W.moonMin, 1)
    : 1
  const breakdown: ScoreBreakdown = { hours, altitude, fit, contrast, moon }
  return { score: hours * altitude * fit * contrast * moon, breakdown }
}
