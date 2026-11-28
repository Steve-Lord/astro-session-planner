<script lang="ts">
  import { appState, ui } from '../lib/store/state.svelte'
  import { requestPersistentStorage } from '../lib/platform'
  import type { HorizonProfile, Site } from '../lib/types'
  import HorizonEditor from './HorizonEditor.svelte'
  import SweepView from './SweepView.svelte'

  // False while another tab (or the import dialog) is showing: a running sweep pauses.
  let { active = true }: { active?: boolean } = $props()

  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const baseZones = Intl.supportedValuesOf('timeZone')

  let editing = $state<string | null>(null) // site id, 'new', or null
  let horizonSiteId = $state<string | null>(null)
  let horizonDirty = $state(false)
  let horizonRev = $state(0) // bumped so a same-site import remounts the editor
  let error = $state<string | null>(null)
  let sweepSiteId = $state<string | null>(null)
  let sweepBins = $state(0)
  /** A sweep with more bins than this is only discarded after asking. */
  const CONFIRM_SWEEP_BINS = 30
  /** A just-finished sweep, handed to the editor mounted for exactly this site and revision. */
  let swept = $state.raw<{ siteId: string; rev: number; profile: HorizonProfile } | null>(null)
  let geoMsg = $state<string | null>(null)

  let name = $state('')
  let lat = $state('')
  let lon = $state('')
  let elevation = $state('0')
  let timezone = $state(deviceZone)
  let bortle = $state('')
  let sqm = $state('')
  let isDefault = $state(false)
  let treesBare = $state(false)

  const zones = $derived(baseZones.includes(timezone) ? baseZones : [timezone, ...baseZones])
  const horizonSite = $derived(appState.sites.find((s) => s.id === horizonSiteId))
  const sweepSite = $derived(appState.sites.find((s) => s.id === sweepSiteId))

  /** I3: confirm before discarding unsaved horizon edits. True when it is fine to leave the editor. */
  function leaveHorizon(): boolean {
    if (horizonSiteId !== null && horizonDirty && !confirm('Discard unsaved horizon changes?')) return false
    horizonDirty = false
    return true
  }

  /** Confirm before discarding a sweep (paused or running) with real progress; closes it when allowed. */
  function leaveSweep(): boolean {
    if (sweepSiteId === null) return true
    if (sweepBins > CONFIRM_SWEEP_BINS && !confirm('Discard the sweep in progress?')) return false
    sweepSiteId = null
    sweepBins = 0
    return true
  }

  /** Field values as text, to tell whether the open site form has been changed. */
  const formFields = () => JSON.stringify([name, lat, lon, elevation, timezone, bortle, sqm, isDefault, treesBare])
  let formOpened = ''

  /** Confirm before discarding typed site details; closes the form when allowed. */
  function leaveForm(): boolean {
    if (editing === null) return true
    if (formFields() !== formOpened && !confirm('Discard unsaved site details?')) return false
    editing = null
    error = null
    return true
  }

  /** At most one of the site form, a sweep and the horizon editor is open: true once it may be replaced. */
  function leavePanels(): boolean {
    return leaveForm() && leaveSweep() && leaveHorizon()
  }

  function openHorizon(id: string): void {
    if (id === horizonSiteId || !leavePanels()) return
    swept = null
    horizonSiteId = id
  }

  function closeHorizon(): void {
    horizonSiteId = null
    swept = null
  }

  function openSweep(id: string): void {
    if (id === sweepSiteId || !leavePanels()) return // the same site keeps its (paused) sweep
    closeHorizon()
    sweepSiteId = id
  }

  /** The sweep finished: open its profile in the editor as unsaved edits. False keeps the sweep open. */
  function finishSweep(profile: HorizonProfile): boolean {
    const id = sweepSiteId
    if (id === null || !appState.sites.some((s) => s.id === id) || !leaveHorizon()) return false
    sweepSiteId = null
    editing = null
    horizonRev++
    swept = { siteId: id, rev: horizonRev, profile }
    horizonSiteId = id
    return true
  }

  function sweepByHand(): void {
    const id = sweepSiteId
    sweepSiteId = null
    if (id !== null) openHorizon(id)
  }

  // I1: Tonight's "no horizon" banner asks for a site's horizon editor.
  $effect(() => {
    const id = ui.editHorizonFor
    if (id === null) return
    ui.editHorizonFor = null
    if (appState.sites.some((s) => s.id === id)) openHorizon(id)
  })

  // A horizon link asked for a new site: open the form; the decoded horizon is applied on Save.
  $effect(() => {
    if (!ui.openNewSite) return
    ui.openNewSite = false
    if (!openForm(null)) ui.pendingImport = null
  })

  // The pending import belongs to the new-site form session: drop it whenever that form is left.
  $effect(() => {
    if (editing !== 'new') ui.pendingImport = null
  })

  // An import into an existing site: only applied once any unsaved horizon edits are settled.
  $effect(() => {
    const req = ui.applyImport
    if (!req) return
    ui.applyImport = null
    const site = appState.sites.find((s) => s.id === req.siteId)
    if (!site) return
    // End a sweep or a changed site form first; with real progress, the user decides what to keep.
    if (!leavePanels()) return
    swept = null
    site.horizon = req.profile
    horizonSiteId = site.id
    horizonRev++
  })

  function openForm(site: Site | null): boolean {
    if (!leavePanels()) return false
    error = null
    geoMsg = null
    closeHorizon()
    editing = site ? site.id : 'new'
    name = site?.name ?? ''
    lat = site ? String(site.lat) : ''
    lon = site ? String(site.lon) : ''
    elevation = site ? String(site.elevation) : '0'
    timezone = site?.timezone ?? deviceZone
    bortle = site?.sky.bortle !== undefined ? String(site.sky.bortle) : ''
    sqm = site?.sky.sqm !== undefined ? String(site.sky.sqm) : ''
    isDefault = site ? site.isDefault : appState.sites.length === 0
    treesBare = site?.treesBare ?? false
    formOpened = formFields()
    return true
  }

  function ensureSelection(): void {
    if (appState.sites.length > 0 && !appState.sites.some((s) => s.id === appState.selectedSiteId)) {
      appState.selectedSiteId = (appState.sites.find((s) => s.isDefault) ?? appState.sites[0]).id
    }
    if (appState.sites.length === 0) appState.selectedSiteId = null
  }

  function numberOrNaN(text: string): number {
    return text.trim() === '' ? NaN : Number(text)
  }

  function save(): void {
    const la = numberOrNaN(lat)
    const lo = numberOrNaN(lon)
    const el = numberOrNaN(elevation)
    const bo = numberOrNaN(bortle)
    const sq = numberOrNaN(sqm)
    if (!name.trim()) return void (error = 'Name is required.')
    if (!(la >= -90 && la <= 90)) return void (error = 'Latitude must be a number from -90 to 90.')
    if (!(lo >= -180 && lo <= 180)) return void (error = 'Longitude must be a number from -180 to 180.')
    if (!Number.isFinite(el)) return void (error = 'Elevation must be a number.')
    if (bortle.trim() !== '' && !(bo >= 1 && bo <= 9)) return void (error = 'Bortle class must be from 1 to 9.')
    if (sqm.trim() !== '' && !(sq >= 15 && sq <= 23)) return void (error = 'SQM must be a number from 15 to 23.')

    const sky: Site['sky'] = {}
    if (Number.isFinite(bo)) sky.bortle = Math.round(bo)
    if (Number.isFinite(sq)) sky.sqm = sq
    const fields = { name: name.trim(), lat: la, lon: lo, elevation: el, timezone, sky, treesBare }

    if (editing === 'new') {
      requestPersistentStorage() // I4: ask the browser not to evict this origin's storage
      appState.sites.push({
        id: crypto.randomUUID(), ...fields, horizon: null,
        isDefault: isDefault || appState.sites.length === 0,
      })
    } else {
      const site = appState.sites.find((s) => s.id === editing)
      if (site) Object.assign(site, fields, { isDefault })
    }
    if (editing === 'new' && ui.pendingImport) {
      appState.sites[appState.sites.length - 1].horizon = ui.pendingImport
      ui.pendingImport = null
    }
    const saved = editing === 'new' ? appState.sites[appState.sites.length - 1] : appState.sites.find((s) => s.id === editing)
    if (saved?.isDefault) for (const s of appState.sites) if (s !== saved) s.isDefault = false
    if (appState.sites.length > 0 && !appState.sites.some((s) => s.isDefault)) appState.sites[0].isDefault = true
    ensureSelection()
    editing = null
    error = null
  }

  function remove(id: string): void {
    const i = appState.sites.findIndex((s) => s.id === id)
    if (i < 0) return
    if (!confirm(`Delete site "${appState.sites[i].name}"? Its horizon will be lost.`)) return
    appState.sites.splice(i, 1)
    if (horizonSiteId === id) { closeHorizon(); horizonDirty = false }
    if (sweepSiteId === id) sweepSiteId = null
    if (editing === id) editing = null
    if (appState.sites.length > 0 && !appState.sites.some((s) => s.isDefault)) appState.sites[0].isDefault = true
    ensureSelection()
  }

  function useMyLocation(): void {
    geoMsg = null
    if (!('geolocation' in navigator)) return void (geoMsg = 'Location is not available in this browser.')
    geoMsg = 'Locating…'
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lat = pos.coords.latitude.toFixed(4)
        lon = pos.coords.longitude.toFixed(4)
        if (pos.coords.altitude !== null && Number.isFinite(pos.coords.altitude)) elevation = String(Math.round(pos.coords.altitude))
        geoMsg = 'Location filled in. It stays in this browser.'
      },
      (err) => {
        geoMsg = err.code === err.PERMISSION_DENIED
          ? 'Location permission was denied. Enter latitude and longitude by hand.'
          : `Could not get your location: ${err.message}`
      },
      { timeout: 15_000 },
    )
  }
