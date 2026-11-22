import type { Settings, Target } from '../types'
import { isGalaxyType } from '../catalog/surfaceBrightness'
import { WEIGHTS } from './score'

/**
 * Contrast in magnitudes: target surface brightness minus effective sky (both mag/arcsec²).
 * Larger = target fainter relative to the sky. Null when surface brightness is unknown.
 * Galaxies use surfBr − WEIGHTS.galaxySbOffsetMag (D25 B-band mean → V-band bright body).
 */
export function contrastMag(t: Target, effSky: number): number | null {
  if (t.surfBr === null) return null
  return t.surfBr - (isGalaxyType(t.type) ? WEIGHTS.galaxySbOffsetMag : 0) - effSky
}

/**
 * Too faint when contrast exceeds Settings.faintLimitMag (default 4.0 mag, tuned on the spec §7.10
 * regression set: NGC 7000 dual-band half Moon OK; M101 dual-band half Moon and full Moon too faint;
 * M101 new Moon no filter OK).
 * Unknown contrast is never too faint.
 */
export function isTooFaint(contrast: number | null, s: Settings): boolean {
  return contrast !== null && contrast > s.faintLimitMag
}
