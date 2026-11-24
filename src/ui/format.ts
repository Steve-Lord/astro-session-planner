import type { PlanEntry } from '../lib/types'
import { formatLocal } from '../lib/astro/time'

export function fitText(fit: PlanEntry['fit']): string {
  if (fit.label === 'good' || fit.label === 'tight') return `fills ${Math.round((fit.fill ?? 0) * 100)}%`
  if (fit.label === 'mosaic' && fit.panels) return `MOSAIC ${fit.panels[0]}×${fit.panels[1]}`
  if (fit.label === 'size-unknown') return 'size unknown'
  return ''
}

export function windowText(entry: PlanEntry, timezone: string): string {
  return `${formatLocal(entry.best.start, timezone)}–${formatLocal(entry.best.end, timezone)}`
}

export function hoursText(entry: PlanEntry): string { return `(${entry.totalHours.toFixed(1)} h)` }
export function peakText(entry: PlanEntry): string { return `peak ${Math.round(entry.peakAlt)}°` }

const LABELS: Record<keyof PlanEntry['breakdown'], string> = {
  hours: 'Hours', altitude: 'Altitude', fit: 'Fit', contrast: 'Contrast', moon: 'Moon',
}

/** Labelled score factors with the values behind them. */
export function factorRows(entry: PlanEntry): [string, string][] {
  const b = entry.breakdown
  const c = entry.contrastMag
  const sep = entry.minMoonSepDeg
  const rows: [keyof PlanEntry['breakdown'], string][] = [
    ['hours', `${b.hours.toFixed(2)} (${entry.totalHours.toFixed(1)} h usable)`],
    ['altitude', `${b.altitude.toFixed(2)} (peak ${Math.round(entry.peakAlt)}°)`],
    ['fit', `${b.fit.toFixed(2)} (${entry.fit.label})`],
    ['contrast', c === null ? `${b.contrast.toFixed(2)} (unknown brightness)` : `${b.contrast.toFixed(2)} (${Math.abs(c).toFixed(1)} mag ${c >= 0 ? 'fainter' : 'brighter'} than sky)`],
    ['moon', `${b.moon.toFixed(2)} (${sep === null ? 'Moon down' : `closest ${Math.round(sep)}°`})`],
  ]
  return rows.map(([k, v]) => [LABELS[k], v])
}
