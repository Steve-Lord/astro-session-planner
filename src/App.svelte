<script lang="ts">
  import { onMount } from 'svelte'
  import { startAutoSave, ui } from './lib/store/state.svelte'
  import Tonight from './ui/Tonight.svelte'
  import Sites from './ui/Sites.svelte'
  import GearView from './ui/GearView.svelte'
  import Settings from './ui/Settings.svelte'
  import SensorProbe from './ui/SensorProbe.svelte'
  import ImportHorizon from './ui/ImportHorizon.svelte'
  import { readImportHash } from './lib/horizon/share'

  const TABS = [
    { id: 'tonight', label: 'Tonight' },
    { id: 'sites', label: 'Sites' },
    { id: 'gear', label: 'Gear' },
    { id: 'settings', label: 'Settings' },
  ] as const
  type Tab = (typeof TABS)[number]['id']

  const fromHash = (): Tab => TABS.find((t) => t.id === location.hash.slice(1))?.id ?? 'tonight'
  let tab = $state<Tab>(fromHash())
  // Hidden debug screen (not in the tab bar) for checking device-orientation behaviour on a phone.
  const isProbe = () => location.hash === '#sensor-probe'
  let probe = $state(isProbe())

  // A horizon link (#import-horizon=…) opens the import dialog; the hash is then replaced so a reload
  // does not re-trigger it.
  function checkImport(): boolean {
    const payload = readImportHash(location.hash)
    if (payload === null) return false
    ui.importPayload = payload
    history.replaceState(null, '', location.pathname + location.search + '#sites')
    tab = 'sites'
    return true
  }

  onMount(() => {
    const stop = startAutoSave()
    checkImport()
    const onHash = () => {
      if (checkImport()) return
      tab = fromHash()
      probe = isProbe()
    }
    window.addEventListener('hashchange', onHash)
    return () => {
      window.removeEventListener('hashchange', onHash)
      stop()
    }
  })
</script>

{#if ui.importPayload !== null}
  <ImportHorizon payload={ui.importPayload} />
{/if}

<h1 class="app-title">Astro Session Planner</h1>
{#if !probe}
  <nav class="tabs" aria-label="Main">
    {#each TABS as t (t.id)}
      <a href={`#${t.id}`} aria-current={tab === t.id ? 'page' : undefined}>{t.label}</a>
    {/each}
  </nav>
{/if}
<!-- Tonight and Sites stay mounted (hidden) so Tonight's date/catalog and unsaved horizon edits
     survive tab switches. -->
<div hidden={probe || tab !== 'tonight'}><Tonight /></div>
<div hidden={probe || tab !== 'sites'}><Sites /></div>
{#if probe}
  <SensorProbe />
{:else if tab === 'gear'}
  <GearView />
{:else if tab === 'settings'}
  <Settings />
{/if}

<style>
  .tabs { display: flex; gap: 4px; max-width: 760px; margin: 8px auto 0; padding: 0 16px; border-bottom: 1px solid var(--border); }
  .tabs a { padding: 8px 12px; color: var(--text-dim); text-decoration: none; border-bottom: 2px solid transparent; }
  .tabs a[aria-current='page'] { color: var(--text); border-bottom-color: var(--accent); }
</style>
