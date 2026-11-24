import { test, expect } from '@playwright/test'
import { seedStorage } from './seed'

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

  test('phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedStorage(page)
    await page.goto('/?date=2026-11-22')
    const row = page.locator('ol.entries > li', { hasText: 'NGC 7000' }).first()
    await expect(row).toBeVisible({ timeout: 60_000 })
    await row.getByRole('link').first().click()
    await expect(page.locator('.detail')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
