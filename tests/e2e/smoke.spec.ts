import { test, expect } from '@playwright/test'
import { seededState } from './seed'

test('app shell renders with PWA manifest', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Astro Session Planner' })).toBeVisible()
  await expect(page.locator('link[rel=manifest]')).toHaveCount(1)
})

test('only the selected tab is shown (M9)', async ({ page }) => {
  const settings = page.getByRole('heading', { name: 'Settings', exact: true })
  const tonight = page.getByRole('heading', { name: 'Tonight', exact: true })
  await page.goto('/')
  await expect(tonight).toBeVisible()
  await expect(settings).toBeHidden()
  await page.goto('/#tonight')
  await expect(tonight).toBeVisible()
  await expect(settings).toBeHidden()
  await page.goto('/#settings')
  await expect(settings).toBeVisible()
  await expect(tonight).toBeHidden()
})

test('works offline after the first load (M8)', async ({ page, context }) => {
  await page.addInitScript((json) => localStorage.setItem('asp:v1', json), JSON.stringify(seededState()))
  await page.goto('/?date=2026-11-22')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect(page.locator('ol.entries > li').first()).toBeVisible({ timeout: 60_000 })
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('ol.entries > li').first()).toBeVisible({ timeout: 60_000 })
  await context.setOffline(false)
})

test('hidden #sensor-probe screen renders Start and Back', async ({ page }) => {
  await page.goto('/#sensor-probe')
  await expect(page.getByRole('heading', { name: 'Astro Session Planner' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
})
