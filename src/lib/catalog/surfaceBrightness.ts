/**
 * Types whose catalogued magnitude is the object's own integrated light, so mean surface brightness
 * can be estimated from magnitude and size. For Cl+N, RfN, Neb, OCl and GCl the catalogued magnitude
 * is usually an illuminating star or an embedded cluster (IC 444, NGC 7023, IC 5146), which made the
 * estimate 2–4 mag too bright; those stay null (unknown) unless data/addendum.json supplies a value.
 */
const ESTIMABLE = new Set(['G', 'GPair', 'GTrpl', 'GGroup', 'PN', 'HII', 'EmN', 'SNR'])
const GALAXY = new Set(['G', 'GPair', 'GTrpl', 'GGroup'])

export const isGalaxyType = (type: string): boolean => GALAXY.has(type)

const usable = (v: number | null): v is number => v !== null && Number.isFinite(v)

/**
 * Mean surface brightness (mag/arcsec²) of an ellipse maj × min arcmin holding integrated magnitude
 * `mag`: mag + 2.5·log10(π/4 · maj · min · 3600). Null for types where the magnitude is not the
 * object's own light, or when magnitude/size are missing.
 */
export function estimateSurfBr(type: string, mag: number | null, majArcmin: number | null,
  minArcmin: number | null): number | null {
  if (!ESTIMABLE.has(type) || !usable(mag) || !usable(majArcmin) || !usable(minArcmin)) return null
  if (majArcmin <= 0 || minArcmin <= 0) return null
  return mag + 2.5 * Math.log10((Math.PI / 4) * majArcmin * minArcmin * 3600)
}