</script>

<main>
  <h2 class="page">Sites</h2>

  {#if appState.sites.length === 0 && editing === null}
    <p class="empty">No sites yet. Add your garden to get started.</p>
  {/if}

  <ul class="sites">
    {#each appState.sites as s (s.id)}
      <li class="site">
        <div class="head">
          <strong>{s.name}</strong>
          {#if s.isDefault}<span class="badge">default</span>{/if}
          {#if !s.horizon}<span class="badge warn">no horizon set</span>{/if}
        </div>
        <div class="meta">{s.lat.toFixed(4)}°, {s.lon.toFixed(4)}° · {s.timezone}</div>
        <div class="actions">
          <button type="button" onclick={() => openForm(s)}>Edit</button>
          <button type="button" onclick={() => openHorizon(s.id)}>Edit horizon</button>
          <button type="button" onclick={() => openSweep(s.id)}>Sweep horizon</button>
          <button type="button" onclick={() => remove(s.id)}>Delete</button>
        </div>
      </li>
    {/each}
  </ul>

  {#if editing === null}
    <button type="button" onclick={() => openForm(null)}>Add site</button>
  {:else}
    <form class="card" onsubmit={(e) => { e.preventDefault(); save() }}>
      <h3>{editing === 'new' ? 'New site' : 'Edit site'}</h3>
      {#if editing === 'new' && ui.pendingImport}<p class="hint">This new site will get the imported horizon.</p>{/if}
      {#if error}<div class="banner error" role="alert">{error}</div>{/if}
      <label>Name <input bind:value={name} autocomplete="off" /></label>
      <div class="row2">
        <label>Latitude <input bind:value={lat} inputmode="decimal" /></label>
        <label>Longitude <input bind:value={lon} inputmode="decimal" /></label>
      </div>
      <div>
        <button type="button" onclick={useMyLocation}>Use my location</button>
        {#if geoMsg}<span class="hint" role="status">{geoMsg}</span>{/if}
      </div>
      <label>Elevation (m) <input bind:value={elevation} inputmode="decimal" /></label>
      <label>Time zone
        <select bind:value={timezone} aria-label="Time zone">
          {#each zones as z (z)}<option value={z}>{z}</option>{/each}
        </select>
      </label>
      <div class="row2">
        <label>Bortle class <input bind:value={bortle} inputmode="numeric" placeholder="1–9" /></label>
        <label>SQM (optional) <input bind:value={sqm} inputmode="decimal" placeholder="e.g. 19.3" /></label>
      </div>
      <p class="hint">Look up your sky brightness at
        <a href="https://www.lightpollutionmap.info" target="_blank" rel="noopener noreferrer">lightpollutionmap.info</a>
        (opens separately; no location is sent).</p>
      <label class="check"><input type="checkbox" bind:checked={isDefault} /> Default site</label>
      <label class="check"><input type="checkbox" bind:checked={treesBare} /> Trees bare (leaf-off horizon)</label>
      <div class="actions">
        <button type="submit">Save site</button>
        <button type="button" onclick={() => { editing = null; error = null; ui.pendingImport = null }}>Cancel</button>
      </div>
    </form>
  {/if}

  {#if sweepSite}
    {#key sweepSite.id}
      <SweepView site={sweepSite} {active} bind:sweptBins={sweepBins} onfinish={finishSweep} onmanual={sweepByHand} oncancel={() => (sweepSiteId = null)} />
    {/key}
  {/if}

  {#if horizonSite}
    {#key `${horizonSite.id}:${horizonRev}`}
      <HorizonEditor
        site={horizonSite}
        initial={swept && swept.siteId === horizonSite.id && swept.rev === horizonRev ? swept.profile : undefined}
        bind:dirty={horizonDirty}
        {active}
        onclose={closeHorizon}
      />
    {/key}
  {/if}
</main>

<style>
  main { max-width: var(--page-max); margin: 0 auto; padding: 12px 16px 48px; }
  h2.page { font-size: 18px; margin: 0 0 8px; }
  h3 { margin: 0; font-size: 16px; }
  .sites { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 8px; }
  .site, .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
  .card { display: grid; gap: 10px; margin: 12px 0; }
  .head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .meta, .hint, .empty { color: var(--text-dim); font-size: 13px; }
  .hint { margin: 0; }
  .badge { font-size: 12px; padding: 1px 8px; border-radius: 10px; background: var(--surface-2); color: var(--text-dim); }
  .badge.warn { background: var(--warn-bg); color: var(--warn-text); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  label { display: grid; gap: 2px; font-size: 13px; color: var(--text-dim); }
  label.check { display: flex; gap: 8px; align-items: center; }
  label.check input { min-height: 0; width: auto; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  input, select { width: 100%; }
</style>
