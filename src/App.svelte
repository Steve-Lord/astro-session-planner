<script lang="ts">
  import { onMount } from 'svelte'
  import { startAutoSave } from './lib/store/state.svelte'
  import Tonight from './ui/Tonight.svelte'
  import Sites from './ui/Sites.svelte'
  import GearView from './ui/GearView.svelte'
  import Settings from './ui/Settings.svelte'

  const TABS = [
    { id: 'tonight', label: 'Tonight' },
    { id: 'sites', label: 'Sites' },
    { id: 'gear', label: 'Gear' },
    { id: 'settings', label: 'Settings' },
  ] as const
  type Tab = (typeof TABS)[number]['id']

  const fromHash = (): Tab => TABS.find((t) => t.id === location.hash.slice(1))?.id ?? 'tonight'
  let tab = $state<Tab>(fromHash())

  onMount(() => {
    const stop = startAutoSave()
    const onHash = () => (tab = fromHash())
    window.addEventListener('hashchange', onHash)
    return () => {
      window.removeEventListener('hashchange', onHash)
      stop()
    }
  })
</script>

<h1 class="app-title">Astro Session Planner</h1>
<nav class="tabs" aria-label="Main">
  {#each TABS as t (t.id)}
    <a href={`#${t.id}`} aria-current={tab === t.id ? 'page' : undefined}>{t.label}</a>
  {/each}
</nav>
<!-- Tonight stays mounted (hidden) so its date and loaded catalog survive tab switches. -->
<div hidden={tab !== 'tonight'}><Tonight /></div>
{#if tab === 'sites'}
  <Sites />
{:else if tab === 'gear'}
  <GearView />
{:else}
  <Settings />
{/if}

<style>
  .tabs { display: flex; gap: 4px; max-width: 760px; margin: 8px auto 0; padding: 0 16px; border-bottom: 1px solid var(--border); }
  .tabs a { padding: 8px 12px; color: var(--text-dim); text-decoration: none; border-bottom: 2px solid transparent; }
  .tabs a[aria-current='page'] { color: var(--text); border-bottom-color: var(--accent); }
</style>
