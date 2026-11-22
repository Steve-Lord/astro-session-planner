import { test, expect } from '@playwright/test'
import { seedStorage } from './seed'

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

    await rows.first().getByRole('button', { name: 'why' }).click()
    await expect(rows.first().locator('dd')).toHaveCount(5)

    await page.getByRole('button', { name: /^Too small/ }).click()
    await expect(page.locator('.hidden-list li', { hasText: 'NGC 7662' })).toBeVisible()
  })

  test('midsummer shows the nautical-twilight banner', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-06-21')
    await expect(page.getByText('No astronomical darkness tonight — using nautical twilight')).toBeVisible({ timeout: 60_000 })
  })

  test('date buttons move by one day', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22')
    await page.getByRole('button', { name: 'Next day' }).click()
    await expect(page.getByLabel('Date')).toHaveValue('2026-11-23')
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
})
