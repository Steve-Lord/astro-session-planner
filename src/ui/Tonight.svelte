<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { appState, loadError, ui } from '../lib/store/state.svelte'
  import { night } from '../lib/store/night.svelte'
  import { currentPlatform, needsInstallHint } from '../lib/platform'
  import { formatLocal } from '../lib/astro/time'
  import type { Gear, Site } from '../lib/types'
  import TargetRow from './TargetRow.svelte'
  import HiddenList from './HiddenList.svelte'
  import TargetDetail from './TargetDetail.svelte'
  import NightControls from './NightControls.svelte'
  import { parseDetailHash } from '../lib/detailHash'

  const PAGE = 50
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

  const site: Site | undefined = $derived(appState.sites.find((s) => s.id === appState.selectedSiteId))
  const gear: Gear | undefined = $derived(appState.gear.find((g) => g.id === appState.selectedGearId))

  let shown = $state(PAGE)
  let loadErrorOpen = $state(loadError !== null)

  // A new plan starts back at the first page.
  $effect(() => {
    void night.plan
    shown = PAGE
  })

  // Detail screen: the list stays mounted (hidden) so its scroll and plan survive.
  let detailId = $state<string | null>(parseDetailHash(location.hash)?.id ?? null)
  let openedInApp = false
  let savedScroll = 0

  function syncDetail(first: boolean): void {
    const d = parseDetailHash(location.hash)
    if (d) {
      if (d.date && (first || d.date !== night.date)) { night.date = d.date; night.picked = true }
      if (detailId === null) {
        savedScroll = window.scrollY
        openedInApp = !first
        tick().then(() => window.scrollTo(0, 0))
      }
      detailId = d.id
    } else if (detailId !== null) {
      detailId = null
      if (location.hash === '' || location.hash === '#tonight') tick().then(() => window.scrollTo(0, savedScroll))
    }
  }

  function closeDetail(): void {
    if (openedInApp) history.back()
    else location.hash = '#tonight'
  }

  onMount(() => {
    syncDetail(true)
    const onHash = () => syncDetail(false)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  })

  // I4: iOS Safari tabs can lose storage after 7 days unvisited; suggest installing (once).
  const IOS_HINT = 'ios-install'
  const iosHint = needsInstallHint(currentPlatform())
  function dismissIosHint(): void {
    if (!appState.dismissed.includes(IOS_HINT)) appState.dismissed.push(IOS_HINT)
  }

  const detailTarget = $derived.by(() => {
    if (detailId === null || !night.catalog) return undefined
    return night.catalog.find((t) => t.id === detailId) ?? appState.customTargets.find((t) => t.id === detailId) ?? null
  })
  const detailInput = $derived(site && gear && DATE_RE.test(night.date)
    ? {
        site: $state.snapshot(site) as Site,
        gear: $state.snapshot(gear) as Gear,
        filterId: appState.selectedFilterId,
        settings: $state.snapshot(appState.settings),
        date: night.date,
      }
    : null)

  function pct(x: number): number { return Math.round(x * 100) }

  const summary = $derived.by(() => {
    const plan = night.plan
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
  {#if night.runError}
    <div class="banner error" role="alert">
      <span>{night.runError}</span>
      <button type="button" aria-label="Dismiss error" onclick={() => (night.runError = null)}>✕</button>
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
    {#if detailId === null}
    {#if site.horizon === null}
      <div class="banner warn" role="status">
        <span>No horizon set for this site — obstructions are ignored.
          <a href="#sites" onclick={() => (ui.editHorizonFor = site.id)}>Set the horizon</a></span>
      </div>
    {/if}
    <NightControls />
    {/if}

    {#if detailId !== null}
      {#if detailTarget === undefined || !detailInput}
        <p class="status" role="status">Loading…</p>
      {:else}
        <TargetDetail target={detailTarget} input={detailInput} onback={closeDetail} />
      {/if}
    {/if}

    <div hidden={detailId !== null}>
    {#if night.planning}
      <p class="status" role="status">Planning…</p>
    {:else if night.plan}
      <p class="summary">{summary}</p>
      {#if !night.plan.darkWindow}
        <div class="banner warn" role="status">No usable darkness tonight (Sun never below −12°).</div>
      {:else if night.plan.noAstroDark}
        <div class="banner warn" role="status">No astronomical darkness tonight — using nautical twilight (Sun below −12°).</div>
      {/if}
      {#if night.plan.entries.length === 0}
        <p class="status">No targets are usable this night.</p>
      {:else}
        <ol class="entries">
          {#each night.plan.entries.slice(0, shown) as e, i (e.target.id)}
            <TargetRow entry={e} rank={i + 1} timezone={site.timezone} date={night.date} />
          {/each}
        </ol>
        {#if night.plan.entries.length > shown}
          <button type="button" onclick={() => (shown += PAGE)}>Show more ({night.plan.entries.length - shown} left)</button>
        {/if}
      {/if}
      <section class="hidden" aria-label="Hidden targets">
        <h2>Hidden</h2>
        <HiddenList label="Blocked / low" targets={night.plan.hidden.blocked} date={night.date} />
        <HiddenList label="Too small" targets={night.plan.hidden['too-small']} date={night.date} />
        <HiddenList label="Too faint" targets={night.plan.hidden['too-faint']} date={night.date} />
      </section>
    {:else if !night.runError}
      <p class="status" role="status">Planning…</p>
    {/if}
    </div>
  {/if}
</main>

<style>
  main { max-width: 760px; margin: 0 auto; padding: 12px 16px 48px; }
  h2 { font-size: 16px; margin: 20px 0 6px; }
  h2.page { font-size: 18px; margin: 0 0 8px; }
  .summary { color: var(--text); margin: 12px 0 4px; }
  .status { color: var(--text-dim); }
  .entries { list-style: none; margin: 0 0 12px; padding: 0; }
</style>
