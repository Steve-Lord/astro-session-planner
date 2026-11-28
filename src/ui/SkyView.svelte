<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import { appState } from '../lib/store/state.svelte'
  import { night } from '../lib/store/night.svelte'
  import { DATE_RE } from '../lib/store/nightDate'
  import { domeEntries, domeFrames, initialIndex } from '../lib/sky/dome'
  import { formatLocal } from '../lib/astro/time'
  import { detailHash, parseDetailHash } from '../lib/detailHash'
  import type { Gear, Settings, Site } from '../lib/types'
  import { detailInput, detailTarget } from '../lib/store/detailView.svelte'
  import NightControls from './NightControls.svelte'
  import SkyDome from './SkyDome.svelte'
  import TargetDetail from './TargetDetail.svelte'
  import { M_LEFT, PLOT_W, VB_W, hourTicks, spanBand, xOf } from './chartAxis'

  const site: Site | undefined = $derived(appState.sites.find((s) => s.id === appState.selectedSiteId))
  const gear: Gear | undefined = $derived(appState.gear.find((g) => g.id === appState.selectedGearId))

  // Only a plan for the selected night and site; otherwise no targets rather than the previous night's.
  const entries = $derived(domeEntries(night.plan, night.planning, night.date, site?.id ?? ''))
  const planCurrent = $derived(!night.planning && night.plan !== null && night.plan.date === night.date &&
    night.plan.siteId === site?.id)
  // The Moon's % as Tonight's summary shows it, from the current plan.
  const moonPct = $derived(planCurrent && night.plan ? Math.round(night.plan.moon.illumination * 100) : null)

  const frames = $derived.by(() => {
    if (!site || !gear || !DATE_RE.test(night.date)) return null
    return domeFrames(
      $state.snapshot(site) as Site, $state.snapshot(gear) as Gear, $state.snapshot(appState.settings) as Settings,
      night.date, entries.map((e) => e.target),
    )
  })

  let index = $state(0)
  /** The owner moved the slider; cleared whenever the night (date, site or gear) changes. */
  let touched = $state(false)
  const nightKey = $derived(`${appState.selectedSiteId}|${appState.selectedGearId}|${night.date}`)
  let lastKey = ''

  $effect(() => {
    const f = frames
    const key = nightKey
    if (!f) return
    if (key !== lastKey) { lastKey = key; touched = false }
    untrack(() => {
      index = touched ? Math.min(index, f.times.length - 1) : initialIndex(f.times, Date.now(), f.dark)
    })
  })

  // Follow the clock while the date follows the clock, the slider is untouched and the page is visible.
  $effect(() => {
    const f = frames
    if (!f || night.picked || touched) return
    const follow = () => {
      if (document.visibilityState === 'visible') index = initialIndex(f.times, Date.now(), f.dark)
    }
    const id = setInterval(follow, 60_000)
    document.addEventListener('visibilitychange', follow)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', follow)
    }
  })

  function onSlide(e: Event): void {
    index = Number((e.currentTarget as HTMLInputElement).value)
    touched = true
  }

  function onpick(id: string): void {
    location.hash = detailHash(id, night.date, 'sky')
  }

  // Detail screen, mirroring Tonight: the dome stays mounted (hidden) so the slider and its
  // "touched" flag survive.
  const skyDetail = () => {
    const d = parseDetailHash(location.hash)
    return d && d.from === 'sky' ? d : null
  }
  let detailId = $state<string | null>(skyDetail()?.id ?? null)
  let openedInApp = false
  let savedScroll = 0

  function syncDetail(first: boolean): void {
    const d = skyDetail()
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
      if (location.hash === '#sky') tick().then(() => window.scrollTo(0, savedScroll))
    }
  }

  function closeDetail(): void {
    if (openedInApp) history.back()
    else location.hash = '#sky'
  }

  onMount(() => {
    syncDetail(true)
    const onHash = () => syncDetail(false)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  })

  const target = $derived(detailTarget(detailId))
  const input = $derived(detailInput(site, gear))

  const t = $derived(frames && frames.times.length ? frames.times[Math.min(index, frames.times.length - 1)] : null)
  const timeText = $derived(t !== null && site ? formatLocal(t, site.timezone) : '--:--')

  const darkIn = $derived.by(() => {
    if (t === null || !frames?.dark || t >= frames.dark.start) return null
    const mins = Math.ceil((frames.dark.start - t) / 60000)
    return `Dark in ${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
  })

  // Slider track: the span is the slider's own range so the shading lines up with the thumb.
  const TRACK_H = 14
  const TICK_Y = TRACK_H + 12
  const trackSpan = $derived(frames && frames.times.length > 1
    ? { start: frames.times[0], end: frames.times[frames.times.length - 1] }
    : null)
  const shades = $derived(frames && trackSpan
    ? ([
        ['civil', spanBand(frames.twilight.civil, trackSpan)],
        ['nautical', spanBand(frames.twilight.nautical, trackSpan)],
        ['astro', spanBand(frames.twilight.astro, trackSpan)],
        ['dark', spanBand(frames.dark, trackSpan)],
      ] as const)
    : [])
  const ticks = $derived(trackSpan && site ? hourTicks(trackSpan, site.timezone) : [])
  // The input spans the plot width plus half a thumb each side, so the thumb centre tracks xOf.
  const THUMB_PX = 32
  const inputStyle = `left: calc(${(M_LEFT / VB_W) * 100}% - ${THUMB_PX / 2}px); ` +
    `width: calc(${(PLOT_W / VB_W) * 100}% + ${THUMB_PX}px)`
</script>

<main>
  <h2 class="page">Sky</h2>

  {#if !site || !gear}
    <p>No site yet. <a href="#sites">Add a site</a> to see your sky.</p>
  {:else}
    {#if detailId !== null}
      {#if target === undefined || !input}
        <p class="status" role="status">Loading…</p>
      {:else}
        <TargetDetail {target} {input} onback={closeDetail} backLabel="‹ Sky" />
      {/if}
    {/if}

    <div hidden={detailId !== null}>
    <NightControls />

    {#if night.runError}<p class="error" role="alert">{night.runError}</p>{/if}

    {#if frames}
      <SkyDome {frames} {index} {site} {gear} {entries} {onpick} {moonPct} />

      <div class="sky-readout">
        <span class="sky-time" aria-live="polite">{timeText}</span>
        {#if darkIn}<span class="dark-in">{darkIn}</span>{/if}
      </div>

      <div class="slider">
        <svg viewBox="0 0 {VB_W} {TICK_Y + 4}" aria-hidden="true">
          <rect class="day" x={M_LEFT} y="0" width={PLOT_W} height={TRACK_H} rx="3" />
          {#each shades as [cls, b] (cls)}
            {#if b}<rect class={cls} x={b.x} y="0" width={b.w} height={TRACK_H} />{/if}
          {/each}
          <rect class="frame" x={M_LEFT} y="0" width={PLOT_W} height={TRACK_H} rx="3" />
          {#if trackSpan}
            {#each ticks as tk (tk.t)}
              {@const x = xOf(tk.t, trackSpan)}
              <line class="tick-mark" x1={x} x2={x} y1={TRACK_H} y2={TRACK_H + 3} />
              <text class="tick" x={x} y={TICK_Y} text-anchor="middle">{tk.label}</text>
            {/each}
          {/if}
        </svg>
        <input
          type="range"
          aria-label="Time"
          min="0"
          max={Math.max(0, frames.times.length - 1)}
          step="1"
          value={index}
          oninput={onSlide}
          style={inputStyle}
        />
      </div>
    {/if}

    {#if !planCurrent && !night.runError}
      <p class="status" role="status">Planning…</p>
    {:else if planCurrent && entries.length === 0}
      <p class="status">No targets are usable this night.</p>
    {/if}
    {#if site.horizon === null}<p class="note">No horizon saved for this site</p>{/if}
    </div>
  {/if}
</main>

<style>
  main { max-width: 760px; margin: 0 auto; padding: 12px 16px 48px; }
  h2.page { font-size: 18px; margin: 0 0 8px; }
  .sky-readout { display: flex; align-items: baseline; gap: 12px; margin: 8px 0 0; }
  .sky-time { font-size: 28px; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
  .dark-in { color: var(--warn-text); font-size: 14px; }
  .slider { position: relative; max-width: 560px; }
  .slider svg { display: block; width: 100%; height: auto; }
  .day { fill: #2a2e3c; }
  .civil { fill: #222531; }
  .nautical { fill: #1a1c26; }
  .astro { fill: #13151c; }
  .dark { fill: #0c0d12; }
  .frame { fill: none; stroke: #3a3f4d; }
  .tick-mark { stroke: var(--text-dim); }
  .tick { fill: var(--text-dim); font-size: 11px; }
  /* A transparent range over the shaded track: the thumb is the only visible part. */
  input[type='range'] {
    position: absolute; top: -11px; height: 36px; margin: 0; padding: 0; min-height: 0; max-width: none;
    background: transparent; border: 0; -webkit-appearance: none; appearance: none; cursor: pointer;
  }
  input[type='range']::-webkit-slider-runnable-track { height: 36px; background: transparent; }
  input[type='range']::-moz-range-track { height: 36px; background: transparent; }
  /* The thumb is 32 px wide to grab (iOS does not jump to a tapped track point); transparent side
     borders keep the visible bar 16 px wide. Keep the width in step with THUMB_PX. */
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none; box-sizing: border-box; width: 32px; height: 32px; margin-top: 2px;
    border: solid transparent; border-width: 2px 8px; border-radius: 10px / 6px;
    background: var(--accent-text); background-clip: content-box;
  }
  input[type='range']::-moz-range-thumb {
    box-sizing: border-box; width: 32px; height: 32px;
    border: solid transparent; border-width: 2px 8px; border-radius: 10px / 6px;
    background: var(--accent-text); background-clip: content-box;
  }
  .status { color: var(--text-dim); }
  .note { margin: 8px 0 0; font-size: 12px; color: var(--warn-text); }
  .error { color: var(--err-text); }
</style>
