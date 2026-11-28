/** Greedy label placement for the sky dome: each label takes the first free spot round its dot. */

export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface LabelRequest { key: string; x: number; y: number; text: string; fontSize: number }
export interface Line { x1: number; y1: number; x2: number; y2: number }
export interface PlacedLabel {
  key: string; x: number; y: number; anchor: 'start' | 'middle' | 'end'; box: Box
  /** From just outside the dot to the nearest point of the label box. */
  lead: Line
}
/** A dot a label could be mistaken for; `key` matches the label request of the dot's own label. */
export interface Dot { key: string; x: number; y: number }

/** Rough text width for the system UI font (average glyph about 0.6 em, slightly generous). */
export const textWidth = (text: string, fontSize: number): number => text.length * fontSize * 0.6 + 2

/** Labels keep this much clear space from each other. */
const PAD = 2
/** A label's own dot must be at least this much nearer to it than any other dot... */
const OWN_MARGIN = 4
/** ...or, for a label further out (joined to its dot by the leader), every other dot this far away. */
const CLEAR = 10
/** A leader keeps this far from every other dot. */
const LEAD_CLEAR = 5
/** The leader starts this far out from the dot's centre. */
const LEAD_START = 4.5

/** Nearest point of a box to (x, y). */
const nearestOnBox = (b: Box, x: number, y: number) =>
  ({ x: Math.min(Math.max(x, b.x0), b.x1), y: Math.min(Math.max(y, b.y0), b.y1) })
const distToBox = (b: Box, x: number, y: number): number => {
  const p = nearestOnBox(b, x, y)
  return Math.hypot(p.x - x, p.y - y)
}

const distToSeg = (l: Line, x: number, y: number): number => {
  const dx = l.x2 - l.x1
  const dy = l.y2 - l.y1
  const t = Math.max(0, Math.min(1, ((x - l.x1) * dx + (y - l.y1) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(l.x1 + t * dx - x, l.y1 + t * dy - y)
}

/** True when no other dot could be taken for this label's: near enough to read as its own, else clear of the rest. */
function clearOfNeighbours(b: Box, r: { key: string; x: number; y: number }, dots: Dot[]): boolean {
  const own = distToBox(b, r.x, r.y)
  const need = Math.min(own + OWN_MARGIN, CLEAR)
  const lead = leader(b, r.x, r.y)
  return !dots.some((o) => o.key !== r.key && (distToBox(b, o.x, o.y) < need || distToSeg(lead, o.x, o.y) < LEAD_CLEAR))
}

function leader(b: Box, x: number, y: number): Line {
  const end = nearestOnBox(b, x, y)
  const len = Math.hypot(end.x - x, end.y - y)
  const k = len > 0 ? Math.min(LEAD_START, len) / len : 0
  return { x1: x + (end.x - x) * k, y1: y + (end.y - y) * k, x2: end.x, y2: end.y }
}
const overlaps = (a: Box, b: Box, pad = 0): boolean =>
  a.x0 - pad < b.x1 && b.x0 - pad < a.x1 && a.y0 - pad < b.y1 && b.y0 - pad < a.y1

/** A box of half-size `r` round a point. */
export const around = (x: number, y: number, r: number): Box => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r })

/**
 * Places labels in request order (most important first). Each one tries right, left, above, below
 * and the four diagonals at growing gaps (the leader line links a far label to its dot), and takes the first spot that stays inside
 * `bounds` and clear of `obstacles` and earlier labels. A label with no free spot is left out
 * rather than drawn over another (its name still shows on tap).
 * A spot is also refused when another of `dots` could be taken for the label's own: close in, the
 * own dot must be clearly the nearest; further out, every other dot must be well clear of the label
 * and of the leader line joining it to its dot.
 */
export function placeLabels(requests: LabelRequest[], obstacles: Box[], bounds: Box, dots: Dot[] = []): PlacedLabel[] {
  const out: PlacedLabel[] = []
  for (const r of requests) {
    const w = textWidth(r.text, r.fontSize)
    const h = r.fontSize + 1
    for (const gap of [5, 12, 22, 34]) {
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
        !obstacles.some((o) => overlaps(b, o)) && !out.some((p) => overlaps(b, p.box, PAD)) &&
        clearOfNeighbours(b, r, dots))
      if (hit) {
        const [box, anchor, x, y] = hit
        out.push({ key: r.key, x, y, anchor, box, lead: leader(box, r.x, r.y) })
        break
      }
    }
  }
  return out
}

/**
 * The target a tap at `p` (viewBox units) means: a target label under the point wins, since a label
 * can sit inside a neighbour's tap area; otherwise the nearest dot within `radius`; else null.
 * Star labels (keys starting `star:`) are not tappable.
 */
export function pickAt(
  p: { x: number; y: number }, labels: Iterable<Pick<PlacedLabel, 'key' | 'box'>>, dots: { id: string; x: number; y: number }[], radius: number,
): string | null {
  for (const l of labels) {
    if (!l.key.startsWith('star:') && p.x >= l.box.x0 && p.x <= l.box.x1 && p.y >= l.box.y0 && p.y <= l.box.y1) return l.key
  }
  let best = radius
  let id: string | null = null
  for (const d of dots) {
    const dist = Math.hypot(d.x - p.x, d.y - p.y)
    if (dist <= best) { best = dist; id = d.id }
  }
  return id
}

/**
 * A label beside a disc of radius `r` at (x, y), on the side towards the dome's centre column, so a
 * disc near the west (right) rim keeps its label inside the dome.
 */
export function sideLabel(
  x: number, y: number, r: number, text: string, fontSize: number, centreX: number,
): PlacedLabel {
  const w = textWidth(text, fontSize)
  const h = fontSize + 2
  const gap = r + 3
  if (x > centreX) {
    const box = { x0: x - gap - w, y0: y - h / 2, x1: x - gap, y1: y + h / 2 }
    return { key: text, x: x - gap, y, anchor: 'end', box, lead: leader(box, x, y) }
  }
  const box = { x0: x + gap, y0: y - h / 2, x1: x + gap + w, y1: y + h / 2 }
  return { key: text, x: x + gap, y, anchor: 'start', box, lead: leader(box, x, y) }
}
