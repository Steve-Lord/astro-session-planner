<script lang="ts">
  import type { Gear, PlanEntry, Site } from '../lib/types'
  import { obstructionPaths, project, type DomeFrames } from '../lib/sky/dome'
  import { commonName } from '../lib/catalog/names'
  import { around, pickAt, placeLabels, sideLabel, textWidth, type Box, type LabelRequest } from './domeLabels'

  let { frames, index, site, gear, entries, onpick, moonPct = null }: {
    frames: DomeFrames; index: number; site: Site; gear: Gear; entries: PlanEntry[]; onpick: (id: string) => void
    /** The plan's Moon illumination % (as Tonight shows it); null falls back to the per-step value. */
    moonPct?: number | null
  } = $props()

  // viewBox units are px when the card is 358 px wide (a 390 px phone).
  const VB = 358
  const C = VB / 2
  const R = 160
  const LABELLED = 10
  const LABEL_PX = 11
  const STAR_PX = 9
  const MOON_R = 7

  const xy = (alt: number, az: number) => {
    const p = project(alt, az, R)
    return { x: C + p.x, y: C + p.y }
  }
  const ringR = (alt: number) => (R * (90 - alt)) / 90

  // Obstructions depend on the site only, not on the slider step.
  const obstructions = $derived(obstructionPaths(site.horizon, site.treesBare, R))

  let width = $state(VB)
  /** Text scale: SVG text is in viewBox units, so on a big desktop dome it is scaled back to phone size. */
  const k = $derived(width > 0 ? Math.min(1, Math.max(0.5, VB / width)) : 1)
  /** Tap radius in viewBox units for at least 16 screen px. */
  const hitR = $derived(width > 0 ? Math.max(16, (16 * VB) / width) : 16)

  const byId = $derived(new Map(entries.map((e) => [e.target.id, e])))
  const nameOf = (id: string) => byId.get(id)?.target.names[0] ?? id

  const step = $derived(Math.max(0, Math.min(index, frames.times.length - 1)))
  const sunAlt = $derived(frames.sunAlt[step] ?? 0)

  const skyClass = $derived(
    sunAlt > -0.833 ? 'day' : sunAlt > -6 ? 'civil' : sunAlt > -12 ? 'nautical' : sunAlt > -18 ? 'astro' : 'dark')

  const targets = $derived(frames.targets.flatMap((t, rank) => {
    const alt = t.alt[step]
    if (!(alt >= 0)) return []
    return [{ id: t.id, rank, ...xy(alt, t.az[step]), faint: t.usable[step] === 0, alt }]
  }))

  const moon = $derived.by(() => {
    const alt = frames.moonAlt[step]
    if (!(alt > 0)) return null
    const p = xy(alt, frames.moonAz[step])
    const pct = moonPct ?? Math.round(frames.moonIllum[step] * 100)
    return { ...p, pct, label: sideLabel(p.x, p.y, MOON_R, `${pct}%`, 10 * k, C) }
  })

  const stars = $derived(sunAlt < -6
    ? frames.stars.flatMap((s) => (s.alt[step] > 0 ? [{ name: s.name, ...xy(s.alt[step], s.az[step]) }] : []))
    : [])

  const COMPASS = [
    { label: 'N', az: 0 }, { label: 'E', az: 90 }, { label: 'S', az: 180 }, { label: 'W', az: 270 },
  ].map((c) => ({ ...c, ...xy((-10 * 90) / R, c.az) }))   // 10 units outside the edge

  const rings = $derived([
    { alt: 30, cls: 'ring', label: '30°' },
    { alt: 60, cls: 'ring', label: '60°' },
    { alt: gear.minAltDeg, cls: 'limit', label: null },
    ...(gear.maxAltDeg < 90 ? [{ alt: gear.maxAltDeg, cls: 'limit', label: null }] : []),
  ])
  const ringLabels = [30, 60].map((alt) => ({ text: `${alt}°`, x: C + 3, y: C - ringR(alt) + 8 }))

  const dotR = (rank: number) => (rank < LABELLED ? 3.6 : 2.6)

  const labels = $derived.by(() => {
    const obstacles: Box[] = [
      ...targets.map((t) => around(t.x, t.y, dotR(t.rank) + 1)),
      ...COMPASS.map((c) => around(c.x, c.y, 7 * k)),
      ...ringLabels.map((l) => ({ x0: l.x, y0: l.y - 6 * k, x1: l.x + textWidth(l.text, 9 * k), y1: l.y + 5 * k })),
      ...stars.map((s) => around(s.x, s.y, 2)),
    ]
    if (moon) {
      obstacles.push(around(moon.x, moon.y, MOON_R + 1))
      obstacles.push(moon.label.box)
    }
    const reqs: LabelRequest[] = [
      ...targets.filter((t) => t.rank < LABELLED)
        .map((t) => ({ key: t.id, x: t.x, y: t.y, text: nameOf(t.id), fontSize: LABEL_PX * k })),
      ...stars.map((s) => ({ key: `star:${s.name}`, x: s.x, y: s.y, text: s.name, fontSize: STAR_PX * k })),
    ]
    // Every dot a name could be mistaken for: a label must sit clearly nearest its own.
    const dots = [
      ...targets.map((t) => ({ key: t.id, x: t.x, y: t.y })),
      ...stars.map((s) => ({ key: `star:${s.name}`, x: s.x, y: s.y })),
    ]
    return new Map(placeLabels(reqs, obstacles, { x0: 1, y0: 1, x1: VB - 1, y1: VB - 1 }, dots).map((p) => [p.key, p]))
  })

  let selected = $state<string | null>(null)
  const pick = $derived(selected === null ? undefined : targets.find((t) => t.id === selected))

  function select(id: string, e: Event): void {
    e.stopPropagation()
    selected = selected === id ? null : id
  }

  let svg: SVGSVGElement | undefined = $state()
  /**
   * Tap areas overlap where dots are close, and later (lower-ranked) ones are on top, so the tap is
   * resolved from the point itself: a label under the finger wins, else the nearest dot.
   */
  function tap(id: string, e: MouseEvent): void {
    const m = svg?.getScreenCTM()
    if (m) {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
      id = pickAt(p, labels.values(), targets, hitR) ?? id
    }
    select(id, e)
  }

  // A tap anywhere outside the pop-up (or Escape) closes it.
  let pop: HTMLDivElement | undefined = $state()
  $effect(() => {
    if (selected === null) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !pop?.contains(e.target as Node)) selected = null
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', close)
    }
  })
  function keySelect(id: string, e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(id, e) }
  }

  const popTitle = $derived.by(() => {
    if (!pick) return ''
    const t = byId.get(pick.id)?.target
    const common = t ? commonName(t.names) : null
    return `${nameOf(pick.id)}${common ? ` · ${common}` : ''}`
  })
  // Keep the pop-up inside the card: anchor it on the side of the dot with more room.
  const popStyle = $derived.by(() => {
    if (!pick) return ''
    const px = (pick.x / VB) * 100
    const py = (pick.y / VB) * 100
    const h = px <= 50 ? `left:${px}%` : `right:${100 - px}%`
    const v = py <= 50 ? `top:calc(${py}% + 10px)` : `bottom:calc(${100 - py}% + 10px)`
    return `${h};${v}`
  })
