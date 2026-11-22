<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import { SweepAccumulator, type Rejection } from '../lib/sweep/binning'
  import { declination } from '../lib/sweep/geomag'
  import { wrap360, type OrientationSample } from '../lib/sweep/orientation'
  import { keepAwake, now, requestMotionPermission, sensorSupport, startCamera, startOrientation } from '../lib/sweep/sensors'
  import type { HorizonProfile, Site } from '../lib/types'

  // Start panel (inside Sites) and, once running, a full-viewport camera overlay.
  // `onfinish` returns false when Sites cannot take the profile yet (unsaved edits kept); the sweep then stays open.
  // `active` false (another tab, or the import dialog) pauses: camera, sensors and wake lock stop, the
  // accumulator is kept, and the user resumes with a new tap. `sweptBins` reports progress to Sites.
  let { site, onfinish, onmanual, oncancel, active = true, sweptBins = $bindable(0) }: {
    site: Site
    onfinish: (profile: HorizonProfile) => boolean
    onmanual: () => void
    oncancel: () => void
    active?: boolean
    sweptBins?: number
  } = $props()

  const MSG = {
    insecure: 'Sensors need a secure (https) page.',
    denied: 'Motion access was refused. Close Safari (or the Home Screen app) completely, reopen this page, tap Start and choose Allow.',
    unsupported: 'This needs a phone or tablet with a compass.',
  }
  const STATUS: Record<Exclude<Rejection, 'invalid'>, string> = {
    'not-upright': 'Hold the phone upright, camera at the skyline',
    roll: 'Keep the phone level — don’t tilt it sideways',
    fast: 'Slow down',
    'compass-jump': 'Compass disturbed — move away from metal',
    'low-accuracy': 'Compass needs calibrating — wave the phone in a figure-8',
  }
  const STATUS_MS = 1500
  const CONFIRM_CANCEL_BINS = 30
  /** No orientation reading this long after starting: a desktop browser that has the API but no sensor. */
  const NO_SENSOR_MS = 2000

  const support = sensorSupport()
  let error = $state<string | null>(!support.secure ? MSG.insecure : !support.orientation ? MSG.unsupported : null)
  let running = $state(false)
  let paused = $state(false)
  let video = $state<HTMLVideoElement>()
  let bins = $state.raw<boolean[]>(new Array(360).fill(false))
  const swept = $derived(bins.filter(Boolean).length)
  $effect(() => { sweptBins = swept })
  let reading = $state<{ alt: number; az: number } | null>(null)
  let status = $state<string | null>(null)
  let gaps = $state.raw<{ from: number; to: number }[] | null>(null)

  let acc: SweepAccumulator | null = null
  let decl = 0
  let session = 0 // bumped by teardown so late camera/wake-lock promises clean up after themselves
  let stopCamera: (() => void) | null = null
  let stopOrientation: (() => void) | null = null
  let releaseWake: (() => void) | null = null
  let statusTimer: ReturnType<typeof setTimeout> | undefined
  let watchdog: ReturnType<typeof setTimeout> | undefined

  // Coverage ring: 360 one-degree arcs, north at the top, clockwise.
  const R = 50
  const C = 60
  const pt = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return `${(C + R * Math.cos(a)).toFixed(2)},${(C + R * Math.sin(a)).toFixed(2)}`
  }
  const ARCS = Array.from({ length: 360 }, (_, i) => `M${pt(i)} A${R},${R} 0 0 1 ${pt(i + 1)}`)

  function showStatus(text: string): void {
    status = text
    clearTimeout(statusTimer)
    statusTimer = setTimeout(() => (status = null), STATUS_MS)
  }

  function onSample(s: OrientationSample): void {
    if (!acc) return
    const r = acc.add(s)
    if (Number.isFinite(s.alt) && Number.isFinite(s.azMag)) reading = { alt: s.alt, az: wrap360(s.azMag + decl) }
    if (r.accepted) {
      if (!bins[Math.floor(r.azTrue) % 360]) bins = acc.coverage().bins
    } else if (r.reason !== 'invalid') {
      showStatus(STATUS[r.reason])
    }
  }

  function start(): void {
    // iOS: the permission request must be the first call in the tap handler, before any other await.
    const permission = requestMotionPermission()
    if (!support.secure) return void (error = MSG.insecure)
    if (!support.orientation) return void (error = MSG.unsupported)
    const my = ++session
    void permission.then(async (p) => {
      if (my !== session) return
      if (p === 'denied') return void (error = MSG.denied)
      error = null
      paused = false
      running = true
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
      if (!acc) {
        decl = declination(site.lat, site.lon, site.elevation / 1000, now())
        acc = new SweepAccumulator({ declinationDeg: decl })
      }
      // Any reading with real angles proves a sensor (on iOS azMag can lag until the phone is upright).
      let heard = false
      stopOrientation = startOrientation(onSample, () => { heard = true })
      watchdog = setTimeout(() => {
        if (my !== session || heard) return
        teardown()
        paused = false
        error = MSG.unsupported
      }, NO_SENSOR_MS)
      const release = await keepAwake()
      if (my !== session) release()
      else releaseWake = release
    })
  }

  /** Stops the camera, the orientation listener and the wake lock. Idempotent. */
  function teardown(): void {
    session++
    running = false
    stopCamera?.()
    stopOrientation?.()
    releaseWake?.()
    stopCamera = stopOrientation = releaseWake = null
    clearTimeout(statusTimer)
    clearTimeout(watchdog)
    status = null
  }

  // Leaving the Sites tab (or an import dialog opening) pauses a running sweep.
  $effect(() => {
    if (!active && running) {
      teardown()
      paused = true
    }
  })

  function done(): void {
    if (!acc || acc.coverage().swept === 0) return showStatus('Nothing swept yet — put the line on the skyline and turn slowly')
    const large = acc.largeGaps()
    if (large.length > 0) gaps = large
    else finish(false)
  }

  function finish(fillLargeGaps: boolean): void {
    if (!acc) return
    const profile = acc.toProfile({ fillLargeGaps })
    if (!onfinish(profile)) return
    teardown()
  }

  function cancel(): void {
    if (swept > CONFIRM_CANCEL_BINS && !confirm('Discard this sweep?')) return
    teardown()
    oncancel()
  }

  onDestroy(teardown)
