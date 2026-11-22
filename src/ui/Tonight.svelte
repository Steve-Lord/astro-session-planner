<script lang="ts">
  import { onMount } from 'svelte'
  import { appState, loadError, ui } from '../lib/store/state.svelte'
  import { currentPlatform, needsInstallHint } from '../lib/platform'
  import { loadCatalog } from '../lib/catalog/load'
  import { planNightAsync } from '../lib/plan/planAsync'
  import { formatLocal, tonight } from '../lib/astro/time'
  import type { Gear, NightPlan, Site, Target } from '../lib/types'
  import TargetRow from './TargetRow.svelte'
  import HiddenList from './HiddenList.svelte'

  const PAGE = 50
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

  const site: Site | undefined = $derived(appState.sites.find((s) => s.id === appState.selectedSiteId))
  const gear: Gear | undefined = $derived(appState.gear.find((g) => g.id === appState.selectedGearId))

  let date = $state<string>('')
  // M5: true once the date came from ?date= or the user; otherwise "tonight" follows the clock.
  let datePicked = false
  let catalog = $state.raw<Target[] | null>(null)
  let plan = $state.raw<NightPlan | null>(null)
  let planning = $state(false)
  let shown = $state(PAGE)
  let loadErrorOpen = $state(loadError !== null)
  let runError = $state<string | null>(null)
  let reqId = 0

  onMount(() => {
    loadCatalog('./catalog.json').then(
      (c) => (catalog = c),
      (e) => (runError = `Could not load the target catalog: ${(e as Error).message}`),
    )
  })

  // Initial date: ?date= param, else tonight at the site.
  $effect(() => {
    if (date || !site) return
    const q = new URLSearchParams(location.search).get('date')
    datePicked = !!(q && DATE_RE.test(q))
    date = q && DATE_RE.test(q) ? q : tonight(site.timezone)
  })

  // M5: a PWA resumed the next day should plan the new "tonight" unless the user chose a date.
  onMount(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || datePicked || !site) return
      const t = tonight(site.timezone)
      if (t !== date) date = t
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  })

  function shift(days: number): void {
    const [y, m, d] = date.split('-').map(Number)
    datePicked = true
    date = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
  }

  // I4: iOS Safari tabs can lose storage after 7 days unvisited; suggest installing (once).
  const IOS_HINT = 'ios-install'
  const iosHint = needsInstallHint(currentPlatform())
  function dismissIosHint(): void {
    if (!appState.dismissed.includes(IOS_HINT)) appState.dismissed.push(IOS_HINT)
  }

  $effect(() => {
    if (!site || !gear || !catalog || !DATE_RE.test(date)) return
    const input = {
      site: $state.snapshot(site) as Site,
      gear: $state.snapshot(gear) as Gear,
      filterId: appState.selectedFilterId,
      settings: $state.snapshot(appState.settings),
      date,
      catalog: [...catalog, ...($state.snapshot(appState.customTargets) as Target[])],
    }
    const id = ++reqId
    planning = true
    runError = null
    shown = PAGE
    planNightAsync(input).then(
      (p) => { if (id === reqId) { plan = p; planning = false } },
      (e) => { if (id === reqId) { plan = null; planning = false; runError = `Planning failed: ${(e as Error).message}` } },
    )
  })

  function onGear(): void {
    const g = appState.gear.find((x) => x.id === appState.selectedGearId)
    if (g && !g.filters.some((f) => f.id === appState.selectedFilterId)) appState.selectedFilterId = g.filters[0]?.id ?? ''
  }

  const dateLabel = $derived.by(() => {
    if (!DATE_RE.test(date)) return ''
    return new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  })

  function pct(x: number): number { return Math.round(x * 100) }

  const summary = $derived.by(() => {
    if (!plan || !site) return ''
    const tz = site.timezone
    const label = plan.darkSunAltUsed === -12 ? 'Nautical dark' : 'Dark'
    const dark = plan.darkWindow
      ? `${label} ${formatLocal(plan.darkWindow.start, tz)}–${formatLocal(plan.darkWindow.end, tz)}`
      : 'No dark window'
    const m = plan.moon
    const parts: string[] = []
    if (m.rise !== null) parts.push(`rises ${formatLocal(m.rise, tz)}`)
    if (m.set !== null) parts.push(`sets ${formatLocal(m.set, tz)}`)
    return `${dark} · Moon ${pct(m.illumination)}%${parts.length ? ' ' + parts.join(', ') : ''}`
  })
