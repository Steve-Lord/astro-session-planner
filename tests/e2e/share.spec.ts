import { test, expect, type Page } from '@playwright/test'
import { seedStorage, seededState } from './seed'

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('asp:v1') ?? 'null'))

/** A saved, non-flat horizon on London (multiples of 0.5 so the 0.5° quantisation is exact). */
function stateWithHorizon() {
  const s = seededState()
  const altitudes = Array.from({ length: 360 }, (_, i) => (i >= 90 && i < 150 ? 25 : (i % 40) * 0.5))
  ;(s.sites[0] as { horizon: unknown }).horizon = {
    altitudes, seasonal: new Array(360).fill(false), leafOffAltitudes: altitudes.slice(),
    northOffsetDeg: 0, createdAt: '2026-11-01T00:00:00.000Z', source: 'sweep', calibration: null,
  }
  return s
}

function stateWithGarden() {
  const s = seededState()
  s.sites = [{
    id: 'garden', name: 'Garden', lat: 40.2, lon: 3.1, elevation: 10, timezone: 'Europe/Madrid',
    sky: { bortle: 4 }, horizon: null, treesBare: false, isDefault: true,
  }] as typeof s.sites
  s.selectedSiteId = 'garden'
  return s
}

async function shareLink(page: Page): Promise<string> {
  await seedStorage(page, stateWithHorizon())
  await page.goto('/#sites')
  await page.getByRole('button', { name: 'Edit horizon' }).click()
  await page.getByRole('button', { name: 'Send to another device' }).click()
  const link = (await page.locator('code.share-link').textContent())!.trim()
  return link
}

test.describe('Share and import a horizon', () => {
  test('link carries no coordinates; importing replaces the chosen site horizon', async ({ page, context }) => {
    const link = await shareLink(page)
    expect(link).toMatch(/#import-horizon=[A-Za-z0-9_-]+$/)
    expect(link).not.toContain('51.5')
    await expect(page.getByText('The link contains only the horizon shape — no location.')).toBeVisible()

    const b = await context.newPage()
    await seedStorage(b, stateWithGarden())
    await b.goto(link)
    const dialog = b.getByRole('dialog', { name: 'Import horizon' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Import into').selectOption('garden')
    await dialog.getByRole('button', { name: 'Replace horizon' }).click()
    await expect(dialog).toBeHidden()
    expect(new URL(b.url()).hash).toBe('#sites')
    await expect(b.getByRole('region', { name: 'Horizon for Garden' })).toBeVisible()
    await expect(b.getByText('Unsaved changes')).toHaveCount(0)

    const s = await stored(b)
    const h = s.sites[0].horizon
    const orig = stateWithHorizon().sites[0].horizon!.altitudes
    expect(h.source).toBe('import')
    for (let i = 0; i < 360; i++) expect(Math.abs(h.altitudes[i] - orig[i])).toBeLessThanOrEqual(0.5)
  })

  test('a truncated link shows an error and changes nothing', async ({ page, context }) => {
    const link = await shareLink(page)
    const [base, payload] = link.split('#import-horizon=')
    const cut = `${base}#import-horizon=${payload.slice(0, Math.floor(payload.length / 2))}`

    const b = await context.newPage()
    await seedStorage(b, stateWithGarden())
    await b.goto('/#sites')
    const before = await stored(b)
    await b.goto(cut)
    const dialog = b.getByRole('dialog', { name: 'Import horizon' })
    await expect(dialog.getByRole('alert')).toContainText('This link is')
    await dialog.getByRole('button', { name: 'Dismiss' }).click()
    await expect(dialog).toBeHidden()
    expect(await stored(b)).toEqual(before)
  })

  test('New site… hands the horizon to the site form', async ({ page, context }) => {
    const link = await shareLink(page)
    const b = await context.newPage()
    await seedStorage(b, stateWithGarden())
    await b.goto(link)
    const dialog = b.getByRole('dialog', { name: 'Import horizon' })
    await dialog.getByLabel('Import into').selectOption('__new__')
    await dialog.getByRole('button', { name: 'Continue' }).click()
    await b.getByLabel('Name').fill('Allotment')
    await b.getByLabel('Latitude').fill('41')
    await b.getByLabel('Longitude').fill('2')
    await b.getByRole('button', { name: 'Save site' }).click()
    const s = await stored(b)
    const site = s.sites.find((x: { name: string }) => x.name === 'Allotment')
    expect(site.horizon.source).toBe('import')
  })

  test('the QR code fits a 390 px phone without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await shareLink(page)
    const qr = page.locator('.share-qr svg')
    await expect(qr).toBeVisible()
    const w = await qr.evaluate((e) => e.getBoundingClientRect().width)
    expect(w).toBeLessThanOrEqual(390)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
