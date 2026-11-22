export interface PlatformInfo {
  userAgent: string
  maxTouchPoints: number
  /** Safari's non-standard navigator.standalone (true when launched from the Home Screen). */
  standalone: boolean | undefined
  displayModeStandalone: boolean
}

/** iOS/iPadOS Safari in a browser tab: storage there can be evicted after 7 days without a visit (ITP). */
export function needsInstallHint(p: PlatformInfo): boolean {
  const ios = /iP(hone|ad|od)/.test(p.userAgent) || (/Macintosh/.test(p.userAgent) && p.maxTouchPoints > 1)
  return ios && p.standalone !== true && !p.displayModeStandalone
}

export function currentPlatform(): PlatformInfo {
  const nav = navigator as Navigator & { standalone?: boolean }
  return {
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: nav.standalone,
    displayModeStandalone: typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches,
  }
}

/** Ask the browser to keep this origin's storage (best effort; failures ignored). */
export function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.().catch(() => {})
  } catch {
    /* unsupported */
  }
}
