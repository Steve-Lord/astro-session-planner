<script lang="ts">
  import type { PlanEntry } from '../lib/types'
  import { formatLocal } from '../lib/astro/time'
  import { commonName } from '../lib/catalog/names'

  let { entry, rank, timezone }: { entry: PlanEntry; rank: number; timezone: string } = $props()
  let why = $state(false)

  const t = $derived(entry.target)
  const common = $derived(commonName(t.names))
  const fitText = $derived.by(() => {
    const f = entry.fit
    if (f.label === 'good' || f.label === 'tight') return `fills ${Math.round((f.fill ?? 0) * 100)}%`
    if (f.label === 'mosaic' && f.panels) return `MOSAIC ${f.panels[0]}×${f.panels[1]}`
    if (f.label === 'size-unknown') return 'size unknown'
    return ''
  })
  const range = $derived(`${formatLocal(entry.best.start, timezone)}–${formatLocal(entry.best.end, timezone)}`)
  const LABELS: Record<keyof PlanEntry['breakdown'], string> = {
    hours: 'Hours', altitude: 'Altitude', fit: 'Fit', contrast: 'Contrast', moon: 'Moon',
  }
  // M2: labelled factors with the values behind contrast and Moon.
  const factors = $derived.by(() => {
    const b = entry.breakdown
    const c = entry.contrastMag
    const sep = entry.minMoonSepDeg
    return [
      ['hours', `${b.hours.toFixed(2)} (${entry.totalHours.toFixed(1)} h usable)`],
      ['altitude', `${b.altitude.toFixed(2)} (peak ${Math.round(entry.peakAlt)}°)`],
      ['fit', `${b.fit.toFixed(2)} (${entry.fit.label})`],
      ['contrast', c === null ? `${b.contrast.toFixed(2)} (unknown brightness)` : `${b.contrast.toFixed(2)} (${Math.abs(c).toFixed(1)} mag ${c >= 0 ? 'fainter' : 'brighter'} than sky)`],
      ['moon', `${b.moon.toFixed(2)} (${sep === null ? 'Moon down' : `closest ${Math.round(sep)}°`})`],
    ] as [keyof PlanEntry['breakdown'], string][]
  })
</script>

<li class="row">
  <span class="rank">{rank}.</span>
  <div class="main">
    <div class="title"><strong>{t.names[0] ?? t.id}</strong>{#if common} <span class="common">{common}</span>{/if}</div>
    <div class="meta">
      {t.type} · {t.emission} · <span class="time">{range}</span> ({entry.totalHours.toFixed(1)} h) ·
      peak {Math.round(entry.peakAlt)}°{#if fitText} · <span class="fit">{fitText}</span>{/if}
    </div>
    <button type="button" class="why" aria-expanded={why} onclick={() => (why = !why)}>why</button>
    {#if why}
      <dl class="factors">
        {#each factors as [k, v] (k)}
          <dt>{LABELS[k]}</dt><dd>{v}</dd>
        {/each}
      </dl>
    {/if}
  </div>
</li>

<style>
  .row { display: flex; gap: 8px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .rank { color: var(--text-dim); min-width: 2em; text-align: right; }
  .main { flex: 1; min-width: 0; }
  .title { overflow-wrap: anywhere; }
  .common { color: var(--text-dim); }
  .meta { color: var(--text-dim); font-size: 13px; margin: 2px 0 4px; }
  .fit { color: var(--accent-text); }
  .why { min-height: 28px; padding: 0 8px; font-size: 13px; }
  .factors { display: grid; grid-template-columns: auto auto; justify-content: start; gap: 2px 12px; margin: 6px 0 0; font-size: 13px; color: var(--text-dim); }
  .factors dt, .factors dd { margin: 0; }
</style>
