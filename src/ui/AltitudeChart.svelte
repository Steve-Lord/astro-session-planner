<script lang="ts">
  import type { Gear, TimeWindow } from '../lib/types'
  import type { NightSeries } from '../lib/plan/series'
  import { formatLocal } from '../lib/astro/time'
  import { M_LEFT, PLOT_W, VB_W, hourTicks, linePath, nearestIndex, spanBand, xOf } from './chartAxis'

  let { series, windows, best, gear, dark, timezone, hasHorizon }: {
    series: NightSeries; windows: TimeWindow[]; best: TimeWindow | null; gear: Gear
    dark: TimeWindow | null; timezone: string; hasHorizon: boolean
  } = $props()

  const TOP = 8
  const PLOT_H = 150
  const BOTTOM = TOP + PLOT_H
  const VB_H = BOTTOM + 18
  const yOf = (alt: number) => BOTTOM - (Math.max(-5, Math.min(95, alt)) / 90) * PLOT_H
  const RIGHT = M_LEFT + PLOT_W

  const xs = $derived(series.times.map((t) => xOf(t, series.span)))
  const ys = (a: ArrayLike<number>) => Array.from(a, yOf)
  const targetD = $derived(linePath(xs, ys(series.alt)))
  const neededD = $derived(linePath(xs, ys(series.needed)))
  const moonD = $derived(linePath(xs, ys(series.moonAlt), (i) => series.moonAlt[i] > 0))
  const horizonD = $derived.by(() => {
    if (xs.length === 0) return ''
    const hy = ys(series.horizon)
    let d = `M${xs[0].toFixed(1)},${BOTTOM}`
    for (let i = 0; i < xs.length; i++) d += `L${xs[i].toFixed(1)},${hy[i].toFixed(1)}`
    return d + `L${xs[xs.length - 1].toFixed(1)},${BOTTOM}Z`
  })
  const horizonEdgeD = $derived(linePath(xs, ys(series.horizon)))
  const showMountLimit = $derived(gear.mount === 'altaz' && gear.maxAltDeg < 90)

  const band = (w: TimeWindow | null) => spanBand(w, series.span)
  const shades = $derived([
    ['twilight-civil', band(series.twilight.civil)],
    ['twilight-nautical', band(series.twilight.nautical)],
    ['twilight-astro', band(series.twilight.astro)],
    ['dark', band(dark)],
  ] as const)
  const ticks = $derived(hourTicks(series.span, timezone))

  /** Y-axis labels: the gear limits plus 0/30/60/90, dropping generic ones that would collide. */
  const yLabels = $derived.by(() => {
    const special = [gear.minAltDeg, ...(showMountLimit ? [gear.maxAltDeg] : [])]
    const generic = [0, 30, 60, 90].filter((g) => special.every((s) => Math.abs(yOf(s) - yOf(g)) >= 12))
    return [...generic.map((v) => ({ v, special: false })), ...special.map((v) => ({ v, special: true }))]
  })

  let svg: SVGSVGElement | undefined = $state()
  let idx: number | null = $state(null)
  let dragging = false

  function pick(e: PointerEvent) {
    if (svg && series.times.length) idx = nearestIndex(e, svg, series.span, series.times)
  }
  function down(e: PointerEvent) { dragging = true; pick(e) }
  function move(e: PointerEvent) { if (dragging || e.pointerType === 'mouse') pick(e) }
  function up() { dragging = false }

  const deg = (v: number) => `${Math.round(v)}°`
  const readout = $derived.by(() => {
    if (idx === null) return null
    const i = idx
    const sep = series.moonSep[i]
    return `${formatLocal(series.times[i], timezone)} · target ${deg(series.alt[i])} az ${deg(series.az[i])} · ` +
      `horizon ${deg(series.horizon[i])} · needed ${deg(series.needed[i])} · ` +
      (Number.isFinite(sep) ? `Moon ${deg(sep)} away` : 'Moon down')
  })
</script>

