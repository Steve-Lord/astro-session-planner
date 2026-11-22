// Device-orientation plumbing: support detection, iOS permission, and the live sample stream.
import { angDiff, cameraDirection, wrap360, type OrientationSample } from './orientation'

type IOSOrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number }
type PermissionCtor = { requestPermission?: () => Promise<'granted' | 'denied' | 'default'> }

export function sensorSupport(): { secure: boolean; orientation: boolean; needsPermission: boolean; camera: boolean } {
  const ctor = typeof DeviceOrientationEvent === 'undefined' ? undefined : (DeviceOrientationEvent as unknown as PermissionCtor)
  return {
    secure: typeof window !== 'undefined' && window.isSecureContext,
    orientation: ctor !== undefined,
    needsPermission: typeof ctor?.requestPermission === 'function',
    camera: typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function',
  }
}

/** Call synchronously first thing in a tap handler: iOS rejects the request after any other await. */
export function requestMotionPermission(): Promise<'granted' | 'denied' | 'not-needed'> {
  const ctor = typeof DeviceOrientationEvent === 'undefined' ? undefined : (DeviceOrientationEvent as unknown as PermissionCtor)
  if (typeof ctor?.requestPermission !== 'function') return Promise.resolve('not-needed')
  return ctor.requestPermission().then(
    (r) => (r === 'granted' ? 'granted' : 'denied'),
    () => 'denied',
  )
}

/** Current time; e2e tests pin it with `window.__testNow` (epoch ms). */
export function now(): Date {
  const t = typeof window === 'undefined' ? undefined : (window as Window & { __testNow?: unknown }).__testNow
  return typeof t === 'number' ? new Date(t) : new Date()
}

/** Rear camera into `video` (muted, inline). Resolves to a stop function; rejects with the getUserMedia error. */
export async function startCamera(video: HTMLVideoElement | null | undefined): Promise<() => void> {
  if (!video) throw new DOMException('No video element to show the camera in', 'InvalidStateError')
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
  const stop = () => {
    for (const t of stream.getTracks()) t.stop()
    if (video.srcObject === stream) video.srcObject = null
  }
  try {
    video.muted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.srcObject = stream
  } catch (e) {
    stop() // never leave the camera on after a failure
    throw e
  }
  try {
    await video.play()
  } catch {
    // autoplay of a muted inline stream can still be refused; the frame shows once it plays
  }
  return stop
}

/** Keeps the screen on while sweeping. A no-op where the Wake Lock API is missing or refuses. */
export async function keepAwake(): Promise<() => void> {
  let sentinel: WakeLockSentinel | null = null
  let stopped = false
  const acquire = async () => {
    try {
      sentinel = (await navigator.wakeLock?.request('screen')) ?? null
      if (stopped) void sentinel?.release().catch(() => {})
    } catch {
      sentinel = null
    }
  }
  // The lock is dropped whenever the page is hidden; take it again on return.
  const onVisible = () => { if (!stopped && document.visibilityState === 'visible') void acquire() }
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return () => {}
  await acquire()
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    stopped = true
    document.removeEventListener('visibilitychange', onVisible)
    void sentinel?.release().catch(() => {})
    sentinel = null
  }
}

export type AzimuthInput = { platform: 'ios' | 'android' | 'other'; azRel: number; beta: number; compassHeading: number | null; absolute: boolean }
export type AzimuthState = { k: number | null; samples: number }

/** Offsets older than this many samples fade out, so slow gyro drift in α is tracked. */
const K_WINDOW = 100

/**
 * Ruling P1 (provisional until the owner checkpoint).
 * iOS: when the phone is within 50° of upright, webkitCompassHeading is taken as the rear-camera
 * heading, and k (a running circular mean of compassHeading − azRel) is learned; otherwise
 * azMag = azRel + k (null until k is known).
 * Android/other: an absolute α makes azRel north-referenced already; otherwise no magnetic azimuth.
 */
export function magneticAzimuth(input: AzimuthInput, state: AzimuthState): { azMag: number | null; state: AzimuthState } {
  const { platform, azRel, beta, compassHeading, absolute } = input
  if (platform === 'ios') {
    if (compassHeading !== null && Math.abs(beta - 90) < 50) {
      const delta = wrap360(compassHeading - azRel)
      const n = Math.min(state.samples + 1, K_WINDOW)
      const k = state.k === null ? delta : wrap360(state.k + angDiff(state.k, delta) / n)
      return { azMag: wrap360(compassHeading), state: { k, samples: state.samples + 1 } }
    }
    return { azMag: state.k === null ? null : wrap360(azRel + state.k), state }
  }
  return { azMag: absolute ? wrap360(azRel) : null, state }
}

export type RawReading = {
  alpha: number
  beta: number
  gamma: number
  compassHeading: number | null
  compassAccuracy: number | null
  azMag: number | null
}

/**
 * Streams orientation samples. Uses `deviceorientationabsolute` where it exists (Android Chrome),
 * else `deviceorientation` (iOS supplies webkitCompassHeading). Events with null angles (desktops
 * without sensors) are ignored, so cb may simply never be called. Samples without a magnetic
 * azimuth yet are not delivered to cb but still reach `onRaw` (used by the probe).
 */
export function startOrientation(cb: (s: OrientationSample) => void, onRaw?: (r: RawReading) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const type = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'
  let state: AzimuthState = { k: null, samples: 0 }
  const handler = (ev: Event) => {
    const e = ev as IOSOrientationEvent
    if (e.alpha === null || e.beta === null || e.gamma === null) return
    const ios = typeof e.webkitCompassHeading === 'number'
    const compassHeading = ios ? e.webkitCompassHeading! : null
    const compassAccuracy = typeof e.webkitCompassAccuracy === 'number' ? e.webkitCompassAccuracy : null
    const absolute = type === 'deviceorientationabsolute' || e.absolute === true
    const { alt, azRel, roll } = cameraDirection(e.alpha, e.beta, e.gamma)
    const platform = ios ? 'ios' : type === 'deviceorientationabsolute' ? 'android' : 'other'
    const r = magneticAzimuth({ platform, azRel, beta: e.beta, compassHeading, absolute }, state)
    state = r.state
    onRaw?.({ alpha: e.alpha, beta: e.beta, gamma: e.gamma, compassHeading, compassAccuracy, azMag: r.azMag })
    if (r.azMag !== null) cb({ t: performance.now(), alt, azRel, azMag: r.azMag, roll, absolute, compassAccuracy })
  }
  window.addEventListener(type, handler)
  return () => window.removeEventListener(type, handler)
}
