import type { Settings, Target } from '../types'

/**
 * Contrast in magnitudes: target surface brightness minus effective sky (both mag/arcsec²).
 * Larger = target fainter relative to the sky. Null when surface brightness is unknown.
 */
export function contrastMag(t: Target, effSky: number): number | null {
  return t.surfBr === null ? null : t.surfBr - effSky
}

/**
 * Too faint when contrast exceeds Settings.faintLimitMag (default 5.0 mag, tuned on the spec §7.10
 * known cases: NGC 7000 dual-band half Moon OK; M101 dual-band half Moon too faint).
 * Unknown contrast is never too faint.
 */
export function isTooFaint(contrast: number | null, s: Settings): boolean {
  return contrast !== null && contrast > s.faintLimitMag
}
