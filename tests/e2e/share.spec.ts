import { test, expect, type Page } from '@playwright/test'
import { seedStorage, seededState } from './seed'

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('asp:v1') ?? 'null'))

/** A saved, non-flat horizon on London (multiples of 0.5 so the 0.5° quantisation is exact). */
function stateWithHorizon(plateau = 25) {
  const s = seededState()
  const altitudes = Array.from({ length: 360 }, (_, i) => (i >= 90 && i < 150 ? plateau : (i % 40) * 0.5))
  ;(s.sites[0] as { horizon: unknown }).horizon = {
    altitudes, seasonal: new Array(360).fill(false), leafOffAltitudes: altitudes.slice(),
    northOffsetDeg: 0, createdAt: '2026-11-01T00:00:00.000Z', source: 'sweep', calibration: null,
  }
  return s
}

const flat5 = () => ({
  altitudes: new Array(360).fill(5), seasonal: new Array(360).fill(false), leafOffAltitudes: new Array(360).fill(5),
  northOffsetDeg: 0, createdAt: '2026-11-01T00:00:00.000Z', source: 'manual', calibration: null,
})

/** Garden (selected; flat 5° horizon when `garden5`), plus a Cabin site when `cabin`. */
function stateWithGarden(opts: { garden5?: boolean; cabin?: boolean } = {}) {
  const s = seededState()
  const site = (id: string, name: string, horizon: unknown, isDefault: boolean) =>
    ({ id, name, lat: 40.2, lon: 3.1, elevation: 10, timezone: 'Europe/Madrid', sky: { bortle: 4 }, horizon, treesBare: false, isDefault })
  s.sites = [site('garden', 'Garden', opts.garden5 ? flat5() : null, true),
    ...(opts.cabin ? [site('cabin', 'Cabin', null, false)] : [])] as unknown as typeof s.sites
  s.selectedSiteId = 'garden'
  return s
}

const slider = (page: Page, az: number) => page.getByRole('slider', { name: `Azimuth ${az}°` })

/** Answers every confirm() with `answer.value`, recording the messages. */
function answerDialogs(page: Page, answer: { value: boolean }): string[] {
  const msgs: string[] = []
  page.on('dialog', (d) => { msgs.push(d.message()); void (answer.value ? d.accept() : d.dismiss()) })
  return msgs
}

