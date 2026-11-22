import { describe, expect, it } from 'vitest'
import { needsInstallHint } from '../../src/lib/platform'

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'
const android = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'

describe('needsInstallHint (I4)', () => {
  it('is true for iOS Safari in a tab', () => {
    expect(needsInstallHint({ userAgent: iphone, maxTouchPoints: 5, standalone: false, displayModeStandalone: false })).toBe(true)
  })
  it('is true for iPadOS reporting a Mac user agent with touch', () => {
    expect(needsInstallHint({ userAgent: mac, maxTouchPoints: 5, standalone: undefined, displayModeStandalone: false })).toBe(true)
  })
  it('is false when installed (navigator.standalone or display-mode standalone)', () => {
    expect(needsInstallHint({ userAgent: iphone, maxTouchPoints: 5, standalone: true, displayModeStandalone: false })).toBe(false)
    expect(needsInstallHint({ userAgent: iphone, maxTouchPoints: 5, standalone: false, displayModeStandalone: true })).toBe(false)
  })
  it('is false on desktop Mac and Android', () => {
    expect(needsInstallHint({ userAgent: mac, maxTouchPoints: 0, standalone: undefined, displayModeStandalone: false })).toBe(false)
    expect(needsInstallHint({ userAgent: android, maxTouchPoints: 5, standalone: undefined, displayModeStandalone: false })).toBe(false)
  })
})