</script>

<main>
  <h2 class="page">Tonight</h2>

  {#if loadError && loadErrorOpen}
    <div class="banner error" role="alert">
      <span>{loadError}</span>
      <button type="button" aria-label="Dismiss message" onclick={() => (loadErrorOpen = false)}>✕</button>
    </div>
  {/if}
  {#if runError}
    <div class="banner error" role="alert">
      <span>{runError}</span>
      <button type="button" aria-label="Dismiss error" onclick={() => (runError = null)}>✕</button>
    </div>
  {/if}

  {#if iosHint && appState.sites.length > 0 && !appState.dismissed.includes(IOS_HINT)}
    <div class="banner info" role="status">
      <span>Add to Home Screen to keep your sites — and export a backup in <a href="#settings">Settings</a>.</span>
      <button type="button" aria-label="Dismiss install hint" onclick={dismissIosHint}>✕</button>
    </div>
  {/if}

  {#if !site}
    <p>No site yet. <a href="#sites">Add a site</a> to see tonight's targets.</p>
  {:else}
    {#if site.horizon === null}
      <div class="banner warn" role="status">
        <span>No horizon set for this site — obstructions are ignored.
          <a href="#sites" onclick={() => (ui.editHorizonFor = site.id)}>Set the horizon</a></span>
      </div>
    {/if}
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
        <input type="date" aria-label="Date" bind:value={date} oninput={() => (datePicked = true)} />
        <button type="button" aria-label="Next day" onclick={() => shift(1)}>▶</button>
        <span class="datelabel">{dateLabel}</span>
      </div>
    </section>

    {#if planning}
      <p class="status" role="status">Planning…</p>
    {:else if plan}
      <p class="summary">{summary}</p>
      {#if !plan.darkWindow}
        <div class="banner warn" role="status">No usable darkness tonight (Sun never below −12°).</div>
      {:else if plan.noAstroDark}
        <div class="banner warn" role="status">No astronomical darkness tonight — using nautical twilight (Sun below −12°).</div>
      {/if}
      {#if plan.entries.length === 0}
        <p class="status">No targets are usable this night.</p>
      {:else}
        <ol class="entries">
          {#each plan.entries.slice(0, shown) as e, i (e.target.id)}
            <TargetRow entry={e} rank={i + 1} timezone={site.timezone} />
          {/each}
        </ol>
        {#if plan.entries.length > shown}
          <button type="button" onclick={() => (shown += PAGE)}>Show more ({plan.entries.length - shown} left)</button>
        {/if}
      {/if}
      <section class="hidden" aria-label="Hidden targets">
        <h2>Hidden</h2>
        <HiddenList label="Blocked / low" targets={plan.hidden.blocked} />
        <HiddenList label="Too small" targets={plan.hidden['too-small']} />
        <HiddenList label="Too faint" targets={plan.hidden['too-faint']} />
      </section>
    {:else if !runError}
      <p class="status" role="status">Planning…</p>
    {/if}
  {/if}
</main>

<style>
  main { max-width: 760px; margin: 0 auto; padding: 12px 16px 48px; }
  h2 { font-size: 16px; margin: 20px 0 6px; }
  h2.page { font-size: 18px; margin: 0 0 8px; }
  .controls { display: grid; gap: 8px; }
  label { display: grid; gap: 2px; font-size: 13px; color: var(--text-dim); }
  select { width: 100%; }
  .datebar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .datelabel { color: var(--text-dim); }
  .summary { color: var(--text); margin: 12px 0 4px; }
  .status { color: var(--text-dim); }
  .entries { list-style: none; margin: 0 0 12px; padding: 0; }
</style>
