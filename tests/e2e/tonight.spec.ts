import { test, expect } from '@playwright/test'
import { seedStorage, seededState } from './seed'

test.describe('Tonight', () => {
  test('ranked shortlist with times, mosaic flag and hidden lists', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22')
    const rows = page.locator('ol.entries > li')
    await expect(rows.first()).toBeVisible({ timeout: 60_000 })
    expect(await rows.count()).toBeGreaterThanOrEqual(10)
    await expect(rows.first()).toContainText(/\d\d:\d\d–\d\d:\d\d/)
    await expect(page.locator('p.summary')).toContainText(/Dark \d\d:\d\d–\d\d:\d\d · Moon \d+%/)
    await expect(rows.filter({ hasText: 'NGC 7000' }).first()).toContainText('MOSAIC')
    // A space between the catalogue name and the common name.
    await expect(rows.filter({ hasText: 'NGC 7000' }).first().locator('.title')).toHaveText('NGC 7000 North America Nebula')

    await page.getByRole('button', { name: /^Too small/ }).click()
    await expect(page.locator('.hidden-list li', { hasText: 'NGC 7662' })).toBeVisible()
  })

  test('midsummer shows the nautical-twilight banner and labels the window', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-06-21')
    await expect(page.getByText('No astronomical darkness tonight — using nautical twilight')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('p.summary')).toContainText(/^Nautical dark \d\d:\d\d–/)
  })

  test('no nautical darkness either: says so without claiming nautical twilight (D3)', async ({ page }) => {
    const state = seededState()
    Object.assign(state.sites[0], { name: 'Oslo', lat: 60, lon: 10.7, timezone: 'Europe/Oslo' })
    await seedStorage(page, state)
    await page.goto('/?date=2026-06-21')
    await expect(page.getByText('No usable darkness tonight (Sun never below −12°).')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/using nautical twilight/)).toHaveCount(0)
  })

  test('a site with no horizon shows a banner linking to its horizon editor (I1)', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22')
    await expect(page.getByText('No horizon set for this site — obstructions are ignored.')).toBeVisible()
    await page.getByRole('link', { name: 'Set the horizon' }).click()
    await expect(page).toHaveURL(/#sites$/)
    await expect(page.getByRole('region', { name: 'Horizon for London' })).toBeVisible()
  })

  test('no horizon banner once a horizon is saved', async ({ page }) => {
    const state = seededState()
    ;(state.sites[0] as Record<string, unknown>).horizon = {
      altitudes: Array(360).fill(0), seasonal: Array(360).fill(false), leafOffAltitudes: Array(360).fill(0),
      northOffsetDeg: 0, createdAt: '2026-11-22T00:00:00Z', source: 'manual',
    }
    await seedStorage(page, state)
    await page.goto('/?date=2026-11-22')
    await expect(page.locator('ol.entries > li').first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('No horizon set for this site')).toHaveCount(0)
  })

  test('date buttons move by one day', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22')
    await page.getByRole('button', { name: 'Next day' }).click()
    await expect(page.getByLabel('Date').filter({ visible: true })).toHaveValue('2026-11-23')
  })

  test('corrupt storage shows no-site prompt and an error banner', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('asp:v1', '{not json'))
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Add a site' })).toHaveAttribute('href', '#sites')
    await expect(page.getByRole('alert')).toContainText('invalid')
  })

  test('fits a 390px viewport without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedStorage(page)
    await page.goto('/?date=2026-11-22')
    await expect(page.locator('ol.entries > li').first()).toBeVisible({ timeout: 60_000 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
  })

  test('iOS Safari tab shows a one-time install hint (I4)', async ({ browser }) => {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    })
    const page = await context.newPage()
    await seedStorage(page)
    await page.goto('/?date=2026-11-22')
    const hint = page.getByText('Add to Home Screen to keep your sites — and export a backup in Settings.')
    await expect(hint).toBeVisible()
    await page.getByRole('button', { name: 'Dismiss install hint' }).click()
    await expect(hint).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('asp:v1')!).dismissed)).toContain('ios-install')
    await context.close()
  })

  test('desktop browsers get no install hint', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22')
    await expect(page.locator('ol.entries > li').first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/Add to Home Screen/)).toHaveCount(0)
  })
})
