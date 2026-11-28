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
})
