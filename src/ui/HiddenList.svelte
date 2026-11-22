<script lang="ts">
  import type { Target } from '../lib/types'

  let { label, targets }: { label: string; targets: Target[] } = $props()
  const CAP = 200
  let open = $state(false)
  // Brightest first (unknown magnitude last), so the capped list shows the notable objects.
  const sorted = $derived([...targets].sort((a, b) => (a.mag ?? Infinity) - (b.mag ?? Infinity)))
</script>

<div class="hidden-list">
  <button type="button" aria-expanded={open} onclick={() => (open = !open)}>
    {label} ({targets.length})
  </button>
  {#if open}
    <ul>
      {#each sorted.slice(0, CAP) as t (t.id)}
        <li>{t.names[0] ?? t.id}</li>
      {/each}
    </ul>
    {#if targets.length > CAP}<p class="more">+{targets.length - CAP} more</p>{/if}
  {/if}
</div>

<style>
  .hidden-list { margin: 6px 0; }
  ul { margin: 6px 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--text-dim); font-size: 13px; }
  .more { margin: 4px 0 0; color: var(--text-dim); font-size: 13px; }
</style>
