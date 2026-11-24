import { test, expect, type Page } from '@playwright/test'
import { seedStorage, seededState } from './seed'

async function openNgc7000(page: Page, state: unknown = seededState()) {
  await seedStorage(page, state)
  await page.goto('/?date=2026-11-22')
  const row = page.locator('ol.entries > li', { hasText: 'NGC 7000' }).first()
  await expect(row).toBeVisible({ timeout: 60_000 })
  await row.getByRole('link').first().click()
  await expect(page.locator('.detail')).toBeVisible()
}

test.describe('Target detail', () => {
  test('row opens detail with matching summary', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22')
    const row = page.locator('ol.entries > li', { hasText: 'NGC 7000' }).first()
    await expect(row).toBeVisible({ timeout: 60_000 })
    const meta = (await row.locator('.meta').innerText()).replace(/\s+/g, ' ')
    const window = meta.match(/\d\d:\d\d–\d\d:\d\d/)![0]
    const hours = meta.match(/\(\d+\.\d h\)/)![0]
    const peak = meta.match(/peak \d+°/)![0]
    await row.getByRole('link').first().click()
    await expect(page.getByRole('heading', { name: /NGC 7000/ })).toBeVisible()
    const summary = page.locator('.detail .summary')
    await expect(summary).toContainText(window)
    await expect(summary).toContainText(hours)
    await expect(summary).toContainText(peak)
    await expect(summary).toContainText('MOSAIC')
    await expect(page.locator('.factors dd')).toHaveCount(5)
    await page.getByRole('button', { name: '‹ Tonight' }).click()
    await expect(page.getByRole('button', { name: 'why' })).toHaveCount(0)
  })

  test('back keeps scroll and does not re-plan', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22')
    const rows = page.locator('ol.entries > li')
    await expect(rows.first()).toBeVisible({ timeout: 60_000 })
    const row20 = rows.nth(19)
    await row20.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, 150))
    const y = await page.evaluate(() => window.scrollY)
    expect(y).toBeGreaterThan(200)
    await row20.getByRole('link').first().click()
    await expect(page.locator('.detail')).toBeVisible()
    await page.getByRole('button', { name: '‹ Tonight' }).click()
    await expect(rows.first()).toBeVisible()
    await expect(page.getByText('Planning…')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y - 5)
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - y)).toBeLessThanOrEqual(5)

    await row20.getByRole('link').first().click()
    await expect(page.locator('.detail')).toBeVisible()
    await page.goBack()
    await expect(rows.first()).toBeVisible()
    await expect(page.locator('.detail')).toHaveCount(0)
  })

  test('hidden targets explain themselves', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22')
    await expect(page.locator('ol.entries > li').first()).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: /^Too small/ }).click()
    await page.locator('.hidden-list li', { hasText: 'NGC 7662' }).getByRole('link').click()
    await expect(page.getByText('Hidden: too small — fills 0% of the frame')).toBeVisible()
    await page.getByRole('button', { name: '‹ Tonight' }).click()

    await page.goto('/#target=NGC0104&date=2026-11-22')
    await expect(page.getByText('Hidden: never rises above 15° from here')).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: '‹ Tonight' }).click()
    await expect(page.getByLabel('Date')).toHaveValue('2026-11-22')
    expect(new URL(page.url()).pathname).toBe('/')
  })

  test('unknown id', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/#target=nope&date=2026-11-22')
    await expect(page.getByText("This target isn't in the catalogue any more.")).toBeVisible({ timeout: 60_000 })
  })

  test('NGC 7000 chart', async ({ page }) => {
    await openNgc7000(page)
    const chart = page.locator('svg[aria-label="Altitude through the night"]')
    await expect(chart).toBeVisible()
    await expect(chart.locator('path.target')).toHaveCount(1)
    await expect(chart.locator('path.horizon')).toHaveCount(1)
    await expect(chart.locator('path.needed')).toHaveCount(1)
    expect(await chart.locator('rect.usable').count()).toBeGreaterThanOrEqual(1)
    await expect(chart.locator('rect.usable.best')).toHaveCount(1)
    await expect(chart.locator('line.min-alt')).toHaveCount(1)
    await expect(chart.locator('line.mount-limit')).toHaveCount(1)
    await expect(page.getByText('No horizon saved for this site')).toBeVisible()
    const frame = page.locator('.frame-preview')
    // NGC 7000 is a 1×2 mosaic on the Seestar (fit.test.ts), not 2×2 as the brief guessed.
    await expect(frame.locator('rect.panel')).toHaveCount(2)
    await expect(frame.locator('ellipse.object')).toHaveCount(1)
    await expect(frame.locator('.caption')).toHaveText(/^MOSAIC 1×2 · field \d+′×\d+′ · orientation unknown$/)
    await expect(frame.locator('text.panel-no')).toHaveText(['1', '2'])
    const g = await frame.evaluate((el) => {
      const n = (e: Element, a: string) => Number(e.getAttribute(a))
      const rs = [...el.querySelectorAll('rect.panel')].map((r) => ({ x: n(r, 'x'), y: n(r, 'y'), w: n(r, 'width'), h: n(r, 'height') }))
      const e = el.querySelector('ellipse.object')!
      return { rs, cx: n(e, 'cx'), cy: n(e, 'cy'), rx: n(e, 'rx'), ry: n(e, 'ry') }
    })
    const ux0 = Math.min(...g.rs.map((r) => r.x)), ux1 = Math.max(...g.rs.map((r) => r.x + r.w))
    const uy0 = Math.min(...g.rs.map((r) => r.y)), uy1 = Math.max(...g.rs.map((r) => r.y + r.h))
    expect(g.cx - g.rx).toBeGreaterThanOrEqual(ux0 - 0.5)
    expect(g.cx + g.rx).toBeLessThanOrEqual(ux1 + 0.5)
    expect(g.cy - g.ry).toBeGreaterThanOrEqual(uy0 - 0.5)
    expect(g.cy + g.ry).toBeLessThanOrEqual(uy1 + 0.5)

    const box = (await chart.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.locator('.readout')).toContainText(/\d\d:\d\d · target \d+° az \d+°/)
  })

  test('equatorial drops the mount line', async ({ page }) => {
    const state = seededState()
    state.gear[0] = { ...state.gear[0], mount: 'eq', maxAltDeg: 90 }
    await openNgc7000(page, state)
    const chart = page.locator('svg[aria-label="Altitude through the night"]')
    await expect(chart.locator('line.min-alt')).toHaveCount(1)
    await expect(chart.locator('line.mount-limit')).toHaveCount(0)
  })

  test('Moon strip', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-24')
    const row = page.locator('ol.entries > li').first()
    await expect(row).toBeVisible({ timeout: 60_000 })
    await row.getByRole('link').first().click()
    await expect(page.locator('.moon-strip .moon-summary')).toHaveText(/^Moon \d+% lit · closest \d+° at \d\d:\d\d/)
    expect(await page.locator('.moon-strip rect.moon-hurts').count()).toBeGreaterThanOrEqual(1)
    expect(await page.locator('.moon-strip path.moon-sep').count()).toBeGreaterThanOrEqual(1)
  })

  test('hidden target has a chart but no usable stretch', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/#target=NGC0104&date=2026-11-22')
    const chart = page.locator('svg[aria-label="Altitude through the night"]')
    await expect(chart).toBeVisible({ timeout: 60_000 })
    await expect(chart.locator('path.target')).toHaveCount(1)
    await expect(chart.locator('rect.usable')).toHaveCount(0)
  })

  test('phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openNgc7000(page)
    await expect(page.locator('svg[aria-label="Altitude through the night"]')).toBeVisible()
    await expect(page.locator('.frame-preview svg')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })

  test('controls are hidden while a detail is open', async ({ page }) => {
    await openNgc7000(page)
    await expect(page.getByLabel('Date')).toBeHidden()
    await expect(page.getByLabel('Site')).toBeHidden()
    await expect(page.getByLabel('Gear')).toBeHidden()
    await page.getByRole('button', { name: '‹ Tonight' }).click()
    await expect(page.getByLabel('Date')).toBeVisible()
    await expect(page.getByLabel('Site')).toBeVisible()
  })

  test('M31 caption states the catalogued PA', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/#target=NGC0224&date=2026-11-22')
    await expect(page.locator('.frame-preview .caption')).toHaveText(/PA 35°, not drawn$/, { timeout: 60_000 })
  })

  test('opening a detail and going back does not pin the date', async ({ page }) => {
    const t1 = Date.UTC(2026, 10, 22, 20)
    await page.clock.setFixedTime(t1)
    await seedStorage(page)
    await page.goto('/')
    await expect(page.getByLabel('Date')).toHaveValue('2026-11-22')
    const row = page.locator('ol.entries > li').first()
    await expect(row).toBeVisible({ timeout: 60_000 })
    await row.getByRole('link').first().click()
    await expect(page.locator('.detail')).toBeVisible()
    await page.getByRole('button', { name: '‹ Tonight' }).click()
    await page.clock.setFixedTime(t1 + 24 * 3600_000)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(page.getByLabel('Date')).toHaveValue('2026-11-23')
  })
})
