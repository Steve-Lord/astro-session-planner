// Device-orientation maths: where the rear camera points, from W3C DeviceOrientation angles.
// Earth frame: X = East, Y = North, Z = Up. Device frame: X = right edge, Y = top edge, Z = out of
// the screen. W3C: R = Rz(α)·Rx(β)·Ry(γ) maps device vectors into the earth frame.

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

export type OrientationSample = {
  t: number
  alt: number
  /** Gyro-referenced azimuth from cameraDirection (east of the alpha reference); used to detect compass jumps. */
  azRel: number
  azMag: number
  roll: number
  absolute: boolean
  compassAccuracy: number | null
}

export function wrap360(a: number): number {
  const r = (a % 360) + (a < 0 ? 360 : 0)
  return r >= 360 || r === 0 ? 0 : r // folds −0 and float round-up to 360 into 0
}

/** Signed shortest turn from a to b, in −180..180. */
export function angDiff(a: number, b: number): number {
  const d = wrap360(b - a)
  return d > 180 ? d - 360 : d
}

export function circularMean(degs: number[]): number {
  let s = 0
  let c = 0
  for (const d of degs) {
    s += Math.sin(d * D2R)
    c += Math.cos(d * D2R)
  }
  return wrap360(Math.atan2(s, c) * R2D)
}

type Vec = [number, number, number]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

export function cameraDirection(alpha: number, beta: number, gamma: number): { alt: number; azRel: number; roll: number } {
  const ca = Math.cos(alpha * D2R), sa = Math.sin(alpha * D2R)
  const cb = Math.cos(beta * D2R), sb = Math.sin(beta * D2R)
  const cg = Math.cos(gamma * D2R), sg = Math.sin(gamma * D2R)
  // Rear camera looks along device −Z: d = −R·ẑ.
  const d: Vec = [-(ca * sg + cg * sa * sb), -(sa * sg - ca * cg * sb), -(cb * cg)]
  const alt = Math.asin(Math.max(-1, Math.min(1, d[2]))) * R2D
  const azRel = wrap360(Math.atan2(d[0], d[1]) * R2D)

  // Roll: signed angle from the projection of world Up onto the plane ⟂ d, to the device +Y axis
  // (R·ŷ), measured right-handed about d. 0 = upright portrait; POSITIVE = phone turned CLOCKWISE as
  // seen from behind it (looking the way the camera looks), i.e. the top edge tipping to the right.
  // Undefined when the camera points straight up/down (Up projects to nothing): returns 0 there.
  const y: Vec = [-sa * cb, ca * cb, sb]
  const u: Vec = [-d[2] * d[0], -d[2] * d[1], 1 - d[2] * d[2]] // Up − (Up·d)d
  const roll = dot(u, u) < 1e-18 ? 0 : Math.atan2(dot(d, cross(u, y)), dot(u, y)) * R2D
  return { alt, azRel, roll }
}
