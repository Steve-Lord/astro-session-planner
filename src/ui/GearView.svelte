<script lang="ts">
  import { appState } from '../lib/store/state.svelte'
  import { fovArcmin } from '../lib/gear/fit'

  const deg = (arcmin: number) => (arcmin / 60).toFixed(2)
</script>

<main>
  <h2 class="page">Gear</h2>
  {#each appState.gear as g (g.id)}
    {@const fov = fovArcmin(g)}
    <section class="card" aria-label={g.name}>
      <h3>{g.name}</h3>
      <dl>
        <dt>Field of view</dt>
        <dd>{Math.round(fov.long)}′ × {Math.round(fov.short)}′ ({deg(fov.long)}° × {deg(fov.short)}°)</dd>
        <dt>Focal length</dt><dd>{g.focalLengthMm} mm</dd>
        <dt>Sensor</dt><dd>{g.sensorWmm} × {g.sensorHmm} mm, {g.pixelUm} µm pixels</dd>
        <dt>Mount</dt><dd>{g.mount === 'altaz' ? 'Alt-az' : 'Equatorial'}</dd>
        <dt>Altitude limits</dt><dd>{g.minAltDeg}°–{g.maxAltDeg}°</dd>
        <dt>Filters</dt><dd>{g.filters.map((f) => f.name).join(', ')}</dd>
      </dl>
    </section>
  {/each}
  <p class="note">Gear is read-only in this version.</p>
</main>

<style>
  main { max-width: 760px; margin: 0 auto; padding: 12px 16px 48px; }
  h2.page { font-size: 18px; margin: 0 0 8px; }
  h3 { margin: 0 0 8px; font-size: 16px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin: 8px 0; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 0; }
  dt { color: var(--text-dim); }
  dd { margin: 0; }
  .note { color: var(--text-dim); font-size: 13px; }
</style>