<figure class="altitude">
  <svg
    bind:this={svg}
    viewBox="0 0 {VB_W} {VB_H}"
    role="img"
    aria-label="Altitude through the night"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onpointerleave={up}
  >
    <defs>
      <clipPath id="alt-plot"><rect x={M_LEFT} y={TOP} width={PLOT_W} height={PLOT_H} /></clipPath>
    </defs>
    <rect class="day" x={M_LEFT} y={TOP} width={PLOT_W} height={PLOT_H} />
    {#each shades as [cls, b] (cls)}
      {#if b}<rect class={cls} x={b.x} y={TOP} width={b.w} height={PLOT_H} />{/if}
    {/each}
    {#each windows as w (w.start)}
      {@const b = band(w)}
      {#if b}
        <rect class="usable" class:best={best !== null && w.start === best.start && w.end === best.end}
          x={b.x} y={TOP} width={b.w} height={PLOT_H} />
      {/if}
    {/each}
    {#each ticks as tk (tk.t)}
      {@const x = xOf(tk.t, series.span)}
      <line class="grid" x1={x} x2={x} y1={TOP} y2={BOTTOM} />
      <text class="tick" x={x} y={VB_H - 4} text-anchor="middle">{tk.label}</text>
    {/each}
    {#each yLabels as l (l.v)}
      <text class="tick" class:limit={l.special} x={M_LEFT - 4} y={yOf(l.v) + 4} text-anchor="end">{l.v}°</text>
    {/each}
    <g clip-path="url(#alt-plot)">
      <path class="horizon" d={horizonD} />
      <path class="horizon-edge" d={horizonEdgeD} />
      <line class="min-alt" x1={M_LEFT} x2={RIGHT} y1={yOf(gear.minAltDeg)} y2={yOf(gear.minAltDeg)} />
      {#if showMountLimit}
        <line class="mount-limit" x1={M_LEFT} x2={RIGHT} y1={yOf(gear.maxAltDeg)} y2={yOf(gear.maxAltDeg)} />
      {/if}
      <path class="needed" d={neededD} />
      {#if moonD}<path class="moon" d={moonD} />{/if}
      <path class="target" d={targetD} />
      {#if idx !== null}
        <line class="cursor" x1={xs[idx]} x2={xs[idx]} y1={TOP} y2={BOTTOM} />
        <circle class="cursor-dot" cx={xs[idx]} cy={yOf(series.alt[idx])} r="3.5" />
      {/if}
    </g>
    <rect class="frame" x={M_LEFT} y={TOP} width={PLOT_W} height={PLOT_H} />
  </svg>
  <p class="readout" aria-live="polite">{readout ?? 'Tap or drag the chart for a reading'}</p>
  <ul class="legend">
    <li><svg viewBox="0 0 18 10" aria-hidden="true"><line class="target" x1="0" x2="18" y1="5" y2="5" /></svg>target</li>
    <li><svg viewBox="0 0 18 10" aria-hidden="true"><rect class="horizon" x="0" y="2" width="18" height="8" /><line class="horizon-edge" x1="0" x2="18" y1="2" y2="2" /></svg>horizon</li>
    <li><svg viewBox="0 0 18 10" aria-hidden="true"><line class="needed" x1="0" x2="18" y1="5" y2="5" /></svg>needed height</li>
    <li><svg viewBox="0 0 18 10" aria-hidden="true"><rect class="usable best" x="0" y="0" width="18" height="10" /></svg>usable</li>
    <li><svg viewBox="0 0 18 10" aria-hidden="true"><line class="moon" x1="1" x2="18" y1="5" y2="5" /></svg>Moon</li>
    <li><svg viewBox="0 0 18 10" aria-hidden="true"><line class="min-alt" x1="0" x2="18" y1="5" y2="5" /></svg>{showMountLimit ? 'min / mount limit' : 'min altitude'}</li>
  </ul>
  {#if !hasHorizon}<p class="note">No horizon saved for this site</p>{/if}
</figure>

<style>
  figure { margin: 0 0 12px; }
  svg[role='img'] { display: block; width: 100%; max-width: 560px; height: auto; touch-action: pan-y; user-select: none; }
  .day { fill: #2a2e3c; }
  .twilight-civil { fill: #222531; }
  .twilight-nautical { fill: #1a1c26; }
  .twilight-astro { fill: #13151c; }
  .dark { fill: #0c0d12; }
  .usable { fill: rgba(181, 71, 58, 0.16); }
  .usable.best { fill: rgba(181, 71, 58, 0.32); }
  .grid { stroke: #ffffff; stroke-opacity: 0.07; }
  .frame { fill: none; stroke: var(--border); }
  .tick { fill: var(--text-dim); font-size: 11px; }
  .tick.limit { fill: var(--text); }
  .horizon { fill: #4d3d26; fill-opacity: 0.9; }
  .horizon-edge { fill: none; stroke: #8f7445; stroke-width: 1.2; }
  .needed { fill: none; stroke: #e0b860; stroke-width: 1.4; }
  .min-alt, .mount-limit { stroke: #9aa0ae; stroke-width: 1; stroke-dasharray: 5 4; }
  .moon { fill: none; stroke: #9db8e8; stroke-width: 1.8; stroke-dasharray: 0.1 4; stroke-linecap: round; }
  .target { fill: none; stroke: #eef0f4; stroke-width: 2.2; stroke-linejoin: round; }
  .cursor { stroke: var(--accent-text); stroke-width: 1; }
  .cursor-dot { fill: var(--accent-text); }
  .readout { margin: 4px 0 2px; font-size: 13px; color: var(--text); min-height: 2.8em; font-variant-numeric: tabular-nums; }
  .legend { list-style: none; display: flex; flex-wrap: wrap; gap: 2px 12px; margin: 2px 0 0; padding: 0; font-size: 12px; color: var(--text-dim); }
  .legend li { display: inline-flex; align-items: center; gap: 4px; }
  .legend svg { width: 18px; height: 10px; }
  .note { margin: 4px 0 0; font-size: 12px; color: var(--warn-text); }
</style>
