import { describe, expect, it } from 'vitest'
import { SweepAccumulator } from '../../src/lib/sweep/binning'
import type { OrientationSample } from '../../src/lib/sweep/orientation'

function skyline(az: number): number {
  if (az >= 90 && az < 150) return 30
  if (az >= 200 && az < 260) return 20
  return 3
}

let seed = 12345
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

function sample(az: number, alt: number, t: number, over: Partial<OrientationSample> = {}): OrientationSample {
  return { t, alt, azRel: az, azMag: ((az % 360) + 360) % 360, roll: 0, absolute: true, compassAccuracy: 5, ...over }
}

/** Sweep azimuths [from, to) at 3 samples/° and 100 ms per sample, with ±0.5° altitude noise. */
function sweep(acc: SweepAccumulator, from: number, to: number, t0 = 0): number {
  let t = t0
  for (let a = from; a < to; a += 1 / 3) {
    const az = a + 1 / 6 // centre of each third
    acc.add(sample(az, skyline(Math.floor(az)) + (rnd() - 0.5), t))
    t += 100
  }
  return t
}

describe('SweepAccumulator', () => {
  it('recovers a known skyline within ±1° everywhere', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    sweep(acc, 0, 360)
    expect(acc.coverage().swept).toBe(360)
    const p = acc.toProfile()
    expect(p.altitudes).toHaveLength(360)
    for (let az = 0; az < 360; az++) expect(Math.abs(p.altitudes[az] - skyline(az))).toBeLessThanOrEqual(1)
    expect(p.source).toBe('sweep')
    expect(p.sweptHere).toBe(true)
    expect(p.calibration).toBeNull()
    expect(p.northOffsetDeg).toBe(0)
    expect(p.seasonal.every(x => x === false)).toBe(true)
    expect(p.leafOffAltitudes.every(x => x === 0)).toBe(true)
  })

  it('wraps: 359.6 and 0.4 land in bins 359 and 0', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    const r1 = acc.add(sample(359.6, 5, 0))
    const r2 = acc.add(sample(0.4, 5, 100))
    expect(r1).toEqual({ accepted: true, azTrue: expect.closeTo(359.6, 6) })
    expect(r2.accepted && r2.azTrue).toBeCloseTo(0.4, 6)
    const bins = acc.coverage().bins
    expect(bins[359]).toBe(true)
    expect(bins[0]).toBe(true)
    expect(acc.coverage().swept).toBe(2)
  })

  it('interpolates a 3° gap, reports an 8° gap and refuses to build a profile', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    let t = 0
    for (let az = 0; az < 360; az++) {
      if (az >= 100 && az < 103) continue
      if (az >= 200 && az < 208) continue
      acc.add(sample(az + 0.5, 10, az * 1000))
    }
    expect(acc.largeGaps()).toEqual([{ from: 200, to: 207 }])
    expect(() => acc.toProfile()).toThrow()
    const p = acc.toProfile({ fillLargeGaps: true })
    expect(p.altitudes.every(a => a === 10)).toBe(true)
    for (let az = 200; az < 208; az++) expect(p.unswept![az]).toBe(true)
    expect(p.unswept!.filter(Boolean)).toHaveLength(8)
  })

  it('interpolates linearly across gaps (wrap-aware)', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    let t = 0
    for (let az = 0; az < 360; az++) {
      if (az >= 358 || az < 3) continue // bins 358,359,0,1,2 unswept
      acc.add(sample(az + 0.5, az === 357 ? 10 : az === 3 ? 20 : 15, az * 1000))
    }
    // 5 missing bins between 357 (10) and 3 (20): 6 steps of 10/6
    const p = acc.toProfile()
    expect(p.altitudes[358]).toBeCloseTo(10 + 10 / 6, 6)
    expect(p.altitudes[0]).toBeCloseTo(10 + (10 / 6) * 3, 6)
    expect(p.altitudes[2]).toBeCloseTo(10 + (10 / 6) * 5, 6)
    expect(p.unswept).toBeUndefined()
  })

  it('reports a gap crossing 0 as from 355 to 4', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    let t = 0
    for (let az = 5; az < 355; az++) {
      acc.add(sample(az + 0.5, 5, az * 1000))
    }
    expect(acc.largeGaps()).toEqual([{ from: 355, to: 4 }])
  })

  it('a gap of exactly maxGapFillDeg is not large', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    let t = 0
    for (let az = 0; az < 360; az++) {
      if (az >= 100 && az < 105) continue
      acc.add(sample(az + 0.5, 5, az * 1000))
    }
    expect(acc.largeGaps()).toEqual([])
  })

  it('rejects roll beyond 20°', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    expect(acc.add(sample(10, 5, 0, { roll: 25 }))).toEqual({ accepted: false, reason: 'roll' })
    expect(acc.add(sample(10, 5, 100, { roll: -25 }))).toEqual({ accepted: false, reason: 'roll' })
    expect(acc.add(sample(10, 5, 200, { roll: 20 })).accepted).toBe(true)
  })

  it('rejects not-upright altitudes outside −10..80', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    expect(acc.add(sample(10, 85, 0))).toEqual({ accepted: false, reason: 'not-upright' })
    expect(acc.add(sample(10, -15, 100))).toEqual({ accepted: false, reason: 'not-upright' })
    expect(acc.add(sample(10, 80, 10_000)).accepted).toBe(true)
    expect(acc.add(sample(10, -10, 20_000)).accepted).toBe(true)
  })

  it('rejects low or invalid compass accuracy, accepts unknown', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    expect(acc.add(sample(10, 5, 0, { compassAccuracy: 30 }))).toEqual({ accepted: false, reason: 'low-accuracy' })
    expect(acc.add(sample(10, 5, 100, { compassAccuracy: -1 }))).toEqual({ accepted: false, reason: 'low-accuracy' })
    expect(acc.add(sample(10, 5, 200, { compassAccuracy: 25 })).accepted).toBe(true)
    expect(acc.add(sample(10, 5, 300, { compassAccuracy: null })).accepted).toBe(true)
    expect(acc.add(sample(10, 5, 400, { compassAccuracy: 0, absolute: false })).accepted).toBe(true)
  })

  it('rejects a compass jump (azMag +40° while azRel +1°) and does not reject the first sample', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    expect(acc.add(sample(10, 5, 0, { azMag: 300, azRel: 10 })).accepted).toBe(true)
    const r = acc.add(sample(11, 5, 100_000, { azMag: 340, azRel: 11 }))
    expect(r).toEqual({ accepted: false, reason: 'compass-jump' })
  })

  it('a 60 Hz compass jump while standing still is a compass-jump, not fast', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    expect(acc.add(sample(10, 5, 0)).accepted).toBe(true)
    expect(acc.add(sample(10, 5, 16)).accepted).toBe(true)
    // The compass reads 40° further round 16 ms later; the gyro says the phone did not move.
    expect(acc.add(sample(10, 5, 33, { azMag: 50 }))).toEqual({ accepted: false, reason: 'compass-jump' })
  })

  it('keeps rejecting a held 15° compass shift, and accepts again once it ends', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    let t = 0
    let az = 10
    const step = (over: (az: number) => Partial<OrientationSample> = () => ({})) => {
      az += 0.2 // 12°/s at 60 Hz
      t += 1000 / 60
      return acc.add(sample(az, 5, t, over(az)))
    }
    for (let i = 0; i < 180; i++) expect(step().accepted).toBe(true) // 3 s: baseline set
    for (let i = 0; i < 120; i++) expect(step((a) => ({ azMag: a + 15 }))).toEqual({ accepted: false, reason: 'compass-jump' })
    expect(step().accepted).toBe(true)
  })

  it('rejects a slow ramp (12° over 1 s at 60 Hz) once it strays 8° from the baseline', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    let t = 0
    let az = 10
    for (let i = 0; i < 180; i++) { az += 0.2; t += 1000 / 60; expect(acc.add(sample(az, 5, t)).accepted).toBe(true) }
    const results: { shift: number; accepted: boolean }[] = []
    for (let i = 1; i <= 120; i++) {
      az += 0.2; t += 1000 / 60
      const shift = Math.min(12, (12 * i) / 60) // +0.2° per sample for 1 s, then held at 12°
      results.push({ shift, accepted: acc.add(sample(az, 5, t, { azMag: az + shift })).accepted })
    }
    // Every sample more than 8.5° off is rejected (the baseline may have crept ≲0.5° towards it).
    for (const r of results) if (r.shift > 8.5) expect(r.accepted).toBe(false)
    expect(results.filter((r) => r.shift <= 7).every((r) => r.accepted)).toBe(true)
  })

  it('follows slow gyro drift without rejecting', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    let t = 0
    // azRel drifts 10° per minute relative to the compass over a 90 s sweep.
    for (let i = 0; i < 90 * 60; i++) {
      t += 1000 / 60
      const az = (i * 4) / 60 // 4°/s
      expect(acc.add(sample(az, 5, t, { azRel: az + (10 * t) / 60_000 })).accepted).toBe(true)
    }
  })

  it('resetReference forgets the baseline and the previous sample but keeps the bins', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    let t = 0
    for (let i = 0; i < 180; i++) { t += 1000 / 60; acc.add(sample(10 + i * 0.1, 5, t)) }
    const swept = acc.coverage().swept
    acc.resetReference()
    // After a resume the gyro frame has moved 70° and the sample comes right after: neither fast nor a jump.
    expect(acc.add(sample(30, 5, t + 1, { azRel: 100 })).accepted).toBe(true)
    expect(acc.add(sample(30.1, 5, t + 17, { azRel: 100.1 })).accepted).toBe(true)
    expect(acc.coverage().swept).toBeGreaterThanOrEqual(swept)
  })

  it('rejects angular speed over 30°/s from the gyro, using great-circle distance', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    acc.add(sample(10, 5, 0))
    expect(acc.add(sample(15, 5, 100)).accepted).toBe(false) // 50°/s
    expect(acc.add(sample(15, 5, 100 + 1000)).accepted).toBe(true)
    // near the zenith, a large azimuth change is a tiny great-circle move
    const z = new SweepAccumulator({ declinationDeg: 0 })
    z.add(sample(0, 79, 0, { azRel: 0 }))
    expect(z.add(sample(60, 79, 1000, { azRel: 60 })).accepted).toBe(true) // 60° of azimuth but only ~11° on the sky in 1 s
  })

  it('skips the speed check when dt <= 0', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    acc.add(sample(10, 5, 100))
    expect(acc.add(sample(12, 5, 100)).accepted).toBe(true)
    expect(acc.add(sample(14, 5, 50)).accepted).toBe(true)
  })

  it('reports only the first failing reason, in the documented order', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    acc.add(sample(10, 5, 0))
    const all = sample(90, 85, 10, { roll: 40, compassAccuracy: 90 })
    expect(acc.add(all)).toEqual({ accepted: false, reason: 'not-upright' })
    expect(acc.add({ ...all, alt: 5, t: 20 })).toEqual({ accepted: false, reason: 'roll' })
    expect(acc.add({ ...all, alt: 5, roll: 0, t: 30 })).toEqual({ accepted: false, reason: 'low-accuracy' })
    expect(acc.add({ ...all, alt: 5, roll: 0, compassAccuracy: 5, azMag: 300, azRel: 100, t: 40 })).toEqual({ accepted: false, reason: 'fast' })
    expect(acc.add({ ...all, alt: 5, roll: 0, compassAccuracy: 5, azMag: 300, azRel: 90, t: 100_000 })).toEqual({ accepted: false, reason: 'compass-jump' })
  })

  it('declination 2° shifts the roof edge by +2 bins', () => {
    const run = (decl: number) => {
      const acc = new SweepAccumulator({ declinationDeg: decl })
      let t = 0
      for (let a = 0; a < 360; a += 1 / 3) {
        const mag = a + 1 / 6
        // identical raw readings every run; only the declination differs
        acc.add(sample(mag, skyline(Math.floor(mag)), t))
        t += 100
      }
      return acc.toProfile().altitudes
    }
    const edge = (alts: number[]) => alts.findIndex(a => a > 20)
    expect(edge(run(2))).toBe(edge(run(0)) + 2)
  })

  it('applies offsetDeg and reports it as northOffsetDeg', () => {
    const acc = new SweepAccumulator({ declinationDeg: 2, offsetDeg: -3 })
    const r = acc.add(sample(100, 5, 0))
    expect(r.accepted && r.azTrue).toBeCloseTo(99, 9)
    for (let az = 0; az < 360; az += 1) acc.add(sample(az + 0.5, 5, 1000 + az * 100))
    expect(acc.toProfile().northOffsetDeg).toBe(-3)
  })

  it('median resists a single 60° outlier in a bin', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    let t = 0
    for (let az = 0; az < 360; az++) {
      acc.add(sample(az + 0.2, 5, t)); t += 100
      acc.add(sample(az + 0.5, az === 50 ? 60 : 5, t)); t += 100
      acc.add(sample(az + 0.8, 5, t)); t += 100
    }
    expect(acc.toProfile().altitudes[50]).toBe(5)
  })

  it('uses the even-count average median and clamps to 0–90', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    let t = 0
    for (let az = 0; az < 360; az++) {
      acc.add(sample(az + 0.3, az === 7 ? 4 : -8, t)); t += 1000
      acc.add(sample(az + 0.6, az === 7 ? 6 : -4, t)); t += 1000
    }
    const p = acc.toProfile()
    expect(p.altitudes[7]).toBe(5)
    expect(p.altitudes[8]).toBe(0)
  })

  it('throws "Nothing was swept yet" with zero accepted samples', () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    acc.add(sample(10, 5, 0, { roll: 40 }))
    expect(() => acc.toProfile()).toThrow('Nothing was swept yet')
    expect(() => acc.toProfile({ fillLargeGaps: true })).toThrow('Nothing was swept yet')
  })

  it("rejects non-finite samples as 'invalid' before any other check, without disturbing the next sample", () => {
    const acc = new SweepAccumulator({ declinationDeg: 0 })
    expect(acc.add(sample(10, 5, 0))).toEqual({ accepted: true, azTrue: 10 })
    for (const over of [{ alt: NaN }, { azMag: NaN }, { azRel: Infinity }, { roll: -Infinity }, { alt: NaN, roll: 90 }]) {
      expect(acc.add(sample(11, 5, 100, over))).toEqual({ accepted: false, reason: 'invalid' })
    }
    // The previous good sample is still the reference: 2° in 200 ms is fine.
    expect(acc.add(sample(12, 5, 200)).accepted).toBe(true)
    expect(acc.coverage().swept).toBe(2)
  })
})