async function shareLink(page: Page, plateau = 25): Promise<string> {
  await seedStorage(page, stateWithHorizon(plateau))
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
    await expect(slider(b, 90)).toHaveAttribute('aria-valuenow', '25')
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
    expect(site.horizon.altitudes[90]).toBe(25)
    expect(site.horizon.altitudes[0]).toBe(0)
  })

  test('leaving the new-site form drops the pending horizon', async ({ page, context }) => {
    const link = await shareLink(page)
    for (const leave of ['cancel', 'edit-other'] as const) {
      const b = await context.newPage()
      await seedStorage(b, stateWithGarden({ cabin: true }))
      await b.goto(link)
      const dialog = b.getByRole('dialog', { name: 'Import horizon' })
      await dialog.getByLabel('Import into').selectOption('__new__')
      await dialog.getByRole('button', { name: 'Continue' }).click()
      await expect(b.getByText('This new site will get the imported horizon.')).toBeVisible()
      if (leave === 'cancel') await b.getByRole('button', { name: 'Cancel' }).click()
      else {
        await b.getByRole('listitem').filter({ hasText: 'Cabin' }).getByRole('button', { name: 'Edit', exact: true }).click()
        await b.getByRole('button', { name: 'Cancel' }).click()
      }
      await b.getByRole('button', { name: 'Add site' }).click()
      await expect(b.getByText('This new site will get the imported horizon.')).toHaveCount(0)
      await b.getByLabel('Name').fill('Plain')
      await b.getByLabel('Latitude').fill('41')
      await b.getByLabel('Longitude').fill('2')
      await b.getByRole('button', { name: 'Save site' }).click()
      const st = await stored(b)
      expect(st.sites.find((x: { name: string }) => x.name === 'Plain').horizon).toBeNull()
      await b.close()
    }
  })

  test('replace asks first when the site already has a horizon', async ({ page, context }) => {
    const link = await shareLink(page)
    const b = await context.newPage()
    await seedStorage(b, stateWithGarden({ garden5: true }))
    const answer = { value: false }
    const msgs = answerDialogs(b, answer)
    await b.goto(link)
    const dialog = b.getByRole('dialog', { name: 'Import horizon' })
    await dialog.getByRole('button', { name: 'Replace horizon' }).click()
    expect(msgs).toEqual(['Replace the existing horizon for Garden?'])
    await expect(dialog).toBeVisible()
    expect((await stored(b)).sites[0].horizon.altitudes[90]).toBe(5)
    answer.value = true
    await dialog.getByRole('button', { name: 'Replace horizon' }).click()
    await expect(dialog).toBeHidden()
    expect((await stored(b)).sites[0].horizon.altitudes[90]).toBe(25)
  })

  test('import into the site whose editor has unsaved edits: declining keeps them, accepting shows the import', async ({ page, context }) => {
    const link = await shareLink(page)
    const b = await context.newPage()
    await seedStorage(b, stateWithGarden({ garden5: true }))
    const answer = { value: true }
    const msgs: string[] = []
    b.on('dialog', (d) => {
      msgs.push(d.message())
      void (d.message().startsWith('Replace') || answer.value ? d.accept() : d.dismiss())
    })
    await b.goto('/#sites')
    await b.getByRole('button', { name: 'Edit horizon' }).click()
    await slider(b, 90).focus()
    await b.keyboard.press('ArrowUp')
    await expect(slider(b, 90)).toHaveAttribute('aria-valuenow', '6')
    const hash = new URL(link).hash

    answer.value = false
    await b.evaluate((h) => { location.hash = h }, hash)
    const dialog = b.getByRole('dialog', { name: 'Import horizon' })
    await dialog.getByRole('button', { name: 'Replace horizon' }).click()
    await expect(dialog).toBeHidden()
    expect(msgs).toContain('Discard unsaved horizon changes?')
    await expect(slider(b, 90)).toHaveAttribute('aria-valuenow', '6')
    await expect(b.getByText('Unsaved changes')).toBeVisible()
    expect((await stored(b)).sites[0].horizon.altitudes[90]).toBe(5)

    answer.value = true
    await b.evaluate((h) => { location.hash = h }, hash)
    await dialog.getByRole('button', { name: 'Replace horizon' }).click()
    await expect(dialog).toBeHidden()
    await expect(slider(b, 90)).toHaveAttribute('aria-valuenow', '25')
    await expect(b.getByText('Unsaved changes')).toHaveCount(0)
    expect((await stored(b)).sites[0].horizon.altitudes[90]).toBe(25)
  })

  test('a second link while the dialog is open replaces the first', async ({ page, context }) => {
    const first = await shareLink(page, 25)
    const p2 = await context.newPage()
    const second = await shareLink(p2, 40)
    const b = await context.newPage()
    await seedStorage(b, stateWithGarden())
    await b.goto(first)
    const dialog = b.getByRole('dialog', { name: 'Import horizon' })
    const points = dialog.locator('polyline')
    await expect(points).toHaveAttribute('points', /(^| )90,65\.0( |$)/)
    await b.evaluate((h) => { location.hash = h }, new URL(second).hash)
    await expect(points).toHaveAttribute('points', /(^| )90,50\.0( |$)/)
    await dialog.getByRole('button', { name: 'Replace horizon' }).click()
    await expect(dialog).toBeHidden()
    expect((await stored(b)).sites[0].horizon.altitudes[90]).toBe(40)
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
