import { test, expect, type Page } from '@playwright/test'
import { seedStorage, seededState } from './seed'
import { aim, endCamera, setHidden, stubSensors, trackStates } from './sensors-stub'
import { calibrationCandidates } from '../../src/lib/sweep/calibration'
import { declination } from '../../src/lib/sweep/geomag'

const TEST_NOW = Date.UTC(2026, 5, 15, 22, 0, 0)
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('asp:v1') ?? 'null'))
const slider = (page: Page, az: number) => page.getByRole('slider', { name: `Azimuth ${az}°` })

/** Roof 30° over compass headings 90–150, open (2°) elsewhere. */
const roof = (h: number) => (h >= 90 && h < 150 ? 30 : 2)
const headings = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i)

async function startSweep(page: Page): Promise<void> {
  await page.goto('/#sites')
  await page.getByRole('button', { name: 'Sweep horizon' }).first().click()
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

  test('after Done the editor says Save now; a touched-up sweep saves as manual but keeps the badge and Calibrate north', async ({ page }) => {
    await seedStorage(page)
    await stubSensors(page, { testNow: TEST_NOW })
    await startSweep(page)
    const sweep = page.getByRole('dialog', { name: 'Horizon sweep' })
    await aim(page, [...headings(0, 360), 0].map((h) => [h, roof(h)] as [number, number]))
    await sweep.getByRole('button', { name: 'Done' }).click()

    const editor = page.getByRole('region', { name: 'Horizon for London' })
    await expect(editor.getByText('Save now — an unsaved sweep is lost if the phone closes the page. You can calibrate north later from Edit horizon.')).toBeVisible()
    await expect(editor.getByText(/^Calibrate now/)).toHaveCount(0)
    await slider(page, 200).focus()
    await page.keyboard.press('ArrowUp')
    await editor.getByRole('button', { name: 'Save now' }).click()

    const h = (await stored(page)).sites[0].horizon
    expect(h.source).toBe('manual')
    expect(h.sweptHere).toBe(true)
    expect(h.calibration).toBeNull()
    await expect(editor.getByText(/^Save now/)).toHaveCount(0)
    await expect(editor.getByText('Calibrate now (recommended) — the compass is only rough near buildings')).toBeVisible()

    // Later: reopened from the stored copy, the touched-up sweep still offers calibration and shows the badge.
    await editor.getByRole('button', { name: 'Close' }).click()
    await expect(editor).toHaveCount(0)
    await page.getByRole('button', { name: 'Edit horizon' }).click()
    await expect(editor.getByText('Uncalibrated — calibrate north for accuracy')).toBeVisible()
    await expect(editor.getByRole('button', { name: 'Calibrate north' })).toBeVisible()
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
    await expect(page.getByText('Motion access was refused. Close Safari (or the Home Screen app) completely, reopen this page, tap Start and choose Allow.')).toBeVisible()
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

  test('a desktop browser with the API but no sensor gets the "needs a phone" message', async ({ page }) => {
    await seedStorage(page)
    await stubSensors(page, { testNow: TEST_NOW })
    await page.goto('/#sites')
    await page.getByRole('button', { name: 'Sweep horizon' }).click()
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Horizon sweep' })).toBeVisible()
    // No samples are emitted: after ~2 s the overlay gives way to the message.
    await expect(page.getByText('This needs a phone or tablet with a compass.')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('dialog', { name: 'Horizon sweep' })).toHaveCount(0)
    expect((await trackStates(page)).every((s) => s === 'ended')).toBe(true)
    await page.getByRole('button', { name: 'Draw it by hand instead' }).click()
    await expect(page.getByRole('region', { name: 'Horizon for London' })).toBeVisible()
  })

  test('the status line shows "Slow down" for a fast jump, then clears', async ({ page }) => {
    await seedStorage(page)
    await stubSensors(page, { testNow: TEST_NOW })
    await startSweep(page)
    const sweep = page.getByRole('dialog', { name: 'Horizon sweep' })
    await aim(page, [[1, 2], [2, 2], [62, 2]]) // 60° in one 100 ms step
    await expect(sweep.getByRole('status')).toHaveText('Slow down')
    const shown = Date.now()
    // Good samples keep arriving; the message clears ~1.5 s after the last rejection.
    let h = 63
    await expect(async () => {
      await aim(page, [[h++, 2]])
      await expect(sweep.getByRole('status')).toHaveText('', { timeout: 100 })
    }).toPass({ timeout: 4000 })
    expect(Date.now() - shown).toBeGreaterThanOrEqual(1200)
  })

  test('leaving the Sites tab pauses the sweep: camera off, samples ignored; Resume keeps progress', async ({ page }) => {
    await seedStorage(page)
    await stubSensors(page, { testNow: TEST_NOW })
    await startSweep(page)
    await aim(page, headings(1, 100).map((h) => [h, 5] as [number, number]))
    const sweep = page.getByRole('dialog', { name: 'Horizon sweep' })
    const count = (await sweep.getByText(/^\d+\/360$/).textContent())!

    await page.evaluate(() => { location.hash = '#tonight' })
    await expect.poll(() => trackStates(page)).toEqual(['ended'])
    await aim(page, headings(100, 200).map((h) => [h, 5] as [number, number]))

    await page.evaluate(() => { location.hash = '#sites' })
    await expect(sweep).toHaveCount(0)
    await expect(page.getByText(`Sweep paused — ${count} swept.`)).toBeVisible()
    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(sweep).toBeVisible()
    await expect(sweep.getByText(count, { exact: true })).toBeVisible()
    page.on('dialog', (d) => void d.accept()) // ~100 bins swept: Cancel confirms
    await sweep.getByRole('button', { name: 'Cancel' }).click()
    await expect(sweep).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0)
  })

  test('a paused sweep is only discarded after asking: Tonight link, Edit, Edit horizon, Add site, another Sweep', async ({ page }) => {
    const state = seededState()
    state.sites.push({ ...state.sites[0], id: 'cabin', name: 'Cabin', isDefault: false })
    await seedStorage(page, state)
    await stubSensors(page, { testNow: TEST_NOW })
    const answer = { value: false }
    const msgs: string[] = []
    page.on('dialog', (d) => { msgs.push(d.message()); void (answer.value ? d.accept() : d.dismiss()) })
    await startSweep(page)
    await aim(page, headings(1, 100).map((h) => [h, 5] as [number, number]))
    const count = (await page.getByRole('dialog', { name: 'Horizon sweep' }).getByText(/^\d+\/360$/).textContent())!

    // iOS swipe-back lands on Tonight, whose "no horizon" banner links to the editor.
    await page.evaluate(() => { location.hash = '#tonight' })
    await page.getByRole('link', { name: 'Set the horizon' }).click()
    const paused = page.getByText(`Sweep paused — ${count} swept.`)
    await expect(paused).toBeVisible()
    await expect(page.getByRole('region', { name: /^Horizon for/ })).toHaveCount(0)

    const london = page.getByRole('listitem').filter({ has: page.getByText('London', { exact: true }) })
    const cabin = page.getByRole('listitem').filter({ hasText: 'Cabin' })
    await london.getByRole('button', { name: 'Edit', exact: true }).click()
    await london.getByRole('button', { name: 'Edit horizon' }).click()
    await page.getByRole('button', { name: 'Add site' }).click()
    await cabin.getByRole('button', { name: 'Sweep horizon' }).click()
    await expect(paused).toBeVisible()
    await expect(page.getByRole('region', { name: /^Horizon for/ })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /site$/i })).toHaveCount(0)
    expect(msgs).toEqual(new Array(5).fill('Discard the sweep in progress?'))

    // Same site's Sweep horizon keeps the paused sweep without asking.
    await london.getByRole('button', { name: 'Sweep horizon' }).click()
    await expect(paused).toBeVisible()
    expect(msgs).toHaveLength(5)

    answer.value = true
    await cabin.getByRole('button', { name: 'Sweep horizon' }).click()
    await expect(paused).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Sweep horizon for Cabin' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  })

  test('a hidden page or an ended camera track pauses the sweep; Resume keeps progress', async ({ page }) => {
    await seedStorage(page)
    await stubSensors(page, { testNow: TEST_NOW })
    await startSweep(page)
    await aim(page, headings(1, 50).map((h) => [h, 5] as [number, number]))
    const sweep = page.getByRole('dialog', { name: 'Horizon sweep' })
    const count = (await sweep.getByText(/^\d+\/360$/).textContent())!

    await setHidden(page, true)
    await expect(sweep).toHaveCount(0)
    await expect.poll(() => trackStates(page)).toEqual(['ended'])
    await aim(page, headings(50, 150).map((h) => [h, 5] as [number, number])) // ignored while paused
    await setHidden(page, false)
    await expect(page.getByText(`Sweep paused — ${count} swept.`)).toBeVisible()

    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(sweep.getByText(count, { exact: true })).toBeVisible()
    await endCamera(page)
    await expect(sweep).toHaveCount(0)
    await expect(page.getByText(`Sweep paused — ${count} swept.`)).toBeVisible()
    await expect.poll(() => trackStates(page)).toEqual(['ended', 'ended'])
  })

  test('Pause shows the paused card and releases the camera; Resume continues sampling', async ({ page }) => {
    await seedStorage(page)
    await stubSensors(page, { testNow: TEST_NOW })
    await startSweep(page)
    await aim(page, headings(1, 50).map((h) => [h, 5] as [number, number]))
    const sweep = page.getByRole('dialog', { name: 'Horizon sweep' })
    const count = (await sweep.getByText(/^\d+\/360$/).textContent())!

    await sweep.getByRole('button', { name: 'Pause' }).click()
    await expect(sweep).toHaveCount(0)
    await expect(page.getByText(`Sweep paused — ${count} swept.`)).toBeVisible()
    await expect.poll(() => trackStates(page)).toEqual(['ended'])

    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(sweep.getByText(count, { exact: true })).toBeVisible()
    // Sampling continues after Resume (the orientation listener starts once the camera is up).
    await expect(async () => {
      await aim(page, headings(50, 100).map((h) => [h, 5] as [number, number]))
      await expect(sweep.getByText(count, { exact: true })).toHaveCount(0, { timeout: 200 })
    }).toPass()
    const after = Number((await sweep.getByText(/^\d+\/360$/).textContent())!.split('/')[0])
    expect(after).toBeGreaterThan(Number(count.split('/')[0]) + 30)
  })

  test('Done and Cancel release the camera', async ({ page }) => {
    page.on('dialog', (d) => void d.accept())
    await seedStorage(page)
    await stubSensors(page, { testNow: TEST_NOW })
    const stash = () => page.evaluate(() => {
      (window as unknown as { __video: HTMLVideoElement }).__video = document.querySelector('.overlay video')!
    })
    const released = async () => {
      expect((await trackStates(page)).every((s) => s === 'ended')).toBe(true)
      expect(await page.evaluate(() => (window as unknown as { __video: HTMLVideoElement }).__video.srcObject)).toBeNull()
    }

    await startSweep(page)
    await stash()
    await aim(page, [...headings(1, 360), 0].map((h) => [h, 5] as [number, number]))
    await page.getByRole('dialog', { name: 'Horizon sweep' }).getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('region', { name: 'Horizon for London' })).toBeVisible()
    await released()

    await page.getByRole('region', { name: 'Horizon for London' }).getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Sweep horizon' }).click()
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    const sweep = page.getByRole('dialog', { name: 'Horizon sweep' })
    await expect(sweep).toBeVisible()
    await expect(async () => {
      await aim(page, [[0, 2]])
      await expect(sweep.getByText('—')).toHaveCount(0, { timeout: 200 })
    }).toPass()
    await stash()
    await aim(page, headings(1, 60).map((h) => [h, 5] as [number, number]))
    await sweep.getByRole('button', { name: 'Cancel' }).click()
    await expect(sweep).toHaveCount(0)
    expect(await trackStates(page)).toEqual(['ended', 'ended'])
    await released()
  })

  test.describe('North calibration', () => {
    const CAL_NOW = Date.UTC(2026, 11, 15, 20, 0, 0)
    const london = { lat: 51.5, lon: -0.13, elevation: 20 }
    const DECL = declination(london.lat, london.lon, 0.02, new Date(CAL_NOW))
    const wrap = (a: number) => ((a % 360) + 360) % 360
    const target = () => {
      const list = calibrationCandidates(london as never, new Date(CAL_NOW))
      return { list, pick: list[0] }
    }

    /** Sweeps the roof and opens the calibrate overlay from the editor banner. */
    async function openCalibrate(page: Page) {
      await seedStorage(page)
      await stubSensors(page, { testNow: CAL_NOW })
      await startSweep(page)
      await aim(page, [...headings(0, 360), 0].map((h) => [h, roof(h)] as [number, number]))
      await page.getByRole('dialog', { name: 'Horizon sweep' }).getByRole('button', { name: 'Done' }).click()
      const editor = page.getByRole('region', { name: 'Horizon for London' })
      await expect(editor.getByText(/^Save now — an unsaved sweep is lost/)).toBeVisible()
      await editor.getByRole('button', { name: 'Calibrate north' }).click()
      const cal = page.getByRole('dialog', { name: 'Calibrate north' })
      await expect(cal).toBeVisible()
      return { editor, cal }
    }

    async function pick(page: Page, cal: ReturnType<Page['getByRole']>, label: string, alt: number, heading: number) {
      await cal.getByRole('button', { name: new RegExp(`^${label} —`) }).click()
      await expect(cal.locator('video')).toBeVisible()
      await expect(async () => {
        await aim(page, [[wrap(heading), alt]])
        await expect(cal.getByText(/^Target is /)).toBeVisible({ timeout: 200 })
      }).toPass()
    }

    test('lists never the Sun; Lock + Apply rotates the horizon +10° and clears the badge', async ({ page }) => {
      const { list, pick: t } = target()
      expect(list.length).toBeGreaterThan(0)
      expect(t.alt).toBeGreaterThan(5)
      const { editor, cal } = await openCalibrate(page)
      await expect(cal.getByText(/Sun/)).toHaveCount(0)
      await expect(cal.getByRole('button', { name: new RegExp(`^${t.label} — (low|mid-height|high) in the (N|NE|E|SE|S|SW|W|NW)$`) })).toBeVisible()

      const before100 = Number(await slider(page, 100).getAttribute('aria-valuenow'))
      const before160 = Number(await slider(page, 160).getAttribute('aria-valuenow'))
      expect(Math.abs(before100 - 30)).toBeLessThanOrEqual(1)
      expect(Math.abs(before160 - 2)).toBeLessThanOrEqual(1)

      const reading = t.az - 10 - DECL // compass heading 10° west of truth
      await pick(page, cal, t.label, t.alt, reading)
      await expect(cal.getByText(/^Target is 10° right, 0° (up|down)$/)).toBeVisible()
      await cal.getByRole('button', { name: 'Lock' }).click()
      await aim(page, Array.from({ length: 15 }, () => [wrap(reading), t.alt] as [number, number]))
      await expect(cal.getByText('North corrected by +10.0°; altitude reads 0.0° high')).toBeVisible()
      await cal.getByRole('button', { name: 'Apply' }).click()

      await expect(cal).toHaveCount(0)
      expect((await trackStates(page)).every((s) => s === 'ended')).toBe(true)
      await expect(editor.getByText('Uncalibrated — calibrate north for accuracy')).toHaveCount(0)
      await expect(editor.getByText('Unsaved changes')).toBeVisible()
      expect(Math.abs(Number(await slider(page, 100).getAttribute('aria-valuenow')) - 2)).toBeLessThanOrEqual(1)
      expect(Math.abs(Number(await slider(page, 160).getAttribute('aria-valuenow')) - 30)).toBeLessThanOrEqual(1)

      await editor.getByRole('button', { name: 'Save horizon' }).click()
      const h = (await stored(page)).sites[0].horizon
      expect(h.calibration.target).toBe(t.label)
      expect(h.calibration.residualAltDeg).toBeCloseTo(0, 1)
      expect(h.northOffsetDeg).toBeCloseTo(10, 1)
      expect(h.source).toBe('sweep')
    })

    test('calibrating again with the same readings changes nothing (+0.0°)', async ({ page }) => {
      const { pick: t } = target()
      const { editor, cal } = await openCalibrate(page)
      const reading = t.az - 10 - DECL
      const run = async () => {
        await pick(page, cal, t.label, t.alt, reading)
        await cal.getByRole('button', { name: 'Lock' }).click()
        await aim(page, Array.from({ length: 15 }, () => [wrap(reading), t.alt] as [number, number]))
      }
      await run()
      await expect(cal.getByText('North corrected by +10.0°; altitude reads 0.0° high')).toBeVisible()
      await cal.getByRole('button', { name: 'Apply' }).click()
      const at = async (az: number) => Number(await slider(page, az).getAttribute('aria-valuenow'))
      expect([await at(100), await at(160)].map(Math.round)).toEqual([2, 30])

      await editor.getByRole('button', { name: 'Calibrate north' }).click()
      await run()
      await expect(cal.getByText('North corrected by +0.0°; altitude reads 0.0° high')).toBeVisible()
      await cal.getByRole('button', { name: 'Apply' }).click()
      expect([await at(100), await at(160)].map(Math.round)).toEqual([2, 30])
      await editor.getByRole('button', { name: 'Save horizon' }).click()
      expect((await stored(page)).sites[0].horizon.northOffsetDeg).toBeCloseTo(10, 6)
    })

    test('imported and manual horizons offer no Calibrate button', async ({ page }) => {
      for (const source of ['import', 'manual']) {
        const s = seededState()
        const altitudes = Array.from({ length: 360 }, (_, i) => (i >= 90 && i < 150 ? 30 : 2))
        ;(s.sites[0] as { horizon: unknown }).horizon = {
          altitudes, seasonal: new Array(360).fill(false), leafOffAltitudes: altitudes.slice(),
          northOffsetDeg: 0, createdAt: '2026-11-01T00:00:00.000Z', source, calibration: null,
        }
        const p = await page.context().newPage()
        await seedStorage(p, s)
        await stubSensors(p, { testNow: CAL_NOW })
        await p.goto('/#sites')
        await p.getByRole('button', { name: 'Edit horizon' }).click()
        const editor = p.getByRole('region', { name: 'Horizon for London' })
        await expect(editor).toBeVisible()
        await expect(editor.getByRole('button', { name: /Calibrate/ })).toHaveCount(0)
        await p.close()
      }
    })

    test('with no Moon visible by day the list says nothing is up, and Close leaves', async ({ page }) => {
      // First hour of 2026 where nothing qualifies (Moon down or near the Sun, and no dark sky).
      let t = Date.UTC(2026, 5, 1, 9)
      while (calibrationCandidates(london as never, new Date(t)).length > 0) t += 3600e3
      const st = seededState()
      const altitudes = Array.from({ length: 360 }, (_, i) => (i >= 90 && i < 150 ? 30 : 2))
      ;(st.sites[0] as { horizon: unknown }).horizon = {
        altitudes, seasonal: new Array(360).fill(false), leafOffAltitudes: altitudes.slice(),
        northOffsetDeg: 0, createdAt: '2026-11-01T00:00:00.000Z', source: 'sweep', calibration: null, sweptHere: true,
      }
      await seedStorage(page, st)
      await stubSensors(page, { testNow: t })
      await page.goto('/#sites')
      await page.getByRole('button', { name: 'Edit horizon' }).click()
      await page.getByRole('region', { name: 'Horizon for London' }).getByRole('button', { name: 'Calibrate north' }).click()
      const cal = page.getByRole('dialog', { name: 'Calibrate north' })
      await expect(cal.getByText('Nothing bright enough is up right now — try after dark.')).toBeVisible()
      await expect(cal.getByRole('button', { name: /—/ })).toHaveCount(0)
      await cal.getByRole('button', { name: 'Close' }).click()
      await expect(cal).toHaveCount(0)
    })

    test('unsteady readings disable Apply and ask to try again; too few readings ask to hold steady', async ({ page }) => {
      const { pick: t } = target()
      const { cal } = await openCalibrate(page)
      const reading = t.az - 10 - DECL
      await pick(page, cal, t.label, t.alt, reading)

      await cal.getByRole('button', { name: 'Lock' }).click()
      await aim(page, [[wrap(reading), t.alt], [wrap(reading), t.alt]])
      await expect(cal.getByText('Hold steady on the target and try again.')).toBeVisible()

      await cal.getByRole('button', { name: 'Lock' }).click()
      await aim(page, Array.from({ length: 16 }, (_, i) => [wrap(reading + (i % 2 ? 6 : -6)), t.alt] as [number, number]))
      await expect(cal.getByText(/^Readings were unsteady \(±\d+(\.\d)?°\) — try again$/)).toBeVisible()
      await expect(cal.getByRole('button', { name: 'Apply' })).toBeDisabled()
      await cal.getByRole('button', { name: 'Try again' }).click()
      await expect(cal.getByRole('button', { name: 'Lock' })).toBeVisible()
    })

    test('a big correction warns but still allows Apply', async ({ page }) => {
      const { pick: t } = target()
      const { cal } = await openCalibrate(page)
      const reading = t.az - 60 - DECL
      await pick(page, cal, t.label, t.alt, reading)
      await cal.getByRole('button', { name: 'Lock' }).click()
      await aim(page, Array.from({ length: 12 }, () => [wrap(reading), t.alt] as [number, number]))
      await expect(cal.getByText(`That's a big correction — check you aimed at ${t.label}`)).toBeVisible()
      await expect(cal.getByRole('button', { name: 'Apply' })).toBeEnabled()
    })

    test('a hidden page or an ended camera track pauses calibration and releases the camera', async ({ page }) => {
      const { pick: t } = target()
      const { cal } = await openCalibrate(page)
      await pick(page, cal, t.label, t.alt, t.az - DECL)
      await setHidden(page, true)
      await expect.poll(() => trackStates(page)).toEqual(['ended', 'ended'])
      await setHidden(page, false)
      await expect(cal.getByText('Paused — pick the object again to continue.')).toBeVisible()
      await pick(page, cal, t.label, t.alt, t.az - DECL)
      await endCamera(page)
      await expect(cal.getByText('Paused — pick the object again to continue.')).toBeVisible()
      await expect.poll(() => trackStates(page)).toEqual(['ended', 'ended', 'ended'])
    })

    test('leaving the tab pauses calibration and releases the camera; Close releases it too', async ({ page }) => {
      const { pick: t } = target()
      const { cal } = await openCalibrate(page)
      await pick(page, cal, t.label, t.alt, t.az - DECL)
      await page.evaluate(() => { location.hash = '#tonight' })
      await expect.poll(() => trackStates(page)).toEqual(['ended', 'ended'])
      await page.evaluate(() => { location.hash = '#sites' })
      await expect(cal.getByText('Paused — pick the object again to continue.')).toBeVisible()
      await pick(page, cal, t.label, t.alt, t.az - DECL)
      await cal.getByRole('button', { name: 'Back' }).click()
      await expect(trackStates(page)).resolves.toEqual(['ended', 'ended', 'ended'])
      await cal.getByRole('button', { name: 'Close' }).click()
      await expect(cal).toHaveCount(0)
      expect((await trackStates(page)).every((s) => s === 'ended')).toBe(true)
    })
  })
})
