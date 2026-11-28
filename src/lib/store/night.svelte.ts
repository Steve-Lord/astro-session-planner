// The night being planned, shared by Tonight and Sky so both always show the same plan.
// The App calls startNight() once (an $effect.root, like startAutoSave); it returns a cleanup.
import { loadCatalog } from '../catalog/load';
import { planNightAsync } from '../plan/planAsync';
import { tonight } from '../astro/time';
import type { Gear, NightPlan, Site, Target } from '../types';
import { appState } from './state.svelte';
import { DATE_RE, initialDate } from './nightDate';

class Night {
  date = $state<string>('');
  /** M5: true once the date came from the address or the user; otherwise "tonight" follows the clock. */
  picked = $state(false);
  catalog = $state.raw<Target[] | null>(null);
  plan = $state.raw<NightPlan | null>(null);
  planning = $state(false);
  runError = $state<string | null>(null);
}

export const night: {
  date: string;
  picked: boolean;
  catalog: Target[] | null;
  plan: NightPlan | null;
  planning: boolean;
  runError: string | null;
} = new Night();

export function pickDate(d: string): void {
  night.date = d;
  night.picked = true;
}

const currentSite = (): Site | undefined => appState.sites.find((s) => s.id === appState.selectedSiteId);
const currentGear = (): Gear | undefined => appState.gear.find((g) => g.id === appState.selectedGearId);

let reqId = 0;

export function startNight(): () => void {
  return $effect.root(() => {
    loadCatalog('./catalog.json').then(
      (c) => (night.catalog = c),
      (e) => (night.runError = `Could not load the target catalog: ${(e as Error).message}`),
    );

    // Initial date: the detail-hash date, then ?date=, else tonight at the site.
    $effect(() => {
      const site = currentSite();
      if (night.date || !site) return;
      const d = initialDate(location.hash, location.search, site.timezone);
      night.picked = d.picked;
      night.date = d.date;
    });

    // M5: a PWA resumed the next day should plan the new "tonight" unless the user chose a date.
    $effect(() => {
      const onVisible = () => {
        const site = currentSite();
        if (document.visibilityState !== 'visible' || night.picked || !site) return;
        const t = tonight(site.timezone);
        if (t !== night.date) night.date = t;
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => document.removeEventListener('visibilitychange', onVisible);
    });

    $effect(() => {
      const site = currentSite();
      const gear = currentGear();
      const catalog = night.catalog;
      const date = night.date;
      if (!site || !gear || !catalog || !DATE_RE.test(date)) return;
      const input = {
        site: $state.snapshot(site) as Site,
        gear: $state.snapshot(gear) as Gear,
        filterId: appState.selectedFilterId,
        settings: $state.snapshot(appState.settings),
        date,
        catalog: [...catalog, ...($state.snapshot(appState.customTargets) as Target[])],
      };
      const id = ++reqId;
      night.planning = true;
      night.runError = null;
      planNightAsync(input).then(
        (p) => { if (id === reqId) { night.plan = p; night.planning = false; } },
        (e) => { if (id === reqId) { night.plan = null; night.planning = false; night.runError = `Planning failed: ${(e as Error).message}`; } },
      );
    });
  });
}
