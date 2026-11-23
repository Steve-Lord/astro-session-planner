import { test, expect, type Page } from '@playwright/test'
import { seededState } from './seed'

/** Seeds storage only when empty, so a reload keeps what the page saved. */
async function seedOnce(page: Page): Promise<void> {
  const state = seededState()
  // A bright, frame-filling target that transits at ~90° from London near midnight on 2026-12-21.
  ;(state.customTargets as unknown[]).push({
    id: 'zenith-test', names: ['Zenith test'], ra: 90, dec: 51.5, type: 'Neb', majArcmin: 60, minArcmin: 40,
    posAngle: null, mag: 6, surfBr: 20, emission: 'emission',
  })
  await page.addInitScript((json) => {
    if (!localStorage.getItem('asp:v1')) localStorage.setItem('asp:v1', json)
  }, JSON.stringify(state))
}

test.describe('Gear mount switch', () => {
  test('mount switch lifts the zenith limit and persists', async ({ page }) => {
    await seedOnce(page)
    await page.goto('/?date=2026-12-21')
    const row = page.locator('ol.entries > li', { hasText: 'Zenith test' }).first()
    await expect(row).toBeVisible({ timeout: 60_000 })
    const before = await row.innerText()

    await page.getByRole('link', { name: 'Gear' }).click()
    const card = page.getByRole('region', { name: 'Seestar S50 Pro' })
    const group = card.getByRole('group', { name: 'Mount' })
    await expect(group.getByRole('button', { name: 'Alt-az' })).toHaveAttribute('aria-pressed', 'true')
    await expect(card).toContainText('Alt-az: tracking fails above 80° and the field rotates during long sessions.')

    await group.getByRole('button', { name: 'Equatorial' }).click()
    await expect(group.getByRole('button', { name: 'Equatorial' })).toHaveAttribute('aria-pressed', 'true')
    await expect(group.getByRole('button', { name: 'Alt-az' })).toHaveAttribute('aria-pressed', 'false')
    await expect(card).toContainText('15°–90°')
    await expect(card).not.toContainText('tracking fails above 80°')

    await page.getByRole('link', { name: 'Tonight' }).click()
    await expect.poll(async () => row.innerText()).not.toBe(before)

    await page.reload()
    await page.getByRole('link', { name: 'Gear' }).click()
    await expect(page.getByRole('region', { name: 'Seestar S50 Pro' }).getByRole('button', { name: 'Equatorial' }))
      .toHaveAttribute('aria-pressed', 'true')
  })

  test('mount switch fits a phone card', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedOnce(page)
    await page.goto('/#gear')
    const card = page.getByRole('region', { name: 'Seestar S50 Pro' })
    await expect(card.getByRole('group', { name: 'Mount' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    for (const name of ['Alt-az', 'Equatorial']) {
      const box = await card.getByRole('button', { name }).boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(40)
    }
    await card.getByRole('button', { name: 'Alt-az' }).click()
    await expect(card).toContainText('15°–80°')
  })
})
