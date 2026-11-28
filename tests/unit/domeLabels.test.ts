import { describe, expect, it } from 'vitest'
import { around, pickAt, placeLabels, sideLabel, type Box, type LabelRequest } from '../../src/ui/domeLabels'

const bounds: Box = { x0: 0, y0: 0, x1: 358, y1: 358 }
const boxDist = (b: Box, x: number, y: number) =>
  Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1))
const segDist = (l: { x1: number; y1: number; x2: number; y2: number }, x: number, y: number) => {
  const dx = l.x2 - l.x1, dy = l.y2 - l.y1
  const t = Math.max(0, Math.min(1, ((x - l.x1) * dx + (y - l.y1) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(l.x1 + t * dx - x, l.y1 + t * dy - y)
}
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

describe('placeLabels', () => {
  it('never places a label nearer another dot than its own', () => {
    // A dot just right of 'a' and one just above-left: right and above spots sit by the neighbours.
    const dots = [{ key: 'a', x: 100, y: 100 }, { key: 'b', x: 118, y: 100 }, { key: 'c', x: 96, y: 84 }]
    const [p] = placeLabels([{ key: 'a', x: 100, y: 100, text: 'NGC 7000', fontSize: 11 }], [], bounds, dots)
    expect(p).toBeDefined()
    const own = boxDist(p.box, 100, 100)
    for (const d of dots.slice(1)) expect(boxDist(p.box, d.x, d.y)).toBeGreaterThanOrEqual(own + 4)
  })

  it('drops a label when every spot is nearer a neighbour', () => {
    const ring = Array.from({ length: 12 }, (_, i) => ({
      key: `n${i}`, x: 100 + 14 * Math.cos((i * Math.PI) / 6), y: 100 + 14 * Math.sin((i * Math.PI) / 6),
    }))
    const placed = placeLabels([{ key: 'a', x: 100, y: 100, text: 'NGC 7000', fontSize: 11 }], [], bounds,
      [{ key: 'a', x: 100, y: 100 }, ...ring])
    expect(placed).toHaveLength(0)
  })

  it('places a crowded label further out, clear of other dots, with a leader that misses them', () => {
    const dots = [
      { key: 'a', x: 100, y: 100 }, { key: 'b', x: 112, y: 100 }, { key: 'c', x: 100, y: 112 },
      { key: 'd', x: 88, y: 100 }, { key: 'e', x: 100, y: 88 },
    ]
    const [p] = placeLabels([{ key: 'a', x: 100, y: 100, text: 'NGC 7000', fontSize: 11 }], [], bounds, dots)
    expect(p).toBeDefined()
    for (const d of dots.slice(1)) {
      expect(boxDist(p.box, d.x, d.y)).toBeGreaterThanOrEqual(10)
      expect(segDist(p.lead, d.x, d.y)).toBeGreaterThanOrEqual(5)
    }
  })

  it('gives each label a leader from its dot to the label box', () => {
    const [p] = placeLabels([{ key: 'a', x: 100, y: 100, text: 'M 31', fontSize: 11 }], [], bounds)
    expect(Math.hypot(p.lead.x1 - 100, p.lead.y1 - 100)).toBeLessThan(Math.hypot(p.lead.x2 - 100, p.lead.y2 - 100))
    expect(boxDist(p.box, p.lead.x2, p.lead.y2)).toBeLessThanOrEqual(1.01)
  })

  it('puts a lone label to the right of its dot', () => {
    const [p] = placeLabels([{ key: 'a', x: 100, y: 100, text: 'M 31', fontSize: 11 }], [], bounds)
    expect(p.anchor).toBe('start')
    expect(p.box.x0).toBeGreaterThan(100)
  })

  it('never overlaps labels or obstacles, even for a tight clump of ten', () => {
    const reqs: LabelRequest[] = Array.from({ length: 10 }, (_, i) => ({
      key: String(i), x: 170 + (i % 3) * 4, y: 170 + Math.floor(i / 3) * 4, text: `NGC ${7000 + i}`, fontSize: 11,
    }))
    const dots = reqs.map((r) => around(r.x, r.y, 3))
    const placed = placeLabels(reqs, dots, bounds)
    expect(placed.length).toBeGreaterThan(0)
    for (let i = 0; i < placed.length; i++) {
      for (const d of dots) expect(overlaps(placed[i].box, d)).toBe(false)
      for (let j = i + 1; j < placed.length; j++) expect(overlaps(placed[i].box, placed[j].box)).toBe(false)
    }
  })

  it('keeps labels inside the bounds', () => {
    const [p] = placeLabels([{ key: 'a', x: 350, y: 5, text: 'IC 1396', fontSize: 11 }], [], bounds)
    expect(p.box.x1).toBeLessThanOrEqual(358)
    expect(p.box.y0).toBeGreaterThanOrEqual(0)
  })
})

describe('pickAt', () => {
  const dots = [{ id: 'top', x: 100, y: 100 }, { id: 'next', x: 160, y: 100 }]
  const labels = [{ key: 'top', x: 105, y: 100, anchor: 'start' as const, box: { x0: 105, y0: 94, x1: 150, y1: 106 } }]

  it('a tap on a label picks that label, even inside a nearer dot\'s tap area', () => {
    expect(pickAt({ x: 148, y: 100 }, labels, dots, 16)).toBe('top')
  })
  it('otherwise picks the nearest dot within the tap radius', () => {
    expect(pickAt({ x: 155, y: 110 }, labels, dots, 16)).toBe('next')
    expect(pickAt({ x: 96, y: 104 }, labels, dots, 16)).toBe('top')
  })
  it('ignores star labels and misses outside every area', () => {
    const star = { key: 'star:Vega', x: 0, y: 0, anchor: 'start' as const, box: { x0: 0, y0: 0, x1: 50, y1: 20 } }
    expect(pickAt({ x: 10, y: 10 }, [star], dots, 16)).toBeNull()
  })
})

describe('sideLabel', () => {
  it('puts the label right of a disc east of centre (left half)', () => {
    const l = sideLabel(60, 179, 7, '95%', 10, 179)
    expect(l.anchor).toBe('start')
    expect(l.box.x0).toBeGreaterThan(67)
  })
  it('puts the label on the inner side (left) of a disc in the west, inside the dome', () => {
    const l = sideLabel(335, 179, 7, '100%', 10, 179)
    expect(l.anchor).toBe('end')
    expect(l.box.x1).toBeLessThan(335 - 7)
    expect(l.box.x0).toBeGreaterThan(0)
    expect(l.x).toBeCloseTo(l.box.x1, 6)
  })
})
