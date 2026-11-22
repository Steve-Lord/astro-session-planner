import { describe, expect, it } from 'vitest'
import { angDiff, cameraDirection, circularMean, wrap360 } from '../../src/lib/sweep/orientation'

// --- Independent quaternion implementation (does not share code with the module) ---
type Quat = [number, number, number, number] // w, x, y, z
const D2R = Math.PI / 180
function axisQuat(axis: [number, number, number], deg: number): Quat {
  const h = (deg * D2R) / 2
  const s = Math.sin(h)
  return [Math.cos(h), axis[0] * s, axis[1] * s, axis[2] * s]
}
function qmul(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a
  const [bw, bx, by, bz] = b
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ]
}
function rotate(q: Quat, v: [number, number, number]): [number, number, number] {
  const conj: Quat = [q[0], -q[1], -q[2], -q[3]]
  const r = qmul(qmul(q, [0, v[0], v[1], v[2]]), conj)
  return [r[1], r[2], r[3]]
}
/** Rear-camera direction in the earth frame (X=East, Y=North, Z=Up) via q = Z(α)·X(β)·Y(γ). */
function quatCameraDir(alpha: number, beta: number, gamma: number): [number, number, number] {
  const q = qmul(qmul(axisQuat([0, 0, 1], alpha), axisQuat([1, 0, 0], beta)), axisQuat([0, 1, 0], gamma))
  return rotate(q, [0, 0, -1])
}
function dirFromAltAz(alt: number, az: number): [number, number, number] {
  const ca = Math.cos(alt * D2R)
  return [ca * Math.sin(az * D2R), ca * Math.cos(az * D2R), Math.sin(alt * D2R)]
}

describe('cameraDirection', () => {
  it('upright portrait facing north is level, north, no roll', () => {
    const r = cameraDirection(0, 90, 0)
    expect(r.alt).toBeCloseTo(0, 9)
    expect(r.azRel).toBeCloseTo(0, 9)
    expect(r.roll).toBeCloseTo(0, 9)
  })
  it('alpha 90 (rotated counter-clockwise seen from above) faces west', () => {
    expect(cameraDirection(90, 90, 0).azRel).toBeCloseTo(270, 9)
  })
  it('beta 120 tilts the camera up 30°, beta 60 down 30°', () => {
    expect(cameraDirection(0, 120, 0).alt).toBeCloseTo(30, 9)
    expect(cameraDirection(0, 60, 0).alt).toBeCloseTo(-30, 9)
  })
  it('flat face-up points the camera straight down', () => {
    expect(cameraDirection(0, 0, 0).alt).toBeCloseTo(-90, 9)
  })
  it('portrait turned 15° about the camera axis: roll ±15, direction unchanged', () => {
    // Upright facing north, then rotated about the camera axis. In the W3C Z-X-Y angles this is
    // (α, β, γ) = (90, 75, −90) for the top tipping west, (−90, 75, 90) for the top tipping east.
    const ccw = cameraDirection(90, 75, -90)
    expect(Math.abs(ccw.roll - -15)).toBeLessThan(0.5)
    expect(Math.abs(ccw.alt)).toBeLessThan(0.5)
    expect(Math.abs(angDiff(ccw.azRel, 0))).toBeLessThan(0.5)
    const cw = cameraDirection(-90, 75, 90)
    expect(Math.abs(cw.roll - 15)).toBeLessThan(0.5)
    expect(Math.abs(cw.alt)).toBeLessThan(0.5)
    expect(Math.abs(angDiff(cw.azRel, 0))).toBeLessThan(0.5)
  })
  it('roll is positive when turned clockwise as seen from behind, at any heading', () => {
    // Same clockwise pose, whole body turned 30° CCW seen from above (camera now faces azimuth 330).
    const r = cameraDirection(-60, 75, 90)
    expect(r.roll).toBeCloseTo(15, 6)
    expect(r.azRel).toBeCloseTo(330, 6)
  })
  it('matches an independent quaternion implementation for 1000 random poses', () => {
    let seed = 12345
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    for (let i = 0; i < 1000; i++) {
      const a = rand() * 360
      const b = 60 + rand() * 60
      const g = -90 + rand() * 180
      const { alt, azRel } = cameraDirection(a, b, g)
      const got = dirFromAltAz(alt, azRel)
      const want = quatCameraDir(a, b, g)
      for (let k = 0; k < 3; k++) expect(Math.abs(got[k] - want[k])).toBeLessThan(1e-9)
    }
  })
})

describe('angle helpers', () => {
  it('wrap360 normalises into [0, 360)', () => {
    expect(wrap360(-10)).toBe(350)
    expect(wrap360(370)).toBe(10)
    expect(wrap360(360)).toBe(0)
  })
  it('angDiff is the signed shortest turn from a to b', () => {
    expect(angDiff(350, 10)).toBeCloseTo(20, 9)
    expect(angDiff(10, 350)).toBeCloseTo(-20, 9)
    expect(Math.abs(angDiff(0, 180))).toBeCloseTo(180, 9)
  })
  it('circularMean averages across the 0/360 seam', () => {
    const m = circularMean([350, 10])
    expect(Math.min(Math.abs(m), Math.abs(m - 360))).toBeLessThan(1e-9)
    expect(circularMean([80, 100])).toBeCloseTo(90, 9)
  })
})
