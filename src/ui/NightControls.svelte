<script lang="ts">
  import { appState } from '../lib/store/state.svelte'
  import { night, pickDate } from '../lib/store/night.svelte'
  import { DATE_RE, shiftDate } from '../lib/store/nightDate'
  import type { Gear } from '../lib/types'

  const gear: Gear | undefined = $derived(appState.gear.find((g) => g.id === appState.selectedGearId))

  function onGear(): void {
    const g = appState.gear.find((x) => x.id === appState.selectedGearId)
    if (g && !g.filters.some((f) => f.id === appState.selectedFilterId)) appState.selectedFilterId = g.filters[0]?.id ?? ''
  }

  function shift(days: number): void {
    pickDate(shiftDate(night.date, days))
  }

  const dateLabel = $derived.by(() => {
    if (!DATE_RE.test(night.date)) return ''
    return new Date(night.date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  })
</script>

<section class="controls" aria-label="Plan settings">
  <label>Site
    <select bind:value={appState.selectedSiteId}>
      {#each appState.sites as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
    </select>
  </label>
  <label>Gear
    <select bind:value={appState.selectedGearId} onchange={onGear}>
      {#each appState.gear as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
    </select>
  </label>
  <label>Filter
    <select bind:value={appState.selectedFilterId}>
      {#each gear?.filters ?? [] as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
    </select>
  </label>
  <div class="datebar">
    <button type="button" aria-label="Previous day" onclick={() => shift(-1)}>◀</button>
    <input type="date" aria-label="Date" bind:value={night.date} oninput={() => (night.picked = true)} />
    <button type="button" aria-label="Next day" onclick={() => shift(1)}>▶</button>
    <span class="datelabel">{dateLabel}</span>
  </div>
</section>

<style>
  .controls { display: grid; gap: 8px; }
  label { display: grid; gap: 2px; font-size: 13px; color: var(--text-dim); }
  select { width: 100%; }
  .datebar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .datelabel { color: var(--text-dim); }
  @media (min-width: 1000px) {
    .controls { grid-template-columns: repeat(3, minmax(0, 1fr)) auto; align-items: end; gap: 12px; }
  }
</style>
