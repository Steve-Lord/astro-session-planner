<script lang="ts">
  import { appState } from '../lib/store/state.svelte'
  import { exportState, importState, type AppState } from '../lib/store/state'
  import { DEFAULT_SETTINGS } from '../lib/sky/brightness'
  import { customTarget } from '../lib/catalog/custom'
  import { parseDec, parseRa } from '../lib/catalog/coords'
  import type { Settings } from '../lib/types'

  const FIELDS: { key: Exclude<keyof Settings, 'darkSunAlt'>; label: string; step: string }[] = [
    { key: 'clearanceDeg', label: 'Horizon clearance (°)', step: '0.5' },
    { key: 'faintLimitMag', label: 'Faint limit (mag)', step: '0.1' },
    { key: 'dualBandGainMag', label: 'Dual-band gain (mag)', step: '0.1' },
    { key: 'narrowbandGainMag', label: 'Narrowband gain (mag)', step: '0.1' },
    { key: 'broadbandFilterPenaltyMag', label: 'Broadband filter penalty (mag)', step: '0.1' },
    { key: 'tooSmallFill', label: 'Too-small fill fraction', step: '0.01' },
  ]

  const TYPES: [string, string][] = [
    ['G', 'Galaxy'], ['EmN', 'Emission nebula'], ['RfN', 'Reflection nebula'], ['PN', 'Planetary nebula'],
    ['SNR', 'Supernova remnant'], ['OCl', 'Open cluster'], ['GCl', 'Globular cluster'], ['Neb', 'Other nebula'],
  ]

  function setNumber(key: keyof Settings, text: string): void {
    const v = Number(text)
    if (text.trim() !== '' && Number.isFinite(v)) (appState.settings as unknown as Record<string, number>)[key] = v
  }
  function setDarkAlt(text: string): void {
    appState.settings.darkSunAlt = text === '-12' ? -12 : -18
  }
  function resetDefaults(): void {
    Object.assign(appState.settings, DEFAULT_SETTINGS)
  }

  // Custom targets
  let tName = $state('')
  let tRa = $state('')
  let tDec = $state('')
  let tMaj = $state('')
  let tMin = $state('')
  let tType = $state('G')
  let tMag = $state('')
  let tError = $state<string | null>(null)

  function addTarget(): void {
    const name = tName.trim()
    const ra = parseRa(tRa)
    const dec = parseDec(tDec)
    const maj = Number(tMaj)
    const min = tMin.trim() === '' ? maj : Number(tMin)
    const mag = tMag.trim() === '' ? null : Number(tMag)
    if (!name) return void (tError = 'Name is required.')
    if (ra === null) return void (tError = 'RA must be h:m:s, e.g. 5:34:32 (hours 0–23).')
    if (dec === null) return void (tError = 'Dec must be ±d:m:s, e.g. +22:0:52 (within ±90°).')
    if (!(tMaj.trim() !== '' && maj > 0)) return void (tError = 'Major axis must be a positive number of arcminutes.')
    if (!(min > 0)) return void (tError = 'Minor axis must be a positive number of arcminutes.')
    if (mag !== null && !Number.isFinite(mag)) return void (tError = 'Magnitude must be a number.')
    appState.customTargets.push(customTarget({
      id: `custom-${crypto.randomUUID()}`, name, ra, dec, majArcmin: maj, minArcmin: min, type: tType, mag,
    }))
    tName = tRa = tDec = tMaj = tMin = tMag = ''
    tError = null
  }
  function removeTarget(id: string): void {
    const i = appState.customTargets.findIndex((t) => t.id === id)
    if (i >= 0) appState.customTargets.splice(i, 1)
  }

  // Backup
  let importError = $state<string | null>(null)
  let importOk = $state<string | null>(null)

  function exportBackup(): void {
    const blob = new Blob([exportState($state.snapshot(appState) as AppState)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'astro-session-planner-backup.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function onImport(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    importError = importOk = null
    try {
      const next = importState(await file.text())
      for (const k of Object.keys(next) as (keyof AppState)[]) (appState as unknown as Record<string, unknown>)[k] = next[k]
      importOk = `Imported ${next.sites.length} site(s) and ${next.customTargets.length} custom target(s).`
    } catch (err) {
      importError = (err as Error).message
    }
  }
</script>

<main>
  <h2 class="page">Settings</h2>

  <section class="card" aria-label="Thresholds">
    <h3>Thresholds</h3>
    <div class="grid">
      {#each FIELDS as f (f.key)}
        <label>{f.label} <span class="def">(default {DEFAULT_SETTINGS[f.key]})</span>
          <input type="number" step={f.step} value={appState.settings[f.key]} oninput={(e) => setNumber(f.key, e.currentTarget.value)} />
        </label>
      {/each}
      <label>Dark window Sun altitude <span class="def">(default −18°)</span>
        <select value={String(appState.settings.darkSunAlt)} onchange={(e) => setDarkAlt(e.currentTarget.value)}>
          <option value="-18">−18° (astronomical)</option>
          <option value="-12">−12° (nautical)</option>
        </select>
      </label>
    </div>
    <div><button type="button" onclick={resetDefaults}>Reset defaults</button></div>
  </section>

  <section class="card" aria-label="Custom targets">
    <h3>Custom targets</h3>
    {#if appState.customTargets.length === 0}<p class="hint">None yet.</p>{/if}
    <ul class="targets">
      {#each appState.customTargets as t (t.id)}
        <li>
          <span>{t.names[0]} <span class="hint">{t.type} · {t.majArcmin}′ × {t.minArcmin}′</span></span>
          <button type="button" aria-label={`Delete ${t.names[0]}`} onclick={() => removeTarget(t.id)}>Delete</button>
        </li>
      {/each}
    </ul>
    <form onsubmit={(e) => { e.preventDefault(); addTarget() }}>
      {#if tError}<div class="banner error" role="alert">{tError}</div>{/if}
      <label>Target name <input bind:value={tName} autocomplete="off" /></label>
      <div class="row2">
        <label>RA (h:m:s) <input bind:value={tRa} placeholder="5:34:32" /></label>
        <label>Dec (±d:m:s) <input bind:value={tDec} placeholder="+22:00:52" /></label>
      </div>
      <div class="row2">
        <label>Major axis (arcmin) <input bind:value={tMaj} inputmode="decimal" /></label>
        <label>Minor axis (arcmin) <input bind:value={tMin} inputmode="decimal" placeholder="same as major" /></label>
      </div>
      <div class="row2">
        <label>Type
          <select bind:value={tType}>
            {#each TYPES as [code, label] (code)}<option value={code}>{label}</option>{/each}
          </select>
        </label>
        <label>Magnitude (optional) <input bind:value={tMag} inputmode="decimal" /></label>
      </div>
      <div><button type="submit">Add target</button></div>
    </form>
  </section>

  <section class="card" aria-label="Backup">
    <h3>Backup</h3>
    <p class="hint">Sites, horizons and settings live only in this browser. Export a copy to keep or move them.</p>
    <div><button type="button" onclick={exportBackup}>Export backup</button></div>
    <label>Import backup <input type="file" accept="application/json,.json" onchange={onImport} /></label>
    {#if importError}<div class="banner error" role="alert">{importError}</div>{/if}
    {#if importOk}<div class="banner ok" role="status">{importOk}</div>{/if}
  </section>

  <section class="card" aria-label="About">
    <h3>About</h3>
    <p class="hint">Target data from <a href="https://github.com/mattiaverga/OpenNGC" target="_blank" rel="noopener noreferrer">OpenNGC</a>
      by Mattia Verga, licensed
      <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC-BY-SA-4.0</a>.</p>
  </section>
</main>

<style>
  main { max-width: 760px; margin: 0 auto; padding: 12px 16px 48px; }
  h2.page { font-size: 18px; margin: 0 0 8px; }
  h3 { margin: 0; font-size: 16px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin: 12px 0; display: grid; gap: 10px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  form { display: grid; gap: 8px; }
  label { display: grid; gap: 2px; font-size: 13px; color: var(--text-dim); min-width: 0; }
  .def, .hint { color: var(--text-dim); font-size: 12px; }
  p.hint { margin: 0; font-size: 13px; }
  input, select { width: 100%; }
  .targets { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .targets li { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
  .banner.ok { background: #14261c; color: #8fc9a0; }
</style>
