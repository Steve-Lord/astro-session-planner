import type { EmissionClass, FilterKind, Settings, Site } from '../types';

/** Zenith sky brightness (mag/arcsec²) per Bortle class; index = class − 1. */
export const BORTLE_SQM = [21.9, 21.6, 21.4, 20.8, 20.1, 19.3, 18.6, 18.0, 17.5];

export const DEFAULT_SETTINGS: Settings = {
  // faintLimitMag 5.0 → 4.0 (C1, with WEIGHTS.galaxySbOffsetMag 1.25): calibrated on the §7.10 set in
  // tests/unit/regression.test.ts — M101/NGC 2403 OK on a new Moon and too faint at full Moon,
  // NGC 7000/IC 1805/NGC 281/IC 434 OK with dual-band, Heart and Pacman too faint unfiltered at Bortle 6.
  clearanceDeg: 2, darkSunAlt: -18, faintLimitMag: 4.0,
  dualBandGainMag: 2.5, narrowbandGainMag: 3.5, broadbandFilterPenaltyMag: 0.3, tooSmallFill: 0.05,
};

const DEFAULT_SQM = 19.3;
const RAD = Math.PI / 180;

export function baselineSqm(sky: Site['sky']): number {
  if (sky.sqm !== undefined) return sky.sqm;
  if (sky.bortle !== undefined) {
    const v = BORTLE_SQM[Math.round(sky.bortle) - 1];
    if (v !== undefined) return v;
  }
  return DEFAULT_SQM;
}

const sqmToNl = (sqm: number): number => 34.08 * Math.exp(20.7233 - 0.92104 * sqm);
const nlToSqm = (nl: number): number => (20.7233 - Math.log(nl / 34.08)) / 0.92104;

/** Airmass for zenith distance z (degrees), Krisciunas & Schaefer form. */
function airmass(zDeg: number): number {
  const s = Math.sin(zDeg * RAD);
  return Math.pow(1 - 0.96 * s * s, -0.5);
}

/**
 * Sky brightness (mag/arcsec²) with moonlight added, Krisciunas & Schaefer (1991).
 * Moon at or below the horizon, or zero illumination, returns baseSqm.
 */
export function moonlitSqm(baseSqm: number, moonAlt: number, moonIllum: number, targetAlt: number, sepDeg: number): number {
  if (moonAlt <= 0 || moonIllum <= 0) return baseSqm;
  const k = 0.172;
  const alpha = Math.acos(Math.min(1, Math.max(-1, 2 * moonIllum - 1))) / RAD;   // phase angle, degrees
  const istar = Math.pow(10, -0.4 * (3.84 + 0.026 * Math.abs(alpha) + 4e-9 * Math.pow(alpha, 4)));
  const cosRho = Math.cos(sepDeg * RAD);
  const f = Math.pow(10, 5.36) * (1.06 + cosRho * cosRho) + Math.pow(10, 6.15 - sepDeg / 40);
  const zMoon = 90 - moonAlt;
  const zTarget = 90 - Math.max(0, targetAlt);
  const bMoon = f * istar * Math.pow(10, -0.4 * k * airmass(zMoon)) * (1 - Math.pow(10, -0.4 * k * airmass(zTarget)));
  return nlToSqm(sqmToNl(baseSqm) + bMoon);
}

/** Effective sky brightness seen by the target through a filter (larger = darker). */
export function effectiveSky(sqm: number, emission: EmissionClass, filter: FilterKind, s: Settings): number {
  const gain = filter === 'dual-band' ? s.dualBandGainMag : filter === 'narrowband' ? s.narrowbandGainMag : null;
  if (gain === null) return sqm;
  if (emission === 'emission') return sqm + gain;
  if (emission === 'mixed') return sqm + gain / 2;
  return sqm - s.broadbandFilterPenaltyMag;
}
