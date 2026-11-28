/** Greedy label placement for the sky dome: each label takes the first free spot round its dot. */

export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface LabelRequest { key: string; x: number; y: number; text: string; fontSize: number }
export interface PlacedLabel { key: string; x: number; y: number; anchor: 'start' | 'middle' | 'end'; box: Box }

/** Rough text width for the system UI font (average glyph about 0.6 em, slightly generous). */
export const textWidth = (text: string, fontSize: number): number => text.length * fontSize * 0.6 + 2

/** Labels keep this much clear space from each other. */
const PAD = 2
const overlaps = (a: Box, b: Box, pad = 0): boolean =>
  a.x0 - pad < b.x1 && b.x0 - pad < a.x1 && a.y0 - pad < b.y1 && b.y0 - pad < a.y1

/** A box of half-size `r` round a point. */
export const around = (x: number, y: number, r: number): Box => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r })

/**
 * Places labels in request order (most important first). Each one tries right, left, above, below
 * and the four diagonals at a near and a far gap, and takes the first spot that stays inside
 * `bounds` and clear of `obstacles` and earlier labels. A label with no free spot is left out
 * rather than drawn over another (its name still shows on tap).
 */
export function placeLabels(requests: LabelRequest[], obstacles: Box[], bounds: Box): PlacedLabel[] {
  const out: PlacedLabel[] = []
  for (const r of requests) {
    const w = textWidth(r.text, r.fontSize)
    const h = r.fontSize + 1
    for (const gap of [5, 12]) {
      const d = gap
      const spots: [Box, PlacedLabel['anchor'], number, number][] = [
        [{ x0: r.x + gap, y0: r.y - h / 2, x1: r.x + gap + w, y1: r.y + h / 2 }, 'start', r.x + gap, r.y],
        [{ x0: r.x - gap - w, y0: r.y - h / 2, x1: r.x - gap, y1: r.y + h / 2 }, 'end', r.x - gap, r.y],
        [{ x0: r.x - w / 2, y0: r.y - gap - h, x1: r.x + w / 2, y1: r.y - gap }, 'middle', r.x, r.y - gap - h / 2],
        [{ x0: r.x - w / 2, y0: r.y + gap, x1: r.x + w / 2, y1: r.y + gap + h }, 'middle', r.x, r.y + gap + h / 2],
        [{ x0: r.x + d, y0: r.y - d - h, x1: r.x + d + w, y1: r.y - d }, 'start', r.x + d, r.y - d - h / 2],
        [{ x0: r.x - d - w, y0: r.y - d - h, x1: r.x - d, y1: r.y - d }, 'end', r.x - d, r.y - d - h / 2],
        [{ x0: r.x + d, y0: r.y + d, x1: r.x + d + w, y1: r.y + d + h }, 'start', r.x + d, r.y + d + h / 2],
        [{ x0: r.x - d - w, y0: r.y + d, x1: r.x - d, y1: r.y + d + h }, 'end', r.x - d, r.y + d + h / 2],
      ]
      const hit = spots.find(([b]) =>
        b.x0 >= bounds.x0 && b.x1 <= bounds.x1 && b.y0 >= bounds.y0 && b.y1 <= bounds.y1 &&
        !obstacles.some((o) => overlaps(b, o)) && !out.some((p) => overlaps(b, p.box, PAD)))
      if (hit) {
        const [box, anchor, x, y] = hit
        out.push({ key: r.key, x, y, anchor, box })
        break
      }
    }
  }
  return out
}
