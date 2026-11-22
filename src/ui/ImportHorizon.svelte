<script lang="ts">
  import { onMount } from 'svelte'
  import { decodeHorizon } from '../lib/horizon/share'
  import { appState, ui } from '../lib/store/state.svelte'
  import type { HorizonProfile } from '../lib/types'

  let { payload }: { payload: string } = $props()

  const NEW = '__new__'
  let dialog: HTMLDialogElement
  let profile = $state<HorizonProfile | null>(null)
  let error = $state<string | null>(null)
  let target = $state<string>(
    appState.selectedSiteId && appState.sites.some((s) => s.id === appState.selectedSiteId) ? appState.selectedSiteId : NEW,
  )

  onMount(() => {
    dialog.showModal()
    let stale = false
    decodeHorizon(payload).then(
      (p) => { if (!stale) profile = p },
      (e: unknown) => { if (!stale) error = e instanceof Error ? e.message : 'This link could not be read.' },
    )
    return () => { stale = true; if (dialog.open) dialog.close() }
  })

  const line = $derived(
    profile ? profile.altitudes.map((a, i) => `${i},${(90 - a).toFixed(1)}`).join(' ') : '',
  )

  function dismiss(): void {
    ui.importPayload = null
  }

  function apply(): void {
    if (!profile) return
    if (target === NEW) {
      ui.pendingImport = $state.snapshot(profile) as HorizonProfile
      ui.openNewSite = true
      ui.importPayload = null
      return
    }
    const site = appState.sites.find((s) => s.id === target)
    if (!site) return
    if (site.horizon && !confirm(`Replace the existing horizon for ${site.name}?`)) return
    site.horizon = $state.snapshot(profile) as HorizonProfile
    ui.editHorizonFor = site.id
    ui.importPayload = null
  }
</script>

<dialog bind:this={dialog} aria-label="Import horizon" oncancel={dismiss}>
  <h3>Import horizon</h3>
  {#if error}
    <div class="banner error" role="alert">{error}</div>
    <div class="actions"><button type="button" onclick={dismiss}>Dismiss</button></div>
  {:else if profile}
    <svg viewBox="0 0 360 90" class="preview" role="img" aria-label="Imported horizon preview" preserveAspectRatio="none">
      <polygon points={`0,90 ${line} 359,90`} class="fill" />
      <polyline points={line} class="line" />
    </svg>
    <p class="hint">Choose which site this horizon belongs to. Nothing changes until you confirm.</p>
    <label>Import into
      <select bind:value={target}>
        {#each appState.sites as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
        <option value={NEW}>New site…</option>
      </select>
    </label>
    <div class="actions">
      {#if target === NEW}
        <button type="button" onclick={apply}>Continue</button>
      {:else}
        <button type="button" onclick={apply}>Replace horizon</button>
      {/if}
      <button type="button" onclick={dismiss}>Dismiss</button>
    </div>
  {:else}
    <p class="hint">Reading link…</p>
  {/if}
</dialog>

<style>
  dialog { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 12px; width: min(420px, calc(100vw - 32px)); box-sizing: border-box; }
  dialog::backdrop { background: rgba(0, 0, 0, 0.6); }
  dialog[open] { display: grid; gap: 10px; }
  h3 { margin: 0; font-size: 16px; }
  .hint { color: var(--text-dim); font-size: 13px; margin: 0; }
  .preview { width: 100%; height: 90px; background: var(--bg); border-radius: 6px; display: block; }
  .fill { fill: #2a2d38; }
  .line { fill: none; stroke: var(--text-dim); stroke-width: 1; vector-effect: non-scaling-stroke; }
  label { display: grid; gap: 2px; font-size: 13px; color: var(--text-dim); }
  select { width: 100%; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
