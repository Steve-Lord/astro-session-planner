<script lang="ts">
  import { appState } from '../lib/store/state.svelte'
  import { fovArcmin, withMount } from '../lib/gear/fit'
  import type { Gear } from '../lib/types'

  const MOUNTS: { id: Gear['mount']; label: string }[] = [
    { id: 'altaz', label: 'Alt-az' },
    { id: 'eq', label: 'Equatorial' },
  ]

  function setMount(i: number, m: Gear['mount']): void {
    if (appState.gear[i].mount !== m) appState.gear[i] = withMount(appState.gear[i], m)
  }

  const deg = (arcmin: number) => (arcmin / 60).toFixed(2)
</script>

<main>
  <h2 class="page">Gear</h2>
  {#each appState.gear as g, i (g.id)}
    {@const fov = fovArcmin(g)}
    <section class="card" aria-label={g.name}>
      <h3>{g.name}</h3>
      <dl>
        <dt>Field of view</dt>
        <dd>{Math.round(fov.long)}′ × {Math.round(fov.short)}′ ({deg(fov.long)}° × {deg(fov.short)}°)</dd>
        <dt>Focal length</dt><dd>{g.focalLengthMm} mm</dd>
        <dt>Sensor</dt><dd>{g.sensorWmm} × {g.sensorHmm} mm, {g.pixelUm} µm pixels</dd>
        <dt>Mount</dt>
        <dd>
          <div class="seg" role="group" aria-label="Mount">
            {#each MOUNTS as m (m.id)}
              <button type="button" aria-pressed={g.mount === m.id} onclick={() => setMount(i, m.id)}>{m.label}</button>
            {/each}
          </div>
        </dd>
        <dt>Altitude limits</dt><dd>{g.minAltDeg}°–{g.maxAltDeg}°</dd>
        <dt>Filters</dt><dd>{g.filters.map((f) => f.name).join(', ')}</dd>
      </dl>
      {#if g.mount === 'altaz'}
        <p class="note">Alt-az: tracking fails above 80° and the field rotates during long sessions.</p>
      {/if}
    </section>
  {/each}
  <p class="note">Gear is read-only in this version, apart from the mount.</p>
</main>

<style>
  main { max-width: var(--page-max); margin: 0 auto; padding: 12px 16px 48px; }
  h2.page { font-size: 18px; margin: 0 0 8px; }
  h3 { margin: 0 0 8px; font-size: 16px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin: 8px 0; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 0; }
  dt { color: var(--text-dim); }
  dd { margin: 0; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .seg button { background: transparent; color: var(--text-dim); border: 0; padding: 4px 14px; min-height: 40px; font: inherit; cursor: pointer; }
  .seg button + button { border-left: 1px solid var(--border); }
  .seg button[aria-pressed='true'] { background: var(--surface-2); color: var(--accent-text); }
  .note { color: var(--text-dim); font-size: 13px; }
</style>
