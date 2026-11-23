<script module lang="ts">
  export type CalibrationResult = { offsetDeg: number; residualAltDeg: number; label: string }
</script>

<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import { calibrationCandidates, offsetFromAim, type CalibrationCandidate } from '../lib/sweep/calibration'
  import { declination } from '../lib/sweep/geomag'
  import { angDiff, wrap360, type OrientationSample } from '../lib/sweep/orientation'
  import { keepAwake, now, requestMotionPermission, SENSOR_MSG as MSG, sensorSupport, startCamera, startOrientation } from '../lib/sweep/sensors'
  import type { Site } from '../lib/types'

  // Full-viewport overlay: pick a bright object that is up, centre it in the ring, Lock, Apply.
  // `onapply` gets the north correction; the caller rotates its horizon. `active` false (another tab)
  // stops the camera and sensors and returns to the list.
  let { site, onapply, onclose, active = true, currentOffsetDeg = 0 }: {
    site: Site
    /** The north offset the caller's profile already carries; results are shown relative to it. */
    currentOffsetDeg?: number
    onapply: (r: CalibrationResult) => void
    onclose: () => void
    active?: boolean
  } = $props()

  const REFRESH_MS = 60_000
  const LOCK_MS = 1500
  const MIN_SAMPLES = 10
  const MAX_ROLL_DEG = 20
  const MAX_SPREAD_DEG = 3
  const BIG_CORRECTION_DEG = 45
  /** The same band the sweep treats as "phone held upright". */
  const MIN_ALT = -10
  const MAX_ALT = 80
  /** No orientation reading this long after starting: a desktop browser that has the API but no sensor. */
  const NO_SENSOR_MS = 2000

  const support = sensorSupport()
  const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

  function hint(c: CalibrationCandidate): string {
    const height = c.alt < 20 ? 'low' : c.alt > 45 ? 'high' : 'mid-height'
    return `${c.label} — ${height} in the ${POINTS[Math.round(c.az / 45) % 8]}`
  }

  function where(dAz: number, dAlt: number): string {
    const az = Math.round(Math.abs(dAz))
    const alt = Math.round(Math.abs(dAlt))
    return `Target is ${az}° ${dAz >= 0 ? 'right' : 'left'}, ${alt}° ${dAlt >= 0 ? 'up' : 'down'}`
  }

  const signed = (v: number) => `${v < 0 ? '-' : '+'}${Math.abs(v).toFixed(1)}`

  type Phase = 'pick' | 'aim' | 'locking' | 'result'
  let phase = $state<Phase>('pick')
  // svelte-ignore state_referenced_locally
  let candidates = $state.raw<CalibrationCandidate[]>(calibrationCandidates(site, now()))
  /** Snapshot taken when picked, so a list refresh can't pull the target from under the aiming view. */
  let target = $state.raw<CalibrationCandidate | null>(null)
  let error = $state<string | null>(null)
  let notice = $state<string | null>(null)
  let video = $state<HTMLVideoElement>()
  let reading = $state<{ alt: number; az: number } | null>(null)
  let result = $state<{ offsetDeg: number; residualAltDeg: number; spreadDeg: number } | null>(null)
  let aimHint = $state<string | null>(null)

  let decl = 0
  let session = 0 // bumped by teardown so late camera/wake-lock promises clean up after themselves
  let stopCamera: (() => void) | null = null
  let stopOrientation: (() => void) | null = null
  let releaseWake: (() => void) | null = null
  let watchdog: ReturnType<typeof setTimeout> | undefined
  let lockTimer: ReturnType<typeof setTimeout> | undefined
  let locked: { azMag: number; alt: number }[] = []

  const offBy = $derived(target && reading ? where(angDiff(reading.az, target.az), target.alt - reading.alt) : null)

  onMount(() => {
    const timer = setInterval(() => {
      if (active && phase === 'pick') candidates = calibrationCandidates(site, now())
    }, REFRESH_MS)
    return () => clearInterval(timer)
  })

  function onSample(s: OrientationSample): void {
    if (![s.alt, s.azMag, s.roll].every(Number.isFinite)) return
    reading = { alt: s.alt, az: wrap360(s.azMag + decl) }
    if (phase === 'locking' && Math.abs(s.roll) <= MAX_ROLL_DEG && s.alt >= MIN_ALT && s.alt <= MAX_ALT) {
      locked.push({ azMag: s.azMag, alt: s.alt })
    }
  }

  function choose(c: CalibrationCandidate): void {
    // iOS: the permission request must be the first call in the tap handler, before any other await.
    const permission = requestMotionPermission()
    if (!support.secure) return void (error = MSG.insecure)
    if (!support.orientation) return void (error = MSG.unsupported)
    const my = ++session
    notice = null
    target = c
    void permission.then(async (p) => {
      if (my !== session) return
      if (p === 'denied') return void (error = MSG.denied)
      error = null
      reading = null
      phase = 'aim'
      await tick()
      try {
        const stop = await startCamera(video)
        if (my !== session) return stop()
        stopCamera = stop
      } catch (e) {
        if (my !== session) return
        teardown()
        error = `Couldn't open the camera: ${e instanceof Error || e instanceof DOMException ? e.name : 'Error'}`
        return
      }
      decl = declination(site.lat, site.lon, site.elevation / 1000, now())
      let heard = false
      stopOrientation = startOrientation(onSample, () => { heard = true })
      watchdog = setTimeout(() => {
        if (my !== session || heard) return
        teardown()
        error = MSG.unsupported
      }, NO_SENSOR_MS)
      const release = await keepAwake()
      if (my !== session) release()
      else releaseWake = release
    })
  }

  function lock(): void {
    locked = []
    aimHint = null
    phase = 'locking'
    const my = session
    lockTimer = setTimeout(() => {
      if (my !== session || phase !== 'locking') return
      // Compare with where the object is now (the Moon moves a little each minute).
      const truth = calibrationCandidates(site, now()).find((c) => c.id === target?.id)
      if (!truth) {
        const label = target?.label ?? 'The target'
        teardown()
        candidates = calibrationCandidates(site, now())
        notice = `${label} has moved out of range — pick another`
        return
      }
      if (locked.length < MIN_SAMPLES) {
        aimHint = 'Hold steady on the target and try again.'
        phase = 'aim'
        return
      }
      target = truth
      result = offsetFromAim(locked, { az: truth.az, alt: truth.alt }, decl)
      phase = 'result'
    }, LOCK_MS)
  }

  function retry(): void {
    result = null
    aimHint = null
    phase = 'aim'
  }

  /** Stops the camera, the orientation listener and the wake lock. Idempotent. */
  function teardown(): void {
    session++
    stopCamera?.()
    stopOrientation?.()
    releaseWake?.()
    stopCamera = stopOrientation = releaseWake = null
    clearTimeout(watchdog)
    clearTimeout(lockTimer)
    result = null
    aimHint = null
    reading = null
    phase = 'pick'
  }

  function back(): void {
    teardown()
    error = null
    candidates = calibrationCandidates(site, now())
  }

  const change = $derived(result ? angDiff(currentOffsetDeg, result.offsetDeg) : 0)

  function apply(): void {
    if (!result || !target || result.spreadDeg > MAX_SPREAD_DEG) return
    const r = { offsetDeg: result.offsetDeg, residualAltDeg: result.residualAltDeg, label: target.label }
    teardown()
    onapply(r)
  }

  function close(): void {
    teardown()
    onclose()
  }

  // Leaving the Sites tab (or an import dialog opening) stops the sensors.
  $effect(() => {
    if (!active && phase !== 'pick') {
      teardown()
      candidates = calibrationCandidates(site, now())
      notice = 'Paused — pick the object again to continue.'
    }
  })

  onDestroy(teardown)
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="Calibrate north">
  {#if phase === 'pick'}
    <div class="panel">
      <h3>Calibrate north</h3>
      <p class="hint">The compass is only rough near buildings. Pick something bright that is up, centre it in the ring and lock — the app knows where it really is.</p>
      {#if notice}<p class="notice" role="status">{notice}</p>{/if}
      {#if error}<div class="banner error" role="alert">{error}</div>{/if}
      {#if candidates.length === 0}
        <p>Nothing bright enough is up right now — try after dark.</p>
      {:else}
        <ul class="list">
          {#each candidates as c (c.id)}
            <li><button type="button" onclick={() => choose(c)}>{hint(c)}</button></li>
          {/each}
        </ul>
      {/if}
      <div class="actions"><button type="button" onclick={close}>Close</button></div>
    </div>
  {:else}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} autoplay muted playsinline></video>
    <div class="ring" aria-hidden="true"></div>
    <div class="top">
      <p class="name">{target?.label ?? ''}</p>
      <p class="off">{offBy ?? 'Move the phone slowly towards the target'}</p>
      <p class="status" role="status">{aimHint ?? (phase === 'locking' ? 'Hold steady…' : '')}</p>
    </div>

    {#if phase === 'result' && result && target}
      <div class="result" role="group" aria-label="Calibration result">
        <p>North corrected by {signed(change)}°; altitude reads {Math.abs(result.residualAltDeg).toFixed(1)}° {result.residualAltDeg < 0 ? 'low' : 'high'}</p>
        {#if result.spreadDeg > MAX_SPREAD_DEG}
          <p class="warn">Readings were unsteady (±{result.spreadDeg.toFixed(1)}°) — try again</p>
        {:else if Math.abs(change) > BIG_CORRECTION_DEG}
          <p class="warn">That's a big correction — check you aimed at {target.label}</p>
        {/if}
        <div class="actions">
          <button type="button" class="primary" disabled={result.spreadDeg > MAX_SPREAD_DEG} onclick={apply}>Apply</button>
          <button type="button" onclick={retry}>Try again</button>
        </div>
      </div>
    {/if}

    <div class="buttons">
      {#if phase === 'aim' || phase === 'locking'}
        <button type="button" class="primary" disabled={phase === 'locking'} onclick={lock}>Lock</button>
      {/if}
      <button type="button" onclick={back}>Back</button>
    </div>
  {/if}
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 1000; background: #000; overflow: auto; color: #fff; }
  .panel { background: var(--bg); color: var(--text); min-height: 100%; padding: calc(env(safe-area-inset-top) + 16px) 16px 24px; display: grid; gap: 12px; align-content: start; box-sizing: border-box; }
  h3 { margin: 0; font-size: 18px; }
  .hint { color: var(--text-dim); font-size: 13px; margin: 0; }
  .notice { margin: 0; color: var(--warn-text); }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .list button { width: 100%; min-height: 48px; text-align: left; font-size: 16px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .primary { background: var(--accent); border-color: var(--accent); color: #fff; }

  video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .ring { position: absolute; left: 50%; top: 50%; width: 64px; height: 64px; margin: -32px 0 0 -32px; border: 2px solid #ff4d3d;
    border-radius: 50%; box-shadow: 0 0 2px #000, inset 0 0 2px #000; pointer-events: none; }
  .top { position: absolute; top: 0; left: 0; right: 0; padding: calc(env(safe-area-inset-top) + 12px) 16px 8px; text-align: center;
    background: linear-gradient(rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0)); }
  .top p { margin: 0; text-shadow: 0 0 3px #000; }
  .name { font-size: 26px; font-weight: 700; }
  .off { margin-top: 6px; font-size: 20px; font-weight: 600; }
  .status { min-height: 1.4em; margin-top: 6px; font-size: 17px; font-weight: 600; color: #ffd27a; }
  .buttons { position: absolute; right: 16px; bottom: calc(env(safe-area-inset-bottom) + 16px); display: grid; gap: 10px; }
  .buttons button { min-width: 112px; min-height: 52px; font-size: 18px; }
  .result { position: absolute; left: 16px; right: 16px; top: 50%; transform: translateY(-50%); max-height: 60%; overflow: auto; box-sizing: border-box;
    background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 12px; display: grid; gap: 8px; }
  .result p { margin: 0; }
  .warn { color: var(--warn-text); background: var(--warn-bg); border-radius: 6px; padding: 6px 8px; }
</style>
