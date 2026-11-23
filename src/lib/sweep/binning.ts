// Sweep accumulator: filters orientation samples, bins them by true azimuth (1° bins) and builds a
// HorizonProfile. Unswept directions are never treated as open sky: large gaps must be resolved
// by the caller (re-sweep, or an explicit fill that marks them in `unswept`).
import type { HorizonProfile } from '../types'
import { angDiff, wrap360, type OrientationSample } from './orientation'

export type Rejection = 'invalid' | 'roll' | 'fast' | 'compass-jump' | 'not-upright' | 'low-accuracy'

const D2R = Math.PI / 180
const R2D = 180 / Math.PI
const MIN_ALT = -10
const MAX_ALT = 80
const MAX_ACCURACY_DEG = 25
const MAX_COMPASS_JUMP_DEG = 8
/** Accepted samples over this span set the compass-minus-gyro baseline (median). */
const BASELINE_WARMUP_MS = 2000
/** Time constant of the baseline EMA afterwards: slow enough that a ramped disturbance cannot drag it along, fast enough to follow gyro drift. */
const BASELINE_TAU_MS = 10_000

/** Great-circle angle (degrees) between two (alt, az) directions. */
function greatCircleDeg(alt1: number, az1: number, alt2: number, az2: number): number {
  const a1 = alt1 * D2R, a2 = alt2 * D2R
  const dAz = (az2 - az1) * D2R
  const cos = Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos(dAz)
  const sin = Math.hypot(Math.cos(a2) * Math.sin(dAz), Math.cos(a1) * Math.sin(a2) - Math.sin(a1) * Math.cos(a2) * Math.cos(dAz))
  return Math.atan2(sin, cos) * R2D
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export class SweepAccumulator {
  private readonly declinationDeg: number
  private readonly offsetDeg: number
  private readonly maxRollDeg: number
  private readonly maxRateDegPerS: number
  private readonly maxGapFillDeg: number
  private readonly bins: number[][] = Array.from({ length: 360 }, () => [])
  private prev: OrientationSample | null = null
  private accepted = 0
  // Compass-minus-gyro offset (angDiff(azRel, azMag)). Warm-up offsets are stored relative to the first one.
  private warm: { t0: number; first: number; rel: number[] } | null = null
  private baseline: number | null = null
  private lastAcceptedT = 0

  constructor(opts: { declinationDeg: number; offsetDeg?: number; maxRollDeg?: number; maxRateDegPerS?: number; maxGapFillDeg?: number }) {
    this.declinationDeg = opts.declinationDeg
    this.offsetDeg = opts.offsetDeg ?? 0
    this.maxRollDeg = opts.maxRollDeg ?? 20
    this.maxRateDegPerS = opts.maxRateDegPerS ?? 30
    this.maxGapFillDeg = opts.maxGapFillDeg ?? 5
  }

  add(s: OrientationSample): { accepted: true; azTrue: number } | { accepted: false; reason: Rejection } {
    // Non-finite angles (sensor glitches) are dropped first and never become the reference sample.
    if (![s.alt, s.azMag, s.azRel, s.roll].every(Number.isFinite)) return { accepted: false, reason: 'invalid' }
    const prev = this.prev
    this.prev = s // speed / jump checks always compare against the previous *received* sample
    const reason = this.reject(s, prev)
    if (reason) return { accepted: false, reason }
    this.track(s)
    const azTrue = wrap360(s.azMag + this.declinationDeg + this.offsetDeg)
    this.bins[Math.floor(azTrue) % 360].push(s.alt)
    this.accepted++
    return { accepted: true, azTrue }
  }

  private reject(s: OrientationSample, prev: OrientationSample | null): Rejection | null {
    if (s.alt < MIN_ALT || s.alt > MAX_ALT) return 'not-upright'
    if (Math.abs(s.roll) > this.maxRollDeg) return 'roll'
    if (s.compassAccuracy !== null && (s.compassAccuracy < 0 || s.compassAccuracy > MAX_ACCURACY_DEG)) return 'low-accuracy'
    // Speed from the gyro (azRel): a compass jump must not read as the user turning fast.
    if (prev) {
      const dt = (s.t - prev.t) / 1000
      if (dt > 0 && greatCircleDeg(prev.alt, prev.azRel, s.alt, s.azRel) / dt > this.maxRateDegPerS) return 'fast'
    }
    // Compass disturbance: the compass-minus-gyro offset strays from its slow baseline. Held or ramped
    // shifts keep being rejected, because the baseline only learns from accepted samples.
    const ref = this.reference()
    if (ref !== null && Math.abs(angDiff(ref, angDiff(s.azRel, s.azMag))) > MAX_COMPASS_JUMP_DEG) return 'compass-jump'
    return null
  }

  /** Baseline offset, or during warm-up the median so far; null before the first accepted sample. */
  private reference(): number | null {
    if (this.baseline !== null) return this.baseline
    if (!this.warm) return null
    return this.warm.first + median(this.warm.rel)
  }

  /** Learns the baseline from an accepted sample. */
  private track(s: OrientationSample): void {
    const o = angDiff(s.azRel, s.azMag)
    if (this.baseline !== null) {
      const dt = Math.max(0, s.t - this.lastAcceptedT)
      this.baseline += angDiff(this.baseline, o) * (1 - Math.exp(-dt / BASELINE_TAU_MS))
    } else if (!this.warm) {
      this.warm = { t0: s.t, first: o, rel: [0] }
    } else {
      this.warm.rel.push(angDiff(this.warm.first, o))
      if (s.t - this.warm.t0 >= BASELINE_WARMUP_MS) {
        this.baseline = this.warm.first + median(this.warm.rel)
        this.warm = null
      }
    }
    this.lastAcceptedT = s.t
  }

  /**
   * Forgets the previous sample and the compass baseline (call on resume after a pause): the gyro
   * reference restarts with the sensors, so the old offset no longer applies. Bins are kept.
   */
  resetReference(): void {
    this.prev = null
    this.warm = null
    this.baseline = null
  }

  coverage(): { swept: number; total: 360; bins: boolean[] } {
    const bins = this.bins.map(b => b.length > 0)
    return { swept: bins.filter(Boolean).length, total: 360, bins }
  }

  /** Wrap-aware runs of unswept bins longer than maxGapFillDeg, inclusive. */
  largeGaps(): { from: number; to: number }[] {
    return this.gapRuns().filter(g => g.len > this.maxGapFillDeg).map(g => ({ from: g.from, to: (g.from + g.len - 1) % 360 }))
  }

  /** All maximal unswept runs. Empty if nothing is swept; a single swept bin leaves one 359-long run. */
  private gapRuns(): { from: number; len: number }[] {
    const swept = this.bins.map(b => b.length > 0)
    const start = swept.indexOf(true)
    if (start < 0) return []
    const runs: { from: number; len: number }[] = []
    let from = -1
    for (let k = 1; k <= 360; k++) {
      const i = (start + k) % 360
      if (!swept[i]) {
        if (from < 0) from = i
      } else if (from >= 0) {
        runs.push({ from, len: (i - from + 360) % 360 })
        from = -1
      }
    }
    return runs
  }

  toProfile(opts?: { fillLargeGaps?: boolean }): HorizonProfile {
    if (this.accepted === 0) throw new Error('Nothing was swept yet')
    const large = this.largeGaps()
    if (large.length > 0 && !opts?.fillLargeGaps) {
      throw new Error(`Unswept gaps remain: ${large.map(g => `${g.from}°–${g.to}°`).join(', ')}`)
    }
    const altitudes = this.bins.map(b => (b.length ? Math.min(90, Math.max(0, median(b))) : NaN))
    const unswept = new Array<boolean>(360).fill(false)
    for (const g of this.gapRuns()) {
      const lo = (g.from + 359) % 360 // swept bin before the run
      const hi = (g.from + g.len) % 360 // swept bin after the run
      const a = altitudes[lo], b = altitudes[hi]
      const isLarge = g.len > this.maxGapFillDeg
      for (let k = 1; k <= g.len; k++) {
        const i = (g.from + k - 1) % 360
        altitudes[i] = a + ((b - a) * k) / (g.len + 1)
        if (isLarge) unswept[i] = true
      }
    }
    return {
      altitudes,
      seasonal: new Array<boolean>(360).fill(false),
      leafOffAltitudes: new Array<number>(360).fill(0),
      northOffsetDeg: this.offsetDeg,
      createdAt: new Date().toISOString(),
      source: 'sweep',
      calibration: null,
      sweptHere: true,
      ...(unswept.some(Boolean) ? { unswept } : {}),
    }
  }
}
