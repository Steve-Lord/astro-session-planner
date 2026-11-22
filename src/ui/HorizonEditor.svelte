<script lang="ts">
  import { flatProfile, setRange } from '../lib/horizon/profile'
  import type { HorizonProfile, Site } from '../lib/types'

  let { site, onclose }: { site: Site; onclose: () => void } = $props()

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
  let profile = $state.raw<HorizonProfile>(site.horizon ? structuredClone($state.snapshot(site.horizon)) : flatProfile())
  let saved = $state(false)
  let svg: SVGSVGElement
  let dragging: number | null = null

  let fromAz = $state('0')
  let toAz = $state('0')
  let leafOff = $state('0')
  let toolError = $state<string | null>(null)

  const clamp = (v: number) => Math.min(90, Math.max(0, v))

  function setPoint(p: number, alt: number): void {
    profile = setRange(profile, p - 5, p + 4, clamp(Math.round(alt)))
    saved = false
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
    setPoint(p, altFromPointer(e))
  }
  function onMove(e: PointerEvent, p: number): void {
    if (dragging === p) setPoint(p, altFromPointer(e))
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
    saved = false
  }

  function resetFlat(): void {
    profile = flatProfile()
    saved = false
  }

  function save(): void {
    site.horizon = { ...structuredClone($state.snapshot(profile)), source: 'manual', createdAt: new Date().toISOString() }
    saved = true
  }
</script>

<section class="card" aria-label={`Horizon for ${site.name}`}>
  <h3>Horizon: {site.name}</h3>
  <p class="hint">Drag a point up to the height of whatever blocks the sky in that direction, or focus it and use Arrow keys (1°) and Page keys (10°). Each point sets ±5°.</p>

  <svg bind:this={svg} viewBox={`0 0 ${VBW} ${VBH}`} role="group" aria-label="Horizon profile, azimuth 0 to 360 degrees" class="plot">
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
  <p class="legend"><span class="sw obs"></span> fixed obstruction <span class="sw sea"></span> seasonal (trees) <span class="sw leaf"></span> leaf-off height</p>

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
    <button type="button" onclick={resetFlat}>Reset flat</button>
    <button type="button" onclick={onclose}>Close</button>
    {#if saved}<span class="hint" role="status">Saved.</span>{/if}
  </div>
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
  .handle { fill: var(--accent); stroke: var(--text); stroke-width: 1.5; cursor: ns-resize; touch-action: none; }
  .handle:focus-visible { outline: none; stroke: #fff; stroke-width: 3; }
  .legend { margin: 0; font-size: 12px; color: var(--text-dim); }
  .sw { display: inline-block; width: 10px; height: 10px; margin: 0 4px 0 8px; border-radius: 2px; vertical-align: middle; }
  .sw.obs { background: #2a2d38; border: 1px solid var(--text-dim); }
  .sw.sea { background: #1f3a2a; border: 1px solid #4a7a5a; }
  .sw.leaf { border: 1px dashed #7fb08f; }
  .tool { border: 1px solid var(--border); border-radius: 6px; padding: 8px; display: grid; gap: 8px; min-width: 0; }
  legend { color: var(--text-dim); font-size: 13px; padding: 0 4px; }
  .row3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  label { display: grid; gap: 2px; font-size: 13px; color: var(--text-dim); min-width: 0; }
  input { width: 100%; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
</style>
