import type { Fit, Gear, Target } from '../types';

export const SEESTAR_S50_PRO: Gear = {
  id: 'seestar-s50-pro',
  name: 'Seestar S50 Pro',
  focalLengthMm: 260,
  sensorWmm: 11.14,
  sensorHmm: 6.26,
  pixelUm: 2.9,
  mount: 'altaz',
  minAltDeg: 15,
  maxAltDeg: 80,
  filters: [
    { id: 'none', name: 'No filter', kind: 'none' },
    { id: 'dual-band', name: 'Dual-band (Hα/OIII)', kind: 'dual-band' },
  ],
  builtIn: true,
};

/** Upper altitude limit per mount: alt-az tracking fails near the zenith; a polar-aligned wedge does not. */
export const MOUNT_MAX_ALT: Record<Gear['mount'], number> = { altaz: 80, eq: 90 };

/** A copy of `g` on the given mount, with the matching upper altitude limit. */
export function withMount(g: Gear, mount: Gear['mount']): Gear {
  return { ...g, mount, maxAltDeg: MOUNT_MAX_ALT[mount] };
}

const RAD_TO_ARCMIN = (180 / Math.PI) * 60;

function angleArcmin(sizeMm: number, focalMm: number): number {
  return 2 * Math.atan(sizeMm / (2 * focalMm)) * RAD_TO_ARCMIN;
}

export function fovArcmin(g: Gear): { long: number; short: number; halfDiagDeg: number } {
  const w = angleArcmin(g.sensorWmm, g.focalLengthMm);
  const h = angleArcmin(g.sensorHmm, g.focalLengthMm);
  const diagMm = Math.hypot(g.sensorWmm, g.sensorHmm);
  const halfDiagDeg = angleArcmin(diagMm, g.focalLengthMm) / 60 / 2;
  return { long: Math.max(w, h), short: Math.min(w, h), halfDiagDeg };
}

export const PANEL_OVERLAP_FACTOR = 0.85; // each panel contributes 85% of its extent (15% overlap)
const TIGHT_FILL = 0.8;

// posAngle is ignored in v1: the target's long axis is assumed to lie along the frame's long axis.
export function frameFit(t: Target, g: Gear, tooSmallFill: number): Fit {
  if (t.majArcmin == null) return { label: 'size-unknown', fill: null, panels: null };
  const { long, short } = fovArcmin(g);
  const maj = t.majArcmin;
  const min = t.minArcmin ?? maj;
  const fill = maj / long;
  if (fill < tooSmallFill) return { label: 'too-small', fill, panels: null };
  if (maj > long || min > short) {
    const panels: [number, number] = [
      Math.ceil(maj / (PANEL_OVERLAP_FACTOR * long)),
      Math.ceil(min / (PANEL_OVERLAP_FACTOR * short)),
    ];
    return { label: 'mosaic', fill, panels };
  }
  if (fill > TIGHT_FILL) return { label: 'tight', fill, panels: null };
  return { label: 'good', fill, panels: null };
}