</script>

<div class="dome" bind:clientWidth={width} style="--k: {k}">
  <!-- A tap on empty sky closes the pop-up; Escape does the same from the keyboard (below). iOS Safari
       only sends click events to elements that look clickable, hence the handler here and the cursor. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <svg bind:this={svg} viewBox="0 0 {VB} {VB}" role="img" aria-label="Sky dome" onclick={() => (selected = null)}>
    <circle class="sky {skyClass}" cx={C} cy={C} r={R} />
    {#if obstructions.roof}<path class="roof" transform="translate({C} {C})" d={obstructions.roof} />{/if}
    {#if obstructions.trees}<path class="trees" transform="translate({C} {C})" d={obstructions.trees} />{/if}
    {#each rings as ring (ring.cls + ring.alt)}
      <circle class={ring.cls} cx={C} cy={C} r={ringR(ring.alt)} />
    {/each}
    {#each ringLabels as l (l.text)}
      <text class="ring-label" x={l.x} y={l.y}>{l.text}</text>
    {/each}
    <circle class="edge" cx={C} cy={C} r={R} />
    {#each COMPASS as c (c.label)}
      <text class="compass" x={c.x} y={c.y} text-anchor="middle" dominant-baseline="central">{c.label}</text>
    {/each}

    {#each stars as s (s.name)}
      {@const l = labels.get(`star:${s.name}`)}
      <g class="star">
        <circle cx={s.x} cy={s.y} r="1.5" />
        {#if l}<text x={l.x} y={l.y} text-anchor={l.anchor} dominant-baseline="central">{s.name}</text>{/if}
      </g>
    {/each}

    {#if moon}
      <g class="moon">
        <circle cx={moon.x} cy={moon.y} r={MOON_R} />
        <text x={moon.label.x} y={moon.label.y} text-anchor={moon.label.anchor} dominant-baseline="central">{moon.pct}%</text>
      </g>
    {/if}

    {#each targets as t (t.id)}
      {@const l = labels.get(t.id)}
      <g
        class="target"
        class:faint={t.faint}
        class:selected={selected === t.id}
        data-id={t.id}
        role="button"
        tabindex="0"
        aria-label={nameOf(t.id)}
        onclick={(e) => tap(t.id, e)}
        onkeydown={(e) => keySelect(t.id, e)}
      >
        <circle class="dot" cx={t.x} cy={t.y} r={dotR(t.rank)} />
        <circle class="hit" cx={t.x} cy={t.y} r={hitR} />
        {#if t.rank < LABELLED && l}
          {#if Math.hypot(l.lead.x2 - l.lead.x1, l.lead.y2 - l.lead.y1) > 1.5}
            <line class="lead" x1={l.lead.x1} y1={l.lead.y1} x2={l.lead.x2} y2={l.lead.y2} />
          {/if}
          <rect class="hit" x={l.box.x0} y={l.box.y0} width={l.box.x1 - l.box.x0} height={l.box.y1 - l.box.y0} />
          <text x={l.x} y={l.y} text-anchor={l.anchor} dominant-baseline="central">{nameOf(t.id)}</text>
        {/if}
      </g>
    {/each}
    {#if pick}<circle class="pick-ring" cx={pick.x} cy={pick.y} r={dotR(pick.rank) + 4} />{/if}
  </svg>
  {#if pick}
    <div class="pop" bind:this={pop} style={popStyle} role="dialog" aria-label={nameOf(pick.id)}>
      <span class="pop-name">{popTitle}</span>
      <span class="pop-alt">{Math.round(pick.alt)}° up{pick.faint ? ' · not usable now' : ''}</span>
      <button type="button" onclick={() => onpick(pick.id)}>Details ›</button>
    </div>
  {/if}
</div>

<style>
  .dome { position: relative; margin: 8px auto 0; }
  svg { display: block; width: 100%; height: auto; user-select: none; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .sky.day { fill: #2a2e3c; }
  .sky.civil { fill: #222531; }
  .sky.nautical { fill: #1a1c26; }
  .sky.astro { fill: #13151c; }
  .sky.dark { fill: #0c0d12; }
  .edge { fill: none; stroke: var(--border); stroke-width: 1.5; }
  .roof { fill: #4d3d26; stroke: #8f7445; stroke-width: 0.8; stroke-linejoin: round; }
  .trees { fill: #24402b; stroke: #4f8a5c; stroke-width: 0.8; stroke-linejoin: round; }
  .ring { fill: none; stroke: #ffffff; stroke-opacity: 0.09; }
  .limit { fill: none; stroke: #9aa0ae; stroke-opacity: 0.55; stroke-dasharray: 4 4; }
  .ring-label { fill: var(--text-dim); font-size: calc(9px * var(--k)); opacity: 0.7; }
  .compass { fill: var(--text); font-size: calc(12px * var(--k)); font-weight: 600; }
  .star circle { fill: #8c93a3; }
  .star text { fill: #646a79; font-size: calc(9px * var(--k)); }
  .moon circle { fill: #d8dce6; }
  .moon text { fill: #9db8e8; font-size: calc(10px * var(--k)); }
  .target { cursor: pointer; outline: none; }
  .target .dot { fill: #eef0f4; stroke: #0a0b0f; stroke-width: 0.8; }
  .target .hit { fill: transparent; }
  .target text { fill: #d6d9e0; font-size: calc(11px * var(--k)); paint-order: stroke; stroke: #0a0b0f; stroke-width: calc(3px * var(--k)); stroke-linejoin: round; }
  .target.faint .dot { fill: #6f7482; }
  .target.faint text { fill: #7c8190; }
  .target .lead { stroke: #8c93a3; stroke-width: 0.8; stroke-opacity: 0.7; pointer-events: none; }
  .target.faint .lead { stroke-opacity: 0.4; }
  .target.selected .dot { fill: var(--accent-text); }
  .target.selected text { fill: var(--accent-text); }
  .target.selected .lead { stroke: var(--accent-text); stroke-opacity: 1; stroke-width: 1.2; }
  .target:focus-visible .dot { stroke: var(--accent-text); stroke-width: 2; }
  .pick-ring { fill: none; stroke: var(--accent-text); stroke-width: 1.5; pointer-events: none; }
  text { pointer-events: none; }
  .pop {
    position: absolute; max-width: 55%; display: grid; gap: 4px; padding: 8px 10px;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; font-size: 13px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
  }
  .pop-name { color: var(--text); overflow-wrap: anywhere; }
  .pop-alt { color: var(--text-dim); font-size: 12px; }
  .pop button { justify-self: start; min-height: 32px; padding: 4px 10px; }
</style>
