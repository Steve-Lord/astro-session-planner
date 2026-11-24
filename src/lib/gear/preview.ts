import type { Fit, Gear, Target } from '../types';
import { PANEL_OVERLAP_FACTOR, fovArcmin } from './fit';

export interface FramePreview {
  /** Frame extent in arcminutes, long side. */
  frameW: number;
  /** Frame extent in arcminutes, short side. */
  frameH: number;
  /** Panel counts along the long and short axes; 1x1 unless the fit is a mosaic. */
  cols: number;
  rows: number;
  /** Mosaic grid extent in arcminutes. */
  gridW: number;
  gridH: number;
  /** Target outline ellipse in arcminutes, major axis along the frame's long side (as frameFit assumes); null when the size is unknown. */
  ellipse: { rx: number; ry: number } | null;
  /** Catalogued position angle in degrees, or null; informational only, never drawn. */
  posAngle: number | null;
}

export function framePreview(t: Target, g: Gear, fit: Fit): FramePreview {
  const { long: frameW, short: frameH } = fovArcmin(g);
  const [cols, rows] = fit.panels ?? [1, 1];
  const gridW = cols * PANEL_OVERLAP_FACTOR * frameW + (1 - PANEL_OVERLAP_FACTOR) * frameW;
  const gridH = rows * PANEL_OVERLAP_FACTOR * frameH + (1 - PANEL_OVERLAP_FACTOR) * frameH;

  let ellipse: FramePreview['ellipse'] = null;
  if (t.majArcmin != null) {
    const maj = t.majArcmin;
    const min = t.minArcmin ?? maj;
    ellipse = { rx: maj / 2, ry: min / 2 };
  }

  return {
    frameW, frameH, cols, rows, gridW, gridH, ellipse,
    posAngle: t.posAngle ?? null,
  };
}
