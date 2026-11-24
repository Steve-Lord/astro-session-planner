<script lang="ts">
  import type { NightSeries } from '../lib/plan/series'
  import { formatLocal } from '../lib/astro/time'
  import { WEIGHTS } from '../lib/plan/score'
  import { M_LEFT, PLOT_W, VB_W, hourTicks, linePath, xOf } from './chartAxis'

  let { series, timezone }: { series: NightSeries; timezone: string } = $props()

  const HURT_DEG = WEIGHTS.moonSepZeroDeg + WEIGHTS.moonSepSpanDeg
  const TOP = 4
  const PLOT_H = 56
  const BOTTOM = TOP + PLOT_H
  const VB_H = BOTTOM + 4
  const yOf = (sep: number) => BOTTOM - (sep / 180) * PLOT_H

  const xs = $derived(series.times.map((t) => xOf(t, series.span)))
  const sepD = $derived(linePath(xs, Array.from(series.moonSep, yOf)))
  const ticks = $derived(hourTicks(series.span, timezone))

  /** Contiguous runs of samples with the Moon up, as [firstIndex, lastIndex]. */
  const upRuns = $derived.by(() => {
    const runs: [number, number][] = []
    let s = -1
    for (let i = 0; i <= series.times.length; i++) {
      const up = i < series.times.length && Number.isFinite(series.moonSep[i])
      if (up && s < 0) s = i
      else if (!up && s >= 0) { runs.push([s, i - 1]); s = -1 }
    }
    return runs
  })
  const hurts = $derived(series.moonIllum > WEIGHTS.moonIllumThreshold ? upRuns : [])

  const summary = $derived.by(() => {
    let k = -1
    series.moonSep.forEach((v, i) => { if (Number.isFinite(v) && (k < 0 || v < series.moonSep[k])) k = i })
    if (k < 0) return 'Moon down all night'
    const events = [
      series.moonRise !== null ? `rises ${formatLocal(series.moonRise, timezone)}` : null,
      series.moonSet !== null ? `sets ${formatLocal(series.moonSet, timezone)}` : null,
    ].filter((s) => s !== null)
    return `Moon ${Math.round(series.moonIllum * 100)}% lit · closest ${Math.round(series.moonSep[k])}° at ` +
      `${formatLocal(series.times[k], timezone)}${events.length ? ` · ${events.join(', ')}` : ''}`
  })
</script>

<figure class="moon-strip">
  <p class="label">Distance from the Moon{#if hurts.length}{' '}· shaded under {HURT_DEG}° where moonlight hurts{/if}</p>
  <svg viewBox="0 0 {VB_W} {VB_H}" role="img" aria-label="Distance from the Moon through the night">
    <rect class="bg" x={M_LEFT} y={TOP} width={PLOT_W} height={PLOT_H} />
    {#each hurts as [a, b] (a)}
      {@const x0 = Math.max(M_LEFT, xs[a] - 2.5)}
      {@const x1 = Math.min(M_LEFT + PLOT_W, xs[b] + 2.5)}
      <rect class="moon-hurts" x={x0} y={yOf(HURT_DEG)} width={x1 - x0} height={BOTTOM - yOf(HURT_DEG)} />
      <line class="hurt-edge" x1={x0} x2={x1} y1={yOf(HURT_DEG)} y2={yOf(HURT_DEG)} />
    {/each}
    {#each ticks as tk (tk.t)}
      {@const x = xOf(tk.t, series.span)}
      <line class="grid" x1={x} x2={x} y1={TOP} y2={BOTTOM} />
    {/each}
    <text class="tick" x={M_LEFT - 4} y={yOf(HURT_DEG) + 4} text-anchor="end">{HURT_DEG}°</text>
    <text class="tick" x={M_LEFT - 4} y={TOP + 9} text-anchor="end">180°</text>
    {#if sepD}<path class="moon-sep" d={sepD} />{/if}
    <rect class="frame" x={M_LEFT} y={TOP} width={PLOT_W} height={PLOT_H} />
  </svg>
  <p class="moon-summary">{summary}</p>
</figure>

<style>
  figure { margin: 0 0 12px; }
  svg { display: block; width: 100%; max-width: 560px; height: auto; }
  .bg { fill: #0c0d12; }
  .moon-hurts { fill: rgba(217, 138, 127, 0.22); }
  .hurt-edge { stroke: var(--accent-text); stroke-opacity: 0.6; stroke-dasharray: 3 3; }
  .label { margin: 0 0 2px; font-size: 12px; color: var(--text-dim); }
  .grid { stroke: #ffffff; stroke-opacity: 0.07; }
  .frame { fill: none; stroke: var(--border); }
  .tick { fill: var(--text-dim); font-size: 11px; }
  .moon-sep { fill: none; stroke: #9db8e8; stroke-width: 1.8; stroke-linejoin: round; }
  .moon-summary { margin: 4px 0 0; font-size: 13px; color: var(--text-dim); }
</style>
