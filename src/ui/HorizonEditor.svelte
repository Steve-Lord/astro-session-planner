<script lang="ts">
  import { flatProfile, setRange } from '../lib/horizon/profile'
  import { appState } from '../lib/store/state.svelte'
  import { angDiff } from '../lib/sweep/orientation'
  import { rotateProfile } from '../lib/sweep/calibration'
  import { now, sensorSupport } from '../lib/sweep/sensors'
  import CalibrateView, { type CalibrationResult } from './CalibrateView.svelte'
  import ShareHorizon from './ShareHorizon.svelte'
  import type { HorizonProfile, Site } from '../lib/types'

  // `dirty` is bindable so the parent can confirm before switching to another site's editor (I3).
  // `initial` (a just-finished sweep) replaces the site's horizon as the working copy and starts unsaved.
  // `active` false (another tab) stops a running calibration.
  let { site, onclose, dirty = $bindable(false), initial, active = true }:
    { site: Site; onclose: () => void; dirty?: boolean; initial?: HorizonProfile; active?: boolean } = $props()

  const BACKUP_HINT = 'backup-after-horizon'
  const backupHint = $derived(!appState.dismissed.includes(BACKUP_HINT))

  // Plot geometry (viewBox units): 2 units per degree on both axes.
  const X0 = 30
  const Y0 = 10
  const W = 720
  const H = 180
  const VBW = X0 + W + 10
  const VBH = Y0 + H + 24
  const px = (az: number) => X0 + az * 2
  const py = (alt: number) => Y0 + H - alt * 2
  const POINTS = Array.from({ length: 36 }, (_, i) => i * 10)
  const CARDINALS = [['N', 0], ['E', 90], ['S', 180], ['W', 270]] as const

  // Working copy; the site is only written by Save.
  // Intentionally a one-time copy of the site horizon (the parent keys this component by site).
  // svelte-ignore state_referenced_locally
  // svelte-ignore state_referenced_locally
  const start = initial ?? site.horizon
  let profile = $state.raw<HorizonProfile>(start ? structuredClone($state.snapshot(start)) : flatProfile())
  // svelte-ignore state_referenced_locally
  if (initial) dirty = true
  /** Hand edits to the shape make the saved profile 'manual'; otherwise it keeps its source (e.g. 'sweep'). */
  let reshaped = false
  const uid = `hz${Math.random().toString(36).slice(2, 8)}`
  let saved = $state(false)
  let sharing = $state(false)
  let calibrating = $state(false)

  // Warn on reload/close while edits are unsaved.
  $effect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  })

  const hasSensors = sensorSupport().orientation
  // R13: calibration and the badge follow a sweep made on this device, through hand edits (which happen in the
  // sweep's own frame, so rotating the whole profile keeps them consistent). Imports never carry sweptHere.
  const canCalibrate = $derived(hasSensors && profile.sweptHere === true && profile.altitudes.some((a) => a > 0))
  const uncalibrated = $derived(profile.sweptHere === true && profile.calibration === null)
  // R14: an unsaved sweep lives only in memory (iOS can discard the page), so Save comes first; calibrate later.
  const suggestSave = $derived(uncalibrated && dirty)
  const suggestCalibrate = $derived(canCalibrate && profile.calibration === null && !dirty)

  /** Contiguous unswept runs as [startAz, endAz], drawn hatched. */
  const unsweptRuns = $derived.by(() => {
    const out: [number, number][] = []
    const u = profile.unswept
    if (!u) return out
    let start = -1
    for (let i = 0; i <= 360; i++) {
      if (i < 360 && u[i] && start < 0) start = i
      if ((i === 360 || !u[i]) && start >= 0) { out.push([start, i - 1]); start = -1 }
    }
    return out
  })

  function edited(): void {
    saved = false
    dirty = true
  }

  function close(): void {
    if (dirty && !confirm('Discard unsaved horizon changes?')) return
    dirty = false
    onclose()
  }
  let svg: SVGSVGElement
  let dragging: number | null = null
  let grabOffset = 0 // handle altitude minus pointer altitude at pointer-down

  let fromAz = $state('0')
  let toAz = $state('0')
  let leafOff = $state('0')
  let toolError = $state<string | null>(null)

  const clamp = (v: number) => Math.min(90, Math.max(0, v))

  function setPoint(p: number, alt: number): void {
    profile = setRange(profile, p - 5, p + 4, clamp(Math.round(alt)))
    reshaped = true
    edited()
  }

  function onKey(e: KeyboardEvent, p: number): void {
    const step = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key]
    if (step === undefined) return
    e.preventDefault()
    setPoint(p, profile.altitudes[p] + step)
  }

  function altFromPointer(e: PointerEvent): number {
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const local = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    return (Y0 + H - local.y) / 2
  }

  function onDown(e: PointerEvent, p: number): void {
    dragging = p
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    ;(e.currentTarget as SVGElement).focus()
    grabOffset = profile.altitudes[p] - altFromPointer(e)
  }
  function onMove(e: PointerEvent, p: number): void {
    if (dragging === p) setPoint(p, altFromPointer(e) + grabOffset)
  }
  function onUp(): void {
    dragging = null
  }

  /** Contiguous seasonal runs as [startAz, endAz] (no wrap-around merging; fine for drawing). */
  const runs = $derived.by(() => {
    const out: [number, number][] = []
    let start = -1
    for (let i = 0; i < 360; i++) {
      if (profile.seasonal[i] && start < 0) start = i
      if (!profile.seasonal[i] && start >= 0) { out.push([start, i - 1]); start = -1 }
    }
    if (start >= 0) out.push([start, 359])
    return out
  })

  const area = $derived(
    `M${px(0)},${py(0)} ` + profile.altitudes.map((a, i) => `L${px(i)},${py(a)}`).join(' ') + ` L${px(359)},${py(0)} Z`,
  )
  const seasonalAreas = $derived(
    runs.map(([a, b]) => {
      const up = Array.from({ length: b - a + 1 }, (_, k) => `L${px(a + k)},${py(profile.altitudes[a + k])}`).join(' ')
      return `M${px(a)},${py(0)} ${up} L${px(b)},${py(0)} Z`
    }),
  )
  const leafOffLines = $derived(
    runs.map(([a, b]) =>
      Array.from({ length: b - a + 1 }, (_, k) => `${k === 0 ? 'M' : 'L'}${px(a + k)},${py(profile.leafOffAltitudes[a + k])}`).join(' '),
    ),
  )

  function parseAz(text: string): number | null {
    const v = Number(text)
    return text.trim() !== '' && Number.isFinite(v) && v >= 0 && v < 360 ? Math.round(v) : null
  }

  function markRange(on: boolean): void {
    const a = parseAz(fromAz)
    const b = parseAz(toAz)
    const alt = Number(leafOff)
    if (a === null || b === null) return void (toolError = 'Azimuths must be from 0 to 359.')
    if (on && !(leafOff.trim() !== '' && alt >= 0 && alt <= 90)) return void (toolError = 'Leaf-off altitude must be from 0 to 90.')
    toolError = null
    const seasonal = profile.seasonal.slice()
    const leafOffAltitudes = profile.leafOffAltitudes.slice()
    const len = ((b - a + 360) % 360) + 1
    for (let k = 0; k < len; k++) {
      const i = (a + k) % 360
      seasonal[i] = on
      leafOffAltitudes[i] = on ? alt : 0
    }
    profile = { ...profile, seasonal, leafOffAltitudes }
    edited()
  }

  function resetFlat(): void {
    profile = flatProfile()
    reshaped = true
    edited()
  }

  function applyCalibration(r: CalibrationResult): void {
    // r.offsetDeg is the total correction from raw compass readings: only the change from what the profile already has is applied.
    profile = {
      ...rotateProfile(profile, angDiff(profile.northOffsetDeg, r.offsetDeg)),
      northOffsetDeg: r.offsetDeg,
      calibration: { target: r.label, at: now().toISOString(), residualAltDeg: r.residualAltDeg },
    }
    calibrating = false
    edited()
  }

  function save(): void {
    site.horizon = { ...structuredClone($state.snapshot(profile)), source: reshaped ? 'manual' : profile.source, createdAt: new Date().toISOString() }
    saved = true
    dirty = false
  }

  function dismissBackupHint(): void {
    if (!appState.dismissed.includes(BACKUP_HINT)) appState.dismissed.push(BACKUP_HINT)
  }
