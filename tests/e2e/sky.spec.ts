import { test, expect } from '@playwright/test'
import { seedStorage, seededState } from './seed'

test.describe('Sky', () => {
  test("sky tab plots tonight's top targets", async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22#sky')
    await expect(page.getByRole('img', { name: 'Sky dome' })).toBeVisible()
    const targets = page.locator('g.target')
    await expect(targets.first()).toBeAttached({ timeout: 60_000 })
    const n = await targets.count()
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThanOrEqual(30)
    expect(await page.locator('g.target text').count()).toBeLessThanOrEqual(10)

    // Tonight stays mounted (hidden) beside Sky, so its first row can be read from here.
    const href = (await page.locator('ol.entries > li a.main').first().getAttribute('href'))!
    const id = new URLSearchParams(href.slice(1)).get('target')!
    await expect(targets.first()).toHaveAttribute('data-id', id)

    const dome = page.getByRole('img', { name: 'Sky dome' })
    for (const c of ['N', 'E', 'S', 'W']) await expect(dome.getByText(c, { exact: true })).toBeVisible()
  })

  test('slider moves the targets and shows the time', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22#sky')
    const dot = page.locator('g.target circle').first()
    await expect(dot).toBeAttached({ timeout: 60_000 })
    const cx = await dot.getAttribute('cx')
    const time = await page.locator('.sky-time').textContent()
    expect(time).toMatch(/^\d\d:\d\d$/)
    const slider = page.getByRole('slider', { name: 'Time' })
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = el.max
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await expect(page.locator('.sky-time')).not.toHaveText(time!)
    const moved = page.locator('g.target circle').first()
    await expect.poll(() => moved.getAttribute('cx')).not.toBe(cx)
  })

  test('date is shared with Tonight', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22#sky')
    await page.getByRole('button', { name: 'Next day' }).click()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Tonight' }).click()
    await expect(page).toHaveURL(/#tonight$/)
    await expect(page.getByLabel('Date').filter({ visible: true })).toHaveValue('2026-11-23')
  })

  test('no horizon saved shows the note', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22#sky')
    await expect(page.getByText('No horizon saved for this site')).toBeVisible()
  })

  test('midsummer far north: no targets, no stars, still draws', async ({ page }) => {
    const state = seededState()
    Object.assign(state.sites[0], { name: 'Oslo', lat: 60, lon: 10.7, timezone: 'Europe/Oslo' })
    await seedStorage(page, state)
    await page.goto('/?date=2026-06-21#sky')
    await expect(page.getByText('No targets are usable this night.').filter({ visible: true })).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('g.star')).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'Sky dome' })).toBeVisible()
  })

  test('fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedStorage(page)
    await page.goto('/?date=2026-11-22#sky')
    await expect(page.locator('g.target').first()).toBeAttached({ timeout: 60_000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })

  test("no name or leader line can be taken for a neighbour's, all night", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedStorage(page)
    await page.goto('/?date=2026-11-22#sky')
    await expect(page.locator('g.target').first()).toBeAttached({ timeout: 60_000 })
    const slider = page.getByRole('slider', { name: 'Time' })
    const max = Number(await slider.getAttribute('max'))
    let checked = 0
    let steps = 0
    for (let i = 0; i <= max; i += 6) {
      await slider.fill(String(i))
      const bad = await page.evaluate(() => {
        const dots = [...document.querySelectorAll('g.target')].map((g) => {
          const c = g.querySelector('circle.dot')!
          return { id: g.getAttribute('data-id'), x: +c.getAttribute('cx')!, y: +c.getAttribute('cy')! }
        })
        const out: string[] = []
        let n = 0
        for (const g of document.querySelectorAll('g.target')) {
          const t = g.querySelector('text') as SVGTextElement | null
          if (!t) continue
          n++
          const b = t.getBBox()
          const d = (x: number, y: number) =>
            Math.hypot(Math.max(b.x - x, 0, x - b.x - b.width), Math.max(b.y - y, 0, y - b.y - b.height))
          const own = dots.find((o) => o.id === g.getAttribute('data-id'))!
          const ln = g.querySelector('line.lead')
          const seg = (x: number, y: number) => {
            if (!ln) return Infinity
            const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) => +ln.getAttribute(a)!)
            const dx = x2 - x1, dy = y2 - y1
            const k = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)))
            return Math.hypot(x1 + k * dx - x, y1 + k * dy - y)
          }
          // Rendered text is a little wider than the placer's estimate, hence the slack.
          for (const o of dots) {
            if (o === own) continue
            if (d(o.x, o.y) < Math.min(d(own.x, own.y) + 2, 7)) out.push(`${own.id} label vs ${o.id}`)
            if (seg(o.x, o.y) < 4) out.push(`${own.id} line vs ${o.id}`)
          }
        }
        return { out, n }
      })
      expect(bad.out).toEqual([])
      checked += bad.n
      steps++
    }
    // Most of the top 10 still get a name on average.
    expect(checked / steps).toBeGreaterThanOrEqual(6)
  })

  test('tapping a target highlights its dot and name', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22#sky')
    const first = page.locator('g.target').first()
    await expect(first.locator('text')).toBeAttached({ timeout: 60_000 })
    await first.locator('text').click({ force: true })
    await expect(first).toHaveClass(/selected/)
    await expect(first.locator('text')).toHaveCSS('fill', 'rgb(217, 138, 127)')
    await expect(first.locator('circle.dot')).toHaveCSS('fill', 'rgb(217, 138, 127)')
    const other = page.locator('g.target:not(.selected) text').first()
    await expect(other).not.toHaveCSS('fill', 'rgb(217, 138, 127)')
  })

  test('tap opens the name pop-up', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22#sky')
    const first = page.locator('g.target').first()
    await expect(first).toBeAttached({ timeout: 60_000 })
    // force: a lower-ranked neighbour's tap area may sit on top; the tap still picks the nearest dot.
    await first.locator('circle.dot').click({ force: true })
    await expect(page.getByRole('button', { name: 'Details ›' })).toBeVisible()
    const name = await first.getAttribute('aria-label')
    await expect(page.getByRole('dialog', { name: name! })).toBeVisible()
  })

  test("tapping a label inside a neighbour's tap area opens the label's own target", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedStorage(page)
    await page.goto('/?date=2026-11-22#sky')
    await expect(page.locator('g.target').first()).toBeAttached({ timeout: 60_000 })
    const slider = page.getByRole('slider', { name: 'Time' })
    const max = Number(await slider.getAttribute('max'))
    // Find a step where a label's box has a point inside a later-drawn (on top) dot's tap circle.
    let hit: { id: string; name: string; x: number; y: number } | null = null
    for (let v = 0; v <= max && !hit; v += 3) {
      await slider.evaluate((el: HTMLInputElement, val) => {
        el.value = String(val)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }, v)
      hit = await page.evaluate(() => {
        const svg = document.querySelector<SVGSVGElement>('svg[aria-label="Sky dome"]')!
        const gs = [...svg.querySelectorAll<SVGGElement>('g.target')]
        for (let i = 0; i < gs.length; i++) {
          const rect = gs[i].querySelector<SVGRectElement>('rect.hit')
          if (!rect) continue
          const b = rect.getBBox()
          for (const later of gs.slice(i + 1)) {
            const c = later.querySelector<SVGCircleElement>('circle.hit')!
            const cx = c.cx.baseVal.value
            const cy = c.cy.baseVal.value
            // The point of the label box nearest the later dot, nudged 1 unit inside the box.
            const px = Math.min(Math.max(cx, b.x + 1), b.x + b.width - 1)
            const py = Math.min(Math.max(cy, b.y + 1), b.y + b.height - 1)
            if (Math.hypot(px - cx, py - cy) < c.r.baseVal.value - 1) {
              const pt = new DOMPoint(px, py).matrixTransform(svg.getScreenCTM()!)
              return { id: gs[i].dataset.id!, name: gs[i].getAttribute('aria-label')!, x: pt.x, y: pt.y }
            }
          }
        }
        return null
      })
    }
    expect(hit, 'some label overlaps a later dot\'s tap area during the night').not.toBeNull()
    await page.mouse.click(hit!.x, hit!.y)
    await expect(page.getByRole('dialog', { name: hit!.name })).toBeVisible()
  })

  test('details from the dome and back keep the slider', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22#sky')
    const first = page.locator('g.target').first()
    await expect(first).toBeAttached({ timeout: 60_000 })
    const slider = page.getByRole('slider', { name: 'Time' })
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = '10'
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await first.locator('circle.dot').click({ force: true })
    await page.getByRole('button', { name: 'Details ›' }).click()
    await expect(page).toHaveURL(/from=sky/)
    await expect(page.getByRole('button', { name: '‹ Sky' })).toBeVisible()
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: 'Tonight' })).not.toHaveAttribute('aria-current', /.*/)
    await expect(nav.getByRole('link', { name: 'Sky' })).toHaveAttribute('aria-current', 'page')
    await page.getByRole('button', { name: '‹ Sky' }).click()
    await expect(page.getByRole('img', { name: 'Sky dome' })).toBeVisible()
    await expect(page.getByRole('slider', { name: 'Time' })).toHaveValue('10')
  })

  test('cold load of a from=sky detail opens in Sky', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/#target=NGC7000&date=2026-11-22&from=sky')
    await expect(page.getByRole('button', { name: '‹ Sky' })).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('ol.entries')).not.toBeVisible()
    await page.getByRole('button', { name: '‹ Sky' }).click()
    await expect(page).toHaveURL(/#sky$/)
    await expect(page.getByRole('img', { name: 'Sky dome' })).toBeVisible()
  })

  test('tapping empty sky closes the pop-up', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22#sky')
    const first = page.locator('g.target').first()
    await expect(first).toBeAttached({ timeout: 60_000 })
    await first.locator('circle.dot').click({ force: true })
    const details = page.getByRole('button', { name: 'Details ›' })
    await expect(details).toBeVisible()
    // An empty point of sky: inside the dome, far from every dot and label.
    const pt = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('svg[aria-label="Sky dome"]')!
      const dots = [...svg.querySelectorAll<SVGCircleElement>('g.target circle.dot, g.moon circle')]
        .map((c) => [c.cx.baseVal.value, c.cy.baseVal.value])
      for (let r = 0; r < 150; r += 10) {
        for (let a = 0; a < 360; a += 15) {
          const x = 179 + r * Math.cos((a * Math.PI) / 180)
          const y = 179 + r * Math.sin((a * Math.PI) / 180)
          if (dots.every(([dx, dy]) => Math.hypot(dx - x, dy - y) > 40)) {
            const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!)
            const el = document.elementFromPoint(p.x, p.y)
            if (el && !el.closest('g.target') && !el.closest('.pop')) return { x: p.x, y: p.y }
          }
        }
      }
      return null
    })
    expect(pt).not.toBeNull()
    // The dome itself must handle it: iOS Safari may not deliver this tap to a document listener, so
    // stop the click below the app root (Svelte's delegated handlers live on #app).
    await page.evaluate(() => document.body.addEventListener('click', (e) => e.stopPropagation()))
    await page.mouse.click(pt!.x, pt!.y)
    await expect(details).toHaveCount(0)
  })

  test("the Moon's % matches Tonight's summary", async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22#sky')
    await expect(page.locator('g.target').first()).toBeAttached({ timeout: 60_000 })
    const summary = await page.locator('p.summary').textContent()
    const want = summary!.match(/Moon (\d+)%/)![1]
    const slider = page.getByRole('slider', { name: 'Time' })
    const max = Number(await slider.getAttribute('max'))
    const seen = new Set<string>()
    for (let v = 0; v <= max; v += 6) {
      await slider.evaluate((el: HTMLInputElement, val) => {
        el.value = String(val)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }, v)
      const moon = page.locator('g.moon text')
      if (await moon.count()) seen.add((await moon.textContent())!)
    }
    expect(seen.size).toBeGreaterThan(0)
    expect([...seen]).toEqual([`${want}%`])
  })

  test('the slider thumb is at least 32 px wide', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22#sky')
    await expect(page.getByRole('slider', { name: 'Time' })).toBeAttached()
    const widths = await page.evaluate(() => {
      const out: string[] = []
      for (const sheet of [...document.styleSheets]) {
        for (const rule of [...sheet.cssRules]) {
          if (rule instanceof CSSStyleRule && /slider-thumb|range-thumb/.test(rule.selectorText)) out.push(rule.style.width)
        }
      }
      return out
    })
    expect(widths.length).toBeGreaterThan(0)
    for (const w of widths) expect(parseFloat(w)).toBeGreaterThanOrEqual(32)
  })
})
