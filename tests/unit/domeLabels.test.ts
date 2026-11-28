import { describe, expect, it } from 'vitest'
import { around, placeLabels, type Box, type LabelRequest } from '../../src/ui/domeLabels'

const bounds: Box = { x0: 0, y0: 0, x1: 358, y1: 358 }
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

describe('placeLabels', () => {
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
