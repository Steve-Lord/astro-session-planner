import type { Page } from '@playwright/test'

/** A complete valid AppState (storage key 'asp:v1'): one flat London site (Bortle 6) and the Seestar S50 Pro with dual-band. */
export function seededState() {
  return {
    version: 1,
    sites: [
      {
        id: 'london', name: 'London', lat: 51.5, lon: -0.13, elevation: 20, timezone: 'Europe/London',
        sky: { bortle: 6 }, horizon: null, treesBare: false, isDefault: true,
      },
    ],
    gear: [
      {
        id: 'seestar-s50-pro', name: 'Seestar S50 Pro', focalLengthMm: 260, sensorWmm: 11.14, sensorHmm: 6.26,
        pixelUm: 2.9, mount: 'altaz', minAltDeg: 15, maxAltDeg: 80,
        filters: [
          { id: 'none', name: 'No filter', kind: 'none' },
          { id: 'dual-band', name: 'Dual-band (Hα/OIII)', kind: 'dual-band' },
        ],
        builtIn: true,
      },
    ],
    settings: {
      clearanceDeg: 2, darkSunAlt: -18, faintLimitMag: 4.0,
      dualBandGainMag: 2.5, narrowbandGainMag: 3.5, broadbandFilterPenaltyMag: 0.3, tooSmallFill: 0.05,
    },
    selectedSiteId: 'london',
    selectedGearId: 'seestar-s50-pro',
    selectedFilterId: 'dual-band',
    customTargets: [],
  }
}

export async function seedStorage(page: Page, state: unknown = seededState()): Promise<void> {
  await page.addInitScript((json) => localStorage.setItem('asp:v1', json), JSON.stringify(state))
}
