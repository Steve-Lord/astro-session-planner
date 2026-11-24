<script lang="ts">
  import type { FramePreview } from '../lib/gear/preview'
  import { PANEL_OVERLAP_FACTOR } from '../lib/gear/fit'

  let { preview, fitText }: { preview: FramePreview; fitText: string } = $props()

  const VB_W = 358
  const MAX_H = 220
  const PAD = 6

  const geom = $derived.by(() => {
    const p = preview
    const e = p.ellipse
    // Unrotated, so a large object never spills out of the view.
    const hx = e ? e.rx : 0
    const hy = e ? e.ry : 0
    const extW = Math.max(p.gridW, 2 * hx)
    const extH = Math.max(p.gridH, 2 * hy)
    const s = Math.min((VB_W - 2 * PAD) / extW, (MAX_H - 2 * PAD) / extH)
    const h = extH * s + 2 * PAD
    const cx = VB_W / 2
    const cy = h / 2
    const fw = p.frameW * s
    const fh = p.frameH * s
    const x0 = cx - (p.gridW * s) / 2
    const y0 = cy - (p.gridH * s) / 2
    const panels: { x: number; y: number }[] = []
    for (let r = 0; r < p.rows; r++) {
      for (let c = 0; c < p.cols; c++) {
        panels.push({ x: x0 + c * PANEL_OVERLAP_FACTOR * fw, y: y0 + r * PANEL_OVERLAP_FACTOR * fh })
      }
    }
    return { h, cx, cy, fw, fh, panels, s }
  })

  const caption = $derived(
    `${preview.ellipse === null ? 'size unknown' : fitText} · field ${Math.round(preview.frameW)}′×${Math.round(preview.frameH)}′` +
      (preview.posAngle === null ? ' · orientation unknown' : ` · PA ${preview.posAngle}°, not drawn`),
  )
</script>

<figure class="frame-preview">
  <svg viewBox="0 0 {VB_W} {geom.h.toFixed(1)}" role="img" aria-label="Frame preview">
    {#each geom.panels as p, i (i)}
      <rect class="panel" x={p.x} y={p.y} width={geom.fw} height={geom.fh} />
    {/each}
    {#if geom.panels.length > 1}
      {#each geom.panels as p, i (i)}
        <text class="panel-no" x={p.x + 6} y={p.y + 16}>{i + 1}</text>
      {/each}
    {/if}
    {#if preview.ellipse}
      <ellipse class="object" cx={geom.cx} cy={geom.cy} rx={preview.ellipse.rx * geom.s} ry={preview.ellipse.ry * geom.s} />
    {/if}
  </svg>
  <p class="caption">{caption}</p>
</figure>

<style>
  figure { margin: 0 0 12px; }
  svg { display: block; width: 100%; max-width: 560px; height: auto; }
  .panel { fill: rgba(255, 255, 255, 0.09); stroke: #9aa0ae; stroke-width: 1.2; }
  .panel-no { fill: #c9cdd6; font-size: 13px; font-weight: 600; }
  .object { fill: rgba(181, 71, 58, 0.18); stroke: var(--accent-text); stroke-width: 1.6; }
  .caption { margin: 4px 0 0; font-size: 13px; color: var(--text-dim); }
</style>