</script>

<section class="card" aria-label={`Horizon for ${site.name}`}>
  <h3>Horizon: {site.name}</h3>
  {#if uncalibrated}<span class="badge warn">Uncalibrated — calibrate north for accuracy</span>{/if}
  {#if suggestSave}
    <div class="banner warn" role="status">
      <span>Save now — an unsaved sweep is lost if the phone closes the page. You can calibrate north later from Edit horizon.</span>
      <button type="button" onclick={save}>Save now</button>
    </div>
  {:else if suggestCalibrate}
    <div class="banner warn" role="status">
      <span>Calibrate now (recommended) — the compass is only rough near buildings</span>
      <button type="button" onclick={() => (calibrating = true)}>Calibrate</button>
    </div>
  {/if}
  <p class="hint">Drag a point up to the height of whatever blocks the sky in that direction, or focus it and use Arrow keys (1°) and Page keys (10°). Each point sets ±5°.</p>

  <svg bind:this={svg} viewBox={`0 0 ${VBW} ${VBH}`} role="group" aria-label="Horizon profile, azimuth 0 to 360 degrees" class="plot">
    <defs>
      <pattern id={`${uid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" class="hatch" />
      </pattern>
    </defs>
    {#each [0, 30, 60, 90] as a (a)}
      <line x1={X0} x2={X0 + W} y1={py(a)} y2={py(a)} class="grid" />
      <text x={X0 - 4} y={py(a) + 4} class="axis" text-anchor="end">{a}°</text>
    {/each}
    {#each CARDINALS as [label, az] (label)}
      <line x1={px(az)} x2={px(az)} y1={Y0} y2={Y0 + H} class="grid" />
      <text x={px(az)} y={VBH - 6} class="axis" text-anchor="middle">{label}</text>
    {/each}
    <text x={px(360)} y={VBH - 6} class="axis" text-anchor="end">N</text>
    <path d={area} class="obstruction" />
    {#each unsweptRuns as [a, b] (a)}
      <rect x={px(a)} y={Y0} width={(b - a + 1) * 2} height={H} fill={`url(#${uid}-hatch)`} class="unswept" />
    {/each}
    {#each seasonalAreas as d, i (i)}<path {d} class="seasonal" />{/each}
    {#each leafOffLines as d, i (i)}<path {d} class="leafoff" />{/each}
    {#each POINTS as p (p)}
      <circle
        role="slider"
        tabindex="0"
        aria-label={`Azimuth ${p}°`}
        aria-orientation="vertical"
        aria-valuemin="0"
        aria-valuemax="90"
        aria-valuenow={profile.altitudes[p]}
        aria-valuetext={`${profile.altitudes[p]}° altitude`}
        cx={px(p)}
        cy={py(profile.altitudes[p])}
        r="7"
        class="handle"
        onkeydown={(e) => onKey(e, p)}
        onpointerdown={(e) => onDown(e, p)}
        onpointermove={(e) => onMove(e, p)}
        onpointerup={onUp}
        onpointercancel={onUp}
      />
    {/each}
  </svg>
  <p class="legend"><span class="sw obs"></span> fixed obstruction <span class="sw sea"></span> seasonal (trees) <span class="sw leaf"></span> leaf-off height{#if unsweptRuns.length}<span class="sw unsw"></span> not swept (filled from neighbours){/if}</p>

  <fieldset class="tool">
    <legend>Seasonal trees</legend>
    <div class="row3">
      <label>From azimuth <input bind:value={fromAz} inputmode="numeric" /></label>
      <label>To azimuth <input bind:value={toAz} inputmode="numeric" /></label>
      <label>Leaf-off altitude <input bind:value={leafOff} inputmode="numeric" /></label>
    </div>
    {#if toolError}<div class="banner error" role="alert">{toolError}</div>{/if}
    <div class="actions">
      <button type="button" onclick={() => markRange(true)}>Mark as trees</button>
      <button type="button" onclick={() => markRange(false)}>Unmark trees</button>
    </div>
  </fieldset>

  <div class="actions">
    <button type="button" onclick={save}>Save horizon</button>
    {#if canCalibrate}<button type="button" onclick={() => (calibrating = true)}>Calibrate north</button>{/if}
    <button type="button" onclick={resetFlat}>Reset flat</button>
    <button type="button" onclick={() => (sharing = !sharing)} disabled={dirty || !site.horizon}>Send to another device</button>
    <button type="button" onclick={close}>Close</button>
    {#if saved}<span class="hint" role="status">Saved.</span>{/if}
    {#if dirty}<span class="hint">Unsaved changes</span>{/if}
    {#if dirty || !site.horizon}<span class="hint">Save first</span>{/if}
  </div>
  {#if sharing && !dirty && site.horizon}<ShareHorizon horizon={site.horizon} />{/if}
  {#if saved && backupHint}
    <div class="banner info backup" role="status">
      <span>Horizon saved in this browser only. <a href="#settings">Back up your settings</a> to keep a copy.</span>
      <button type="button" aria-label="Dismiss backup reminder" onclick={dismissBackupHint}>✕</button>
    </div>
  {/if}
  {#if calibrating}
    <CalibrateView {site} {active} currentOffsetDeg={profile.northOffsetDeg} onapply={applyCalibration} onclose={() => (calibrating = false)} />
  {/if}
</section>

<style>
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin: 12px 0; display: grid; gap: 10px; }
  h3 { margin: 0; font-size: 16px; }
  .hint { color: var(--text-dim); font-size: 13px; margin: 0; }
  .plot { width: 100%; height: auto; display: block; background: var(--bg); border-radius: 6px; }
  .grid { stroke: var(--border); stroke-width: 1; }
  .axis { fill: var(--text-dim); font-size: 11px; }
  .obstruction { fill: #2a2d38; stroke: var(--text-dim); stroke-width: 1; }
  .seasonal { fill: #1f3a2a; stroke: #4a7a5a; stroke-width: 1; }
  .leafoff { fill: none; stroke: #7fb08f; stroke-width: 1.5; stroke-dasharray: 4 3; }
  .unswept { stroke: #cfa95a; stroke-width: 0.5; stroke-dasharray: 2 2; }
  .hatch { stroke: #cfa95a; stroke-width: 1.5; opacity: 0.6; }
  .badge { justify-self: start; font-size: 12px; padding: 1px 8px; border-radius: 10px; }
  .badge.warn { background: var(--warn-bg); color: var(--warn-text); }
  .handle { fill: var(--accent); stroke: var(--text); stroke-width: 1.5; cursor: ns-resize; touch-action: none; }
  .handle:focus-visible { outline: none; stroke: #fff; stroke-width: 3; }
  .legend { margin: 0; font-size: 12px; color: var(--text-dim); }
  .sw { display: inline-block; width: 10px; height: 10px; margin: 0 4px 0 8px; border-radius: 2px; vertical-align: middle; }
  .sw.obs { background: #2a2d38; border: 1px solid var(--text-dim); }
  .sw.sea { background: #1f3a2a; border: 1px solid #4a7a5a; }
  .sw.leaf { border: 1px dashed #7fb08f; }
  .sw.unsw { background: repeating-linear-gradient(45deg, #cfa95a 0 1.5px, transparent 1.5px 4px); border: 1px dashed #cfa95a; }
  .tool { border: 1px solid var(--border); border-radius: 6px; padding: 8px; display: grid; gap: 8px; min-width: 0; }
  legend { color: var(--text-dim); font-size: 13px; padding: 0 4px; }
  .row3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  label { display: grid; gap: 2px; font-size: 13px; color: var(--text-dim); min-width: 0; }
  input { width: 100%; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
</style>
