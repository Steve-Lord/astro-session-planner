import { test, expect, type Page } from '@playwright/test'
import { seedStorage } from './seed'

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('asp:v1') ?? 'null'))

/** Total entries on Tonight, expanding every "Show more" page. */
async function entryCount(page: Page): Promise<number> {
  const rows = page.locator('ol.entries > li')
  await expect(page.locator('p.summary')).toBeVisible({ timeout: 60_000 })
  for (;;) {
    const more = page.getByRole('button', { name: /^Show more/ })
    if ((await more.count()) === 0) break
    await more.click()
  }
  return rows.count()
}

test.describe('Sites, horizon, settings', () => {
  test('creating a site makes it appear in the Tonight picker', async ({ page }) => {
    await page.goto('/?date=2026-11-22#sites')
    await page.getByRole('button', { name: 'Add site' }).click()
    await page.getByLabel('Name').fill('Back garden')
    await page.getByLabel('Latitude').fill('52.2')
    await page.getByLabel('Longitude').fill('0.12')
    await page.getByLabel('Bortle class').fill('5')
    await page.getByRole('button', { name: 'Save site' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'Back garden' })).toContainText('no horizon set')
    await page.getByRole('link', { name: 'Tonight' }).click()
    await expect(page.getByLabel('Site').locator('option', { hasText: 'Back garden' })).toHaveCount(1)
    const s = await stored(page)
    expect(s.sites[0]).toMatchObject({ name: 'Back garden', horizon: null, isDefault: true, treesBare: false })
    expect(s.selectedSiteId).toBe(s.sites[0].id)
  })

  test('rejects out-of-range coordinates', async ({ page }) => {
    await page.goto('/#sites')
    await page.getByRole('button', { name: 'Add site' }).click()
    await page.getByLabel('Name').fill('Nowhere')
    await page.getByLabel('Latitude').fill('95')
    await page.getByLabel('Longitude').fill('0')
    await page.getByRole('button', { name: 'Save site' }).click()
    await expect(page.getByRole('alert')).toContainText('Latitude')
    expect((await stored(page))?.sites ?? []).toHaveLength(0)
  })

  test('keyboard horizon editing is saved and removes targets from Tonight', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22')
    const flat = await entryCount(page)

    await page.getByRole('link', { name: 'Sites' }).click()
    await page.getByRole('button', { name: 'Edit horizon' }).click()
    const p180 = page.getByRole('slider', { name: 'Azimuth 180°' })
    await p180.focus()
    for (let i = 0; i < 30; i++) await p180.press('ArrowUp')
    await expect(p180).toHaveAttribute('aria-valuenow', '30')
    // Raise the whole south sector so the effect is robust.
    for (let az = 120; az <= 240; az += 10) {
      if (az === 180) continue // already at 30°
      const p = page.getByRole('slider', { name: `Azimuth ${az}°` })
      await p.focus()
      await p.press('PageUp')
      await p.press('PageUp')
      await p.press('PageUp')
    }
    await page.getByRole('button', { name: 'Save horizon' }).click()
    await expect.poll(async () => (await stored(page)).sites[0].horizon?.altitudes[180]).toBe(30)
    const h = (await stored(page)).sites[0].horizon
    expect(h.source).toBe('manual')
    expect(h.altitudes[175]).toBe(30)

    await page.getByRole('link', { name: 'Tonight' }).click()
    const blocked = await entryCount(page)
    expect(blocked).toBeLessThan(flat)
  })

  test('seasonal tool marks trees over a wrapping range', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/#sites')
    await page.getByRole('button', { name: 'Edit horizon' }).click()
    await page.getByLabel('From azimuth').fill('350')
    await page.getByLabel('To azimuth').fill('10')
    await page.getByLabel('Leaf-off altitude').fill('5')
    await page.getByRole('button', { name: 'Mark as trees' }).click()
    await page.getByRole('button', { name: 'Save horizon' }).click()
    await expect.poll(async () => (await stored(page)).sites[0].horizon?.seasonal[0]).toBe(true)
    const h = (await stored(page)).sites[0].horizon
    expect(h.seasonal[350]).toBe(true)
    expect(h.seasonal[10]).toBe(true)
    expect(h.seasonal[11]).toBe(false)
    expect(h.leafOffAltitudes[355]).toBe(5)
  })

  test('export then import restores a deleted site', async ({ page }, testInfo) => {
    await seedStorage(page)
    await page.goto('/#settings')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export backup' }).click()
    const dl = await download
    expect(dl.suggestedFilename()).toBe('astro-session-planner-backup.json')
    const file = testInfo.outputPath('backup.json')
    await dl.saveAs(file)

    await page.getByRole('link', { name: 'Sites' }).click()
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('London')).toHaveCount(0)

    await page.getByRole('link', { name: 'Settings' }).click()
    await page.getByLabel('Import backup').setInputFiles(file)
    await expect(page.getByRole('status').filter({ hasText: 'Imported' })).toBeVisible()
    await page.getByRole('link', { name: 'Sites' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'London' })).toBeVisible()
  })

  test('importing a non-JSON file shows an error and keeps sites', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/#settings')
    await page.getByLabel('Import backup').setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('not json at all') })
    await expect(page.getByRole('alert')).toContainText('not valid JSON')
    await page.getByRole('link', { name: 'Sites' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'London' })).toBeVisible()
  })

  test('a custom target appears in Tonight', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/#settings')
    await page.getByLabel('Target name').fill('Zed Test Nebula')
    await page.getByLabel('RA (h:m:s)').fill('0:0:0')
    await page.getByLabel('Dec (±d:m:s)').fill('+72:0:0')
    await page.getByLabel('Major axis (arcmin)').fill('10')
    await page.getByLabel('Minor axis (arcmin)').fill('10')
    await page.getByLabel('Type').selectOption('EmN')
    await page.getByRole('button', { name: 'Add target' }).click()
    await expect(page.getByRole('listitem').filter({ hasText: 'Zed Test Nebula' })).toBeVisible()
    await page.getByRole('link', { name: 'Tonight' }).click()
    await page.getByLabel('Date').fill('2026-12-21')
    await expect(page.locator('ol.entries > li').filter({ hasText: 'Zed Test Nebula' })).toBeVisible({ timeout: 60_000 })
  })

  test('settings edit persists and reset restores defaults', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/#settings')
    await page.getByLabel('Horizon clearance').fill('4')
    await expect.poll(async () => (await stored(page)).settings.clearanceDeg).toBe(4)
    await page.getByRole('button', { name: 'Reset defaults' }).click()
    await expect.poll(async () => (await stored(page)).settings.clearanceDeg).toBe(2)
  })

  test('gear card shows the Seestar field of view', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/#gear')
    await expect(page.getByRole('region', { name: 'Seestar S50 Pro' })).toBeVisible()
    await expect(page.getByText(/147′ × 83′/)).toBeVisible()
  })

  test('horizon editor fits a 390px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedStorage(page)
    await page.goto('/#sites')
    await page.getByRole('button', { name: 'Edit horizon' }).click()
    await expect(page.getByRole('slider', { name: 'Azimuth 0°' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  })

  test('lightpollutionmap link carries no coordinates', async ({ page }) => {
    await page.goto('/#sites')
    await page.getByRole('button', { name: 'Add site' }).click()
    await expect(page.getByRole('link', { name: /lightpollutionmap/i })).toHaveAttribute('href', 'https://www.lightpollutionmap.info')
  })

  test('dragging a control point raises it; a plain click does not move it', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/#sites')
    await page.getByRole('button', { name: 'Edit horizon' }).click()
    const handle = page.getByRole('slider', { name: 'Azimuth 90°' })
    const box = (await handle.boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    // Plain click off-centre: value unchanged.
    await page.mouse.click(x + 2, y - 3)
    await expect(handle).toHaveAttribute('aria-valuenow', '0')
    // Drag up by 40 screen px.
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y - 20, { steps: 4 })
    await page.mouse.move(x, y - 40, { steps: 4 })
    await page.mouse.up()
    const now = Number(await handle.getAttribute('aria-valuenow'))
    expect(now).toBeGreaterThan(5)
    await page.getByRole('button', { name: 'Save horizon' }).click()
    await expect.poll(async () => (await stored(page)).sites[0].horizon?.altitudes[90]).toBe(now)
  })

  test('Tonight keeps its date across tab switches', async ({ page }) => {
    await seedStorage(page)
    await page.goto('/?date=2026-11-22')
    await page.getByRole('button', { name: 'Next day' }).click()
    await expect(page.getByLabel('Date')).toHaveValue('2026-11-23')
    await page.getByRole('link', { name: 'Settings' }).click()
    await page.getByRole('link', { name: 'Tonight' }).click()
    await expect(page.getByLabel('Date')).toHaveValue('2026-11-23')
  })
})
