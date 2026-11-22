import { test, expect } from '@playwright/test'

test('app shell renders with PWA manifest', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Astro Session Planner' })).toBeVisible()
  await expect(page.locator('link[rel=manifest]')).toHaveCount(1)
})
