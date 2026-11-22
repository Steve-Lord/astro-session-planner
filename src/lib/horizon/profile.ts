import type { HorizonProfile } from '../types';

const N = 360;
const mod = (n: number) => ((n % N) + N) % N;

export function flatProfile(): HorizonProfile {
  return {
    altitudes: new Array<number>(N).fill(0),
    seasonal: new Array<boolean>(N).fill(false),
    leafOffAltitudes: new Array<number>(N).fill(0),
    northOffsetDeg: 0,
    createdAt: new Date().toISOString(),
    source: 'manual',
  };
}

function valueAt(p: HorizonProfile, i: number, treesBare: boolean): number {
  const k = mod(i);
  return p.seasonal[k] && treesBare ? p.leafOffAltitudes[k] : p.altitudes[k];
}

/** Obstruction height (deg) at an azimuth, linearly interpolated with wrap. */
export function heightAt(p: HorizonProfile | null, az: number, treesBare: boolean): number {
  if (!p) return 0;
  const a = mod(az);
  const i0 = Math.floor(a);
  const f = a - i0;
  const h0 = valueAt(p, i0, treesBare);
  if (f === 0) return h0;
  return h0 + (valueAt(p, i0 + 1, treesBare) - h0) * f;
}

/** True if the camera frame centred at (alt, az) clears the horizon plus clearance. */
export function frameClears(
  p: HorizonProfile | null,
  treesBare: boolean,
  alt: number,
  az: number,
  halfDiagDeg: number,
  clearanceDeg: number,
): boolean {
  const span = halfDiagDeg / Math.max(Math.cos((alt * Math.PI) / 180), 0.1);
  const bottom = alt - halfDiagDeg;
  const blocked = (a: number) => {
    const h = heightAt(p, a, treesBare);
    return !Number.isFinite(h) || bottom < h + clearanceDeg;
  };
  // Exact span endpoints and centre, plus every integer azimuth in between.
  if (blocked(az - span) || blocked(az) || blocked(az + span)) return false;
  for (let a = Math.ceil(az - span); a <= Math.floor(az + span); a++) {
    if (blocked(a)) return false;
  }
  return true;
}

/** New profile with altitudes set over a clockwise range fromAz..toAz inclusive (wraps through 0). */
export function setRange(p: HorizonProfile, fromAz: number, toAz: number, alt: number): HorizonProfile {
  const altitudes = p.altitudes.slice();
  const from = mod(Math.round(fromAz));
  const to = mod(Math.round(toAz));
  const len = mod(to - from) + 1;
  for (let k = 0; k < len; k++) altitudes[mod(from + k)] = alt;
  return {
    ...p,
    altitudes,
    seasonal: p.seasonal.slice(),
    leafOffAltitudes: p.leafOffAltitudes.slice(),
  };
}
