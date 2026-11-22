import { test, expect, type Page } from '@playwright/test'
import { seedStorage } from './seed'
import { aim, stubSensors } from './sensors-stub'

const TEST_NOW = Date.UTC(2026, 5, 15, 22, 0, 0)
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('asp:v1') ?? 'null'))
const slider = (page: Page, az: number) => page.getByRole('slider', { name: `Azimuth ${az}°` })

/** Roof 30° over compass headings 90–150, open (2°) elsewhere. */
const roof = (h: number) => (h >= 90 && h < 150 ? 30 : 2)
const headings = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i)

async function startSweep(page: Page): Promise<void> {
  await page.goto('/#sites')
  await page.getByRole('button', { name: 'Sweep horizon' }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const sweep = page.getByRole('dialog', { name: 'Horizon sweep' })
  await expect(sweep).toBeVisible()
  // The orientation listener starts once the camera is up: prime with a sample at heading 0 until it shows.
  await expect(async () => {
    await aim(page, [[0, 2]])
    await expect(sweep.getByText('—')).toHaveCount(0, { timeout: 200 })
  }).toPass()
}

test.describe('Phone horizon sweep', () => {
  test('a full sweep opens the editor dirty with the roof; Save stores a sweep profile', async ({ page }) => {
    await seedStorage(page)
    await stubSensors(page, { testNow: TEST_NOW })
    await startSweep(page)
    const sweep = page.getByRole('dialog', { name: 'Horizon sweep' })
    await expect(sweep.locator('video')).toBeVisible()

    await aim(page, [...headings(0, 360), 0].map((h) => [h, roof(h)] as [number, number]))
    await expect(sweep.getByText(/360\/360|35\d\/360/)).toBeVisible()
    await sweep.getByRole('button', { name: 'Done' }).click()

    await expect(sweep).toBeHidden()
    const editor = page.getByRole('region', { name: 'Horizon for London' })
    await expect(editor).toBeVisible()
    await expect(editor.getByText('Unsaved changes')).toBeVisible()
    await expect(editor.getByText('Uncalibrated — calibrate north for accuracy')).toBeVisible()
    const v120 = Number(await slider(page, 120).getAttribute('aria-valuenow'))
    expect(Math.abs(v120 - 30)).toBeLessThanOrEqual(1)
    const v200 = Number(await slider(page, 200).getAttribute('aria-valuenow'))
    expect(Math.abs(v200 - 2)).toBeLessThanOrEqual(1)

    await editor.getByRole('button', { name: 'Save horizon' }).click()
    const h = (await stored(page)).sites[0].horizon
    expect(h.source).toBe('sweep')
    expect(h.calibration).toBeNull()
    expect(h.unswept).toBeUndefined()
    expect(Math.abs(h.altitudes[120] - 30)).toBeLessThanOrEqual(1)
  })

  test('an 8° gap is reported; Fill from neighbours opens the editor with hatched bins', async ({ page }) => {
    await seedStorage(page)
    await stubSensors(page, { testNow: TEST_NOW })
    await startSweep(page)
    const sweep = page.getByRole('dialog', { name: 'Horizon sweep' })

    await aim(page, headings(0, 200).map((h) => [h, roof(h)] as [number, number]))
    await page.evaluate(() => window.__advanceTime(2000))
    await aim(page, [...headings(208, 360), 0].map((h) => [h, roof(h)] as [number, number]))
    await sweep.getByRole('button', { name: 'Done' }).click()

    const gap = sweep.getByText(/^Not swept: \d+°–\d+°$/)
    await expect(gap).toHaveCount(1)
    const [, a, b] = (await gap.textContent())!.match(/(\d+)°–(\d+)°/)!.map(Number)
    expect(b - a + 1).toBe(8)
    expect(a).toBeGreaterThanOrEqual(200)
    expect(a).toBeLessThanOrEqual(202)

    // Sweeping the gaps keeps what was already swept.
    await sweep.getByRole('button', { name: 'Sweep the gaps' }).click()
    await expect(gap).toHaveCount(0)
    await sweep.getByRole('button', { name: 'Done' }).click()
    await expect(gap).toHaveCount(1)

    await sweep.getByRole('button', { name: 'Fill from neighbours' }).click()
    const editor = page.getByRole('region', { name: 'Horizon for London' })
    await expect(editor).toBeVisible()
    await expect(editor.locator('rect.unswept')).toHaveCount(1)
    await editor.getByRole('button', { name: 'Save horizon' }).click()
    const h = (await stored(page)).sites[0].horizon
    expect(h.unswept.filter(Boolean)).toHaveLength(8)
  })

  test('refused motion permission explains how to fix it and offers the manual editor', async ({ page }) => {
    await seedStorage(page)
    await stubSensors(page, { permission: 'denied', testNow: TEST_NOW })
    await page.goto('/#sites')
    await page.getByRole('button', { name: 'Sweep horizon' }).click()
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.getByText('Motion access was refused. On iPhone: Settings › Safari › Motion & Orientation Access, then try again.')).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Horizon sweep' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Draw it by hand instead' }).click()
    await expect(page.getByRole('region', { name: 'Horizon for London' })).toBeVisible()
  })

  test('without DeviceOrientationEvent it asks for a phone', async ({ page }) => {
    await seedStorage(page)
    await stubSensors(page, { noOrientation: true })
    await page.goto('/#sites')
    await page.getByRole('button', { name: 'Sweep horizon' }).click()
    await expect(page.getByText('This needs a phone or tablet with a compass.')).toBeVisible()
    await page.getByRole('button', { name: 'Draw it by hand instead' }).click()
    await expect(page.getByRole('region', { name: 'Horizon for London' })).toBeVisible()
  })

  test('390 px: start panel, running sweep and gap panel have no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedStorage(page)
    await stubSensors(page, { testNow: TEST_NOW })
    const noHScroll = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    }
    await page.goto('/#sites')
    await page.getByRole('button', { name: 'Sweep horizon' }).click()
    await noHScroll()
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    const sweep = page.getByRole('dialog', { name: 'Horizon sweep' })
    await expect(sweep).toBeVisible()
    await noHScroll()
    await expect(async () => {
      await aim(page, [[0, 5]])
      await expect(sweep.getByText('—')).toHaveCount(0, { timeout: 200 })
    }).toPass()
    for (const name of ['Done', 'Cancel']) {
      const box = (await sweep.getByRole('button', { name }).boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(390)
      expect(box.y + box.height).toBeLessThanOrEqual(844)
    }
    await aim(page, headings(0, 100).map((h) => [h, 5] as [number, number]))
    await sweep.getByRole('button', { name: 'Done' }).click()
    await expect(sweep.getByRole('button', { name: 'Fill from neighbours' })).toBeInViewport()
    await noHScroll()
  })
})
