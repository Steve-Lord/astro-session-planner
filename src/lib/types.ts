export type EmissionClass = 'emission' | 'broadband' | 'mixed';
export type FilterKind = 'none' | 'broadband-lp' | 'dual-band' | 'narrowband';
export interface HorizonCalibration { target: string; at: string; residualAltDeg: number; }
export interface HorizonProfile { altitudes: number[]; seasonal: boolean[]; leafOffAltitudes: number[];
  northOffsetDeg: number; createdAt: string; source: 'sweep' | 'manual' | 'import';   // arrays length 360, index = true azimuth°
  calibration: HorizonCalibration | null;   // null = uncalibrated
  unswept?: boolean[]; }                    // true where the sweep had no data (sweep-sourced only; absent = all swept)
export interface Site { id: string; name: string; lat: number; lon: number; elevation: number; timezone: string;
  sky: { bortle?: number; sqm?: number }; horizon: HorizonProfile | null; treesBare: boolean; isDefault: boolean; }
export interface Filter { id: string; name: string; kind: FilterKind; }
export interface Gear { id: string; name: string; focalLengthMm: number; sensorWmm: number; sensorHmm: number;
  pixelUm: number; mount: 'altaz' | 'eq'; minAltDeg: number; maxAltDeg: number; filters: Filter[]; builtIn: boolean; }
export interface Target { id: string; names: string[]; ra: number; dec: number;   // J2000 degrees
  type: string; majArcmin: number | null; minArcmin: number | null; posAngle: number | null;
  mag: number | null; surfBr: number | null;   // mag/arcsec²
  emission: EmissionClass; }
export interface Settings { clearanceDeg: number; darkSunAlt: -18 | -12; faintLimitMag: number;
  dualBandGainMag: number; narrowbandGainMag: number; broadbandFilterPenaltyMag: number; tooSmallFill: number; }
export interface TimeWindow { start: number; end: number; }   // epoch ms
export type FitLabel = 'too-small' | 'good' | 'tight' | 'mosaic' | 'size-unknown';
export interface Fit { label: FitLabel; fill: number | null; panels: [number, number] | null; }
export type HiddenReason = 'blocked' | 'too-small' | 'too-faint';
export interface ScoreBreakdown { hours: number; altitude: number; fit: number; contrast: number; moon: number; }
export interface PlanEntry { target: Target; windows: TimeWindow[]; totalHours: number; best: TimeWindow; peakAlt: number;
  fit: Fit; contrastMag: number | null; minMoonSepDeg: number | null; score: number; breakdown: ScoreBreakdown; }
export interface NightPlan { siteId: string; date: string; darkWindow: TimeWindow | null; darkSunAltUsed: -18 | -12;
  noAstroDark: boolean; moon: { illumination: number; rise: number | null; set: number | null };
  entries: PlanEntry[]; hidden: Record<HiddenReason, Target[]>; }
