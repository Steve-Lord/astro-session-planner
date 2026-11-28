import { formatInTimeZone } from 'date-fns-tz'
import type { TimeWindow } from '../lib/types'

/** Shared horizontal axis for the altitude chart and the Moon strip (viewBox units = px at 358 px). */
export const VB_W = 358
export const M_LEFT = 30
export const M_RIGHT = 8
export const PLOT_W = VB_W - M_LEFT - M_RIGHT

export function xOf(t: number, span: TimeWindow): number {
  return M_LEFT + ((t - span.start) / (span.end - span.start)) * PLOT_W
}

/** The x position and width of a window clipped to the span, or null when it lies outside it. */
export function spanBand(w: TimeWindow | null, span: TimeWindow): { x: number; w: number } | null {
  if (!w) return null
  const a = Math.max(w.start, span.start)
  const b = Math.min(w.end, span.end)
  if (b <= a) return null
  const x = xOf(a, span)
  return { x, w: xOf(b, span) - x }
}

/** Even local hours (site time zone) inside the span, for tick marks. */
export function hourTicks(span: TimeWindow, timezone: string): { t: number; label: string }[] {
  const step = 15 * 60000
  const ticks: { t: number; label: string }[] = []
  for (let t = Math.ceil(span.start / step) * step; t <= span.end; t += step) {
    const [h, m] = formatInTimeZone(new Date(t), timezone, 'HH mm').split(' ')
    if (m === '00' && Number(h) % 2 === 0) ticks.push({ t, label: h })
  }
  return ticks
}

/** Nearest sample index to a pointer x position (client coordinates) over an SVG. */
export function nearestIndex(e: PointerEvent, svg: SVGSVGElement, span: TimeWindow, times: number[]): number {
  const r = svg.getBoundingClientRect()
  const x = ((e.clientX - r.left) / r.width) * VB_W
  const t = span.start + ((x - M_LEFT) / PLOT_W) * (span.end - span.start)
  let best = 0
  for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - t) < Math.abs(times[best] - t)) best = i
  return best
}

/** SVG path through (x, y) points, breaking wherever `ok` is false or y is not finite. */
export function linePath(xs: number[], ys: ArrayLike<number>, ok: (i: number) => boolean = () => true): string {
  let d = ''
  let pen = false
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i]
    if (!ok(i) || !Number.isFinite(y)) { pen = false; continue }
    d += `${pen ? 'L' : 'M'}${xs[i].toFixed(1)},${y.toFixed(1)}`
    pen = true
  }
  return d
}
