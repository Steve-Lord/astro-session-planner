import type { Page } from '@playwright/test'

export type StubOptions = {
  /** What DeviceOrientationEvent.requestPermission resolves to. */
  permission?: 'granted' | 'denied'
  /** Remove DeviceOrientationEvent entirely (a laptop browser). */
  noOrientation?: boolean
  /** Fixed clock for now() (epoch ms). */
  testNow?: number
}

declare global {
  interface Window {
    __emitOrientation: (alpha: number, beta: number, gamma: number, compassHeading: number) => void
    __advanceTime: (ms: number) => void
    /** Every stream handed out by the stubbed getUserMedia, to check that tracks get stopped. */
    __streams: MediaStream[]
    __testNow?: number
  }
}

/**
 * Makes Chromium look like iPhone Safari to the sweep:
 * - getUserMedia returns a canvas captureStream (no camera prompt);
 * - DeviceOrientationEvent.requestPermission resolves to `permission`;
 * - `ondeviceorientationabsolute` is removed, as in Safari, so the app listens to `deviceorientation`;
 * - window.__emitOrientation(α, β, γ, heading) dispatches a `deviceorientation` Event whose alpha, beta,
 *   gamma, webkitCompassHeading and webkitCompassAccuracy (10°) are own properties.
 * Time: performance.now() is overridden to real time plus a virtual offset, and every emit advances
 * the offset by 100 ms (window.__advanceTime adds more). Samples then carry realistic, monotonic
 * spacing (1° per emit = 10°/s) while the test runs at full speed.
 */
export async function stubSensors(page: Page, opts: StubOptions = {}): Promise<void> {
  await page.addInitScript((o: StubOptions) => {
    if (o.testNow !== undefined) window.__testNow = o.testNow
    // Chromium defines this handler as an own property of window; Safari has none.
    delete (window as unknown as Record<string, unknown>).ondeviceorientationabsolute
    delete (Window.prototype as unknown as Record<string, unknown>).ondeviceorientationabsolute
    if (o.noOrientation) {
      delete (window as unknown as Record<string, unknown>).DeviceOrientationEvent
      return
    }
    const perm = o.permission ?? 'granted'
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {
      configurable: true, value: () => Promise.resolve(perm),
    })

    const realNow = performance.now.bind(performance)
    let offset = 0
    performance.now = () => realNow() + offset
    window.__advanceTime = (ms: number) => { offset += ms }

    window.__emitOrientation = (alpha, beta, gamma, compassHeading) => {
      offset += 100
      const ev = new Event('deviceorientation')
      for (const [k, v] of Object.entries({ alpha, beta, gamma, absolute: false, webkitCompassHeading: compassHeading, webkitCompassAccuracy: 10 })) {
        Object.defineProperty(ev, k, { value: v, enumerable: true })
      }
      window.dispatchEvent(ev)
    }

    const fakeStream = () => {
      const c = document.createElement('canvas')
      c.width = 64
      c.height = 64
      const g = c.getContext('2d')!
      g.fillStyle = '#334'
      g.fillRect(0, 0, 64, 64)
      const stream = c.captureStream(5)
      window.__streams.push(stream)
      return stream
    }
    window.__streams = []
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} })
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true, value: () => Promise.resolve(fakeStream()),
    })
  }, opts)
}

/** Aim at altitude `alt` with compass heading `h` (iOS path: β = 90 + alt, γ = 0, α = 360 − h). */
export async function aim(page: Page, points: [heading: number, alt: number][]): Promise<void> {
  await page.evaluate((pts) => {
    for (const [h, a] of pts) window.__emitOrientation((360 - h) % 360, 90 + a, 0, h)
  }, points)
}

/** readyState of every track of every stream the app was given. */
export function trackStates(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__streams.flatMap((st) => st.getTracks().map((t) => t.readyState)))
}
