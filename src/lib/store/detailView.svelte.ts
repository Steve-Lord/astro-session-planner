// What a target's detail screen needs, shared by the Tonight and Sky tabs.
import type { PlanInput } from '../plan/night'
import type { Gear, Site, Target } from '../types'
import { appState } from './state.svelte'
import { night } from './night.svelte'
import { DATE_RE } from './nightDate'

/** The target for a detail id: undefined while the catalogue loads, null when it is unknown. */
export function detailTarget(id: string | null): Target | null | undefined {
  if (id === null || !night.catalog) return undefined
  return night.catalog.find((t) => t.id === id) ?? appState.customTargets.find((t) => t.id === id) ?? null
}

/** The planning input for the selected site, gear, filter and night; null until all exist. */
export function detailInput(site: Site | undefined, gear: Gear | undefined): Omit<PlanInput, 'catalog'> | null {
  if (!site || !gear || !DATE_RE.test(night.date)) return null
  return {
    site: $state.snapshot(site) as Site,
    gear: $state.snapshot(gear) as Gear,
    filterId: appState.selectedFilterId,
    settings: $state.snapshot(appState.settings),
    date: night.date,
  }
}