</script>

{#if !running}
  <section class="card" aria-label={`Sweep horizon for ${site.name}`}>
    <h3>Sweep horizon: {site.name}</h3>
    {#if paused && !error}
      <p class="paused" role="status">Sweep paused — {swept}/360 swept.</p>
      <div class="actions">
        <button type="button" class="primary" onclick={start}>Resume</button>
        <button type="button" onclick={cancel}>Cancel</button>
      </div>
    {:else if error}
      <div class="banner error" role="alert">{error}</div>
      <div class="actions">
        <button type="button" onclick={onmanual}>Draw it by hand instead</button>
        {#if error !== MSG.unsupported && error !== MSG.insecure}<button type="button" onclick={start}>Try again</button>{/if}
        <button type="button" onclick={oncancel}>Close</button>
      </div>
    {:else}
      <ol class="steps">
        <li>Stand where the telescope goes and hold the phone upright, camera facing out.</li>
        <li>Keep the line on the top edge of roofs and trees and turn slowly all the way round.</li>
        <li>Tap Done when the ring is full; you can touch it up in the editor afterwards.</li>
      </ol>
      <div class="actions">
        <button type="button" class="primary" onclick={start}>Start</button>
        <button type="button" onclick={oncancel}>Close</button>
      </div>
    {/if}
  </section>
{:else}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Horizon sweep">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} autoplay muted playsinline></video>
    <div class="crosshair" aria-hidden="true"><span class="tick"></span></div>

    <div class="top">
      <div class="readouts">
        <div><span class="label">Alt</span> <span class="value">{reading ? `${(Math.round(reading.alt * 10) / 10 || 0).toFixed(1)}°` : '—'}</span></div>
        <div><span class="label">Az</span> <span class="value">{reading ? `${Math.round(reading.az)}°` : '—'}</span></div>
      </div>
      <p class="status" role="status">{status ?? ''}</p>
    </div>

    <svg class="ring" viewBox="0 0 120 120" role="img" aria-label={`Swept ${swept} of 360 degrees`}>
      {#each ARCS as d, i (i)}<path {d} class:on={bins[i]} />{/each}
      {#if reading}<line x1={C} y1={C} x2={pt(reading.az).split(',')[0]} y2={pt(reading.az).split(',')[1]} class="needle" />{/if}
      <text x={C} y={C + 5} text-anchor="middle">{swept}/360</text>
    </svg>

    <div class="buttons">
      <button type="button" class="primary" onclick={done}>Done</button>
      <button type="button" onclick={cancel}>Cancel</button>
    </div>

    {#if gaps}
      <div class="gaps" role="group" aria-label="Unswept directions">
        <ul>
          {#each gaps as g (g.from)}<li>Not swept: {g.from}°–{g.to}°</li>{/each}
        </ul>
        <div class="actions">
          <button type="button" class="primary" onclick={() => (gaps = null)}>Sweep the gaps</button>
          <button type="button" onclick={() => finish(true)}>Fill from neighbours</button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin: 12px 0; display: grid; gap: 10px; }
  h3 { margin: 0; font-size: 16px; }
  .paused { margin: 0; }
  .steps { margin: 0; padding-left: 20px; display: grid; gap: 4px; color: var(--text); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .primary { background: var(--accent); border-color: var(--accent); color: #fff; }

  .overlay { position: fixed; inset: 0; z-index: 1000; background: #000; overflow: hidden; color: #fff; }
  video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .crosshair { position: absolute; left: 0; right: 0; top: 50%; height: 2px; margin-top: -1px; background: #ff4d3d;
    box-shadow: 0 0 2px #000; pointer-events: none; }
  .tick { position: absolute; left: 50%; top: -9px; width: 2px; height: 20px; margin-left: -1px; background: #ff4d3d; }

  .top { position: absolute; top: 0; left: 0; right: 0; padding: calc(env(safe-area-inset-top) + 12px) 16px 8px;
    background: linear-gradient(rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0)); }
  .readouts { display: flex; justify-content: space-around; gap: 16px; }
  .label { font-size: 16px; opacity: 0.8; }
  .value { font: 600 34px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .status { min-height: 1.4em; margin: 8px 0 0; text-align: center; font-size: 17px; font-weight: 600; color: #ffd27a;
    text-shadow: 0 0 3px #000; }

  .ring { position: absolute; left: 12px; bottom: calc(env(safe-area-inset-bottom) + 12px); width: 132px; height: 132px; }
  .ring path { fill: none; stroke: rgba(255, 255, 255, 0.25); stroke-width: 12; }
  .ring path.on { stroke: #5fd08a; }
  .ring .needle { stroke: #ff4d3d; stroke-width: 2; }
  .ring text { fill: #fff; font: 600 15px system-ui, sans-serif; }

  .buttons { position: absolute; right: 16px; bottom: calc(env(safe-area-inset-bottom) + 16px); display: grid; gap: 10px; }
  .buttons button { min-width: 112px; min-height: 52px; font-size: 18px; }

  .gaps { position: absolute; left: 16px; right: 16px; top: 50%; transform: translateY(-50%); max-height: 60%; overflow: auto;
    background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
  .gaps ul { margin: 0 0 10px; padding-left: 18px; }
</style>
