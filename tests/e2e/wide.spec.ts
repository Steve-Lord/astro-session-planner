import { test, expect, type Page } from '@playwright/test'
import { seedStorage } from './seed'

const box = async (page: Page, sel: string) => (await page.locator(sel).filter({ visible: true }).first().boundingBox())!

test.describe('Wide windows (Mac browser)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the Sky dome fills the window height and controls sit in one row', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22#sky')
    const dome = page.getByRole('img', { name: 'Sky dome' })
    await expect(page.locator('g.target text').first()).toBeAttached({ timeout: 60_000 })
    const d = (await dome.boundingBox())!
    expect(d.width).toBeGreaterThanOrEqual(600)
    expect(d.y + d.height).toBeLessThanOrEqual(900)

    const site = await box(page, 'select')
    const date = await box(page, 'input[type="date"]')
    expect(Math.abs(site.y - date.y)).toBeLessThan(30)

    // Names stay phone-sized (11 px text plus its outline, about 19 px) however big the dome gets;
    // unscaled they would be about twice that.
    const label = (await page.locator('g.target text').first().boundingBox())!
    expect(label.height).toBeGreaterThan(9)
    expect(label.height).toBeLessThan(24)
    const tick = (await page.locator('.slider text.tick').first().boundingBox())!
    expect(tick.height).toBeLessThan(20)

    // The slider spans the dome's width.
    const slider = (await page.locator('.slider').boundingBox())!
    expect(slider.width).toBeGreaterThanOrEqual(d.width * 0.9)
  })

  test('Tonight uses the width and keeps each row on one line', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22')
    const row = page.locator('ol.entries > li').first()
    await expect(row).toBeVisible({ timeout: 60_000 })
    expect((await page.locator('main').filter({ visible: true }).boundingBox())!.width).toBeGreaterThan(1000)
    expect((await row.boundingBox())!.height).toBeLessThan(50)
  })

  test('the target detail puts the frame preview beside the charts', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/#target=NGC7000&date=2026-11-22')
    const chart = page.getByRole('img', { name: 'Altitude through the night' })
    await expect(chart).toBeVisible({ timeout: 60_000 })
    const c = (await chart.boundingBox())!
    const p = (await page.getByRole('img', { name: 'Frame preview' }).boundingBox())!
    expect(p.x).toBeGreaterThanOrEqual(c.x + c.width - 1)
    expect(c.width).toBeLessThanOrEqual(600)
    expect(p.width).toBeLessThanOrEqual(420)
  })

  for (const width of [1000, 1440]) {
    test(`no horizontal scroll at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await seedStorage(page)
      for (const hash of ['#tonight', '#sky']) {
        await page.goto(`/?date=2026-11-22${hash}`)
        await expect(page.locator('main').filter({ visible: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      }
    })
  }
})

test.describe('Phone stays as it was', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the detail stacks the frame preview under the charts', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/#target=NGC7000&date=2026-11-22')
    const chart = page.getByRole('img', { name: 'Altitude through the night' })
    await expect(chart).toBeVisible({ timeout: 60_000 })
    const c = (await chart.boundingBox())!
    const p = (await page.getByRole('img', { name: 'Frame preview' }).boundingBox())!
    expect(p.y).toBeGreaterThan(c.y + c.height)
  })

  test('Sky controls stay stacked', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22#sky')
    await expect(page.getByRole('img', { name: 'Sky dome' })).toBeVisible({ timeout: 60_000 })
    const site = await box(page, 'select')
    const date = await box(page, 'input[type="date"]')
    expect(date.y - site.y).toBeGreaterThan(60)
  })
})
