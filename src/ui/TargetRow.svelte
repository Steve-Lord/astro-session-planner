<script lang="ts">
  import type { PlanEntry } from '../lib/types'
  import { commonName } from '../lib/catalog/names'
  import { detailHash } from '../lib/detailHash'
  import { fitText, hoursText, peakText, windowText } from './format'

  let { entry, rank, timezone, date }: { entry: PlanEntry; rank: number; timezone: string; date: string } = $props()

  const t = $derived(entry.target)
  const common = $derived(commonName(t.names))
  const fit = $derived(fitText(entry.fit))
</script>

<li class="row">
  <span class="rank">{rank}.</span>
  <a class="main" href={detailHash(t.id, date)}>
    <div class="title"><strong>{t.names[0] ?? t.id}</strong>{#if common}{' '}<span class="common">{common}</span>{/if}</div>
    <div class="meta">
      {t.type} · {t.emission} · <span class="time">{windowText(entry, timezone)}</span> {hoursText(entry)} ·
      {peakText(entry)}{#if fit} · <span class="fit">{fit}</span>{/if}
    </div>
  </a>
</li>

<style>
  .row { display: flex; gap: 8px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .rank { color: var(--text-dim); min-width: 2em; text-align: right; }
  .main { flex: 1; min-width: 0; color: inherit; text-decoration: none; }
  .title { overflow-wrap: anywhere; }
  .common { color: var(--text-dim); }
  .meta { color: var(--text-dim); font-size: 13px; margin: 2px 0 4px; }
  .fit { color: var(--accent-text); }
  @media (min-width: 1000px) {
    .main { display: flex; gap: 16px; align-items: baseline; }
    .title { flex: 0 0 300px; }
    .meta { flex: 1; margin: 0; }
  }
</style>
