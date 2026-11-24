<script lang="ts">
  import type { Target, TargetVerdict } from '../lib/types'
  import type { PlanInput } from '../lib/plan/night'
  import { explainTarget } from '../lib/plan/night'
  import { commonName } from '../lib/catalog/names'
  import { fitText, factorRows, hoursText, peakText, windowText } from './format'

  let { target, input, onback }: { target: Target | null; input: Omit<PlanInput, 'catalog'>; onback: () => void } = $props()

  const verdict: TargetVerdict | null = $derived(target ? explainTarget(input, target) : null)
  const common = $derived(target ? commonName(target.names) : null)

  function hiddenText(v: Extract<TargetVerdict, { kind: 'hidden' }>): string {
    switch (v.cause) {
      case 'no-dark': return 'Hidden: no usable darkness this night'
      case 'never-rises': return `Hidden: never rises above ${input.gear.minAltDeg}° from here`
      case 'never-clears': return "Hidden: never clears your horizon while it's dark"
      case 'short-gaps': return 'Hidden: only clear for gaps under 30 minutes'
      case 'too-small': return `Hidden: too small — fills ${Math.round((v.fill ?? 0) * 100)}% of the frame`
      case 'too-faint': return `Hidden: too faint — ${(v.contrastMag ?? 0).toFixed(1)} mag fainter than the sky`
    }
  }
</script>

<section class="detail" aria-label="Target detail">
  <button type="button" class="back" onclick={onback}>‹ Tonight</button>
  {#if !target || !verdict}
    <p>This target isn't in the catalogue any more.</p>
  {:else}
    <h2>{target.names[0] ?? target.id}{#if common} <span class="common">{common}</span>{/if}</h2>
    <p class="kind">{target.type} · {target.emission}</p>
    {#if verdict.kind === 'entry'}
      <p class="summary">
        <span class="time">{windowText(verdict.entry, input.site.timezone)}</span> {hoursText(verdict.entry)} ·
        {peakText(verdict.entry)}{#if fitText(verdict.entry.fit)} · {fitText(verdict.entry.fit)}{/if}
      </p>
    {:else}
      <p class="summary hidden-reason">{hiddenText(verdict)}</p>
    {/if}
    <div class="charts"></div>
    {#if verdict.kind === 'entry'}
      <dl class="factors">
        {#each factorRows(verdict.entry) as [k, v] (k)}
          <dt>{k}</dt><dd>{v}</dd>
        {/each}
      </dl>
    {/if}
  {/if}
</section>

<style>
  .detail { padding-top: 4px; }
  .back { min-height: 36px; padding: 0 10px; }
  h2 { font-size: 18px; margin: 12px 0 2px; overflow-wrap: anywhere; }
  .common { color: var(--text-dim); font-weight: normal; }
  .kind { color: var(--text-dim); margin: 0 0 8px; }
  .summary { margin: 4px 0 12px; }
  .factors { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; margin: 12px 0 0; font-size: 14px; color: var(--text-dim); }
  .factors dt, .factors dd { margin: 0; }
</style>
