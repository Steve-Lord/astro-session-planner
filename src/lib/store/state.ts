import type { EmissionClass, FilterKind, Gear, Settings, Site, Target } from '../types';
import { SEESTAR_S50_PRO } from '../gear/fit';
import { DEFAULT_SETTINGS } from '../sky/brightness';

export interface AppState {
  version: 1;
  sites: Site[];
  gear: Gear[];
  settings: Settings;
  selectedSiteId: string | null;
  selectedGearId: string;
  selectedFilterId: string;
  customTargets: Target[];
  /** Ids of one-time hints the user has dismissed (e.g. 'ios-install', 'backup-after-horizon'). */
  dismissed: string[];
}

export const STORAGE_KEY = 'asp:v1';
export const CORRUPT_KEY = 'asp:v1:corrupt';
const DEFAULT_FILTER_ID = 'dual-band';

export function defaultState(): AppState {
  return {
    version: 1,
    sites: [],
    gear: [structuredClone(SEESTAR_S50_PRO)],
    settings: { ...DEFAULT_SETTINGS },
    selectedSiteId: null,
    selectedGearId: SEESTAR_S50_PRO.id,
    selectedFilterId: DEFAULT_FILTER_ID,
    customTargets: [],
    dismissed: [],
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function mergeSettings(raw: Record<string, unknown>): Settings {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = raw[key];
    if (key === 'darkSunAlt') {
      if (v === -18 || v === -12) out[key] = v;
    } else if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
  }
  return out as unknown as Settings;
}

function checkHorizon(h: unknown, path: string): void {
  if (!isObj(h)) throw new Error(`${path} must be null or an object`);
  const arrays: [string, (v: unknown) => boolean][] = [
    ['altitudes', (v) => typeof v === 'number' && Number.isFinite(v)],
    ['seasonal', (v) => typeof v === 'boolean'],
    ['leafOffAltitudes', (v) => typeof v === 'number' && Number.isFinite(v)],
  ];
  for (const [k, ok] of arrays) {
    const a = h[k];
    if (!Array.isArray(a) || a.length !== 360) throw new Error(`${path}.${k} must have 360 entries`);
    if (!a.every(ok)) throw new Error(`${path}.${k} has invalid entries`);
  }
  if (h.calibration === undefined) h.calibration = null;
  else if (h.calibration !== null) {
    const c = h.calibration;
    if (!isObj(c) || typeof c.target !== 'string' || typeof c.at !== 'string' || typeof c.residualAltDeg !== 'number' || !Number.isFinite(c.residualAltDeg)) {
      throw new Error(`${path}.calibration must be null or { target, at, residualAltDeg }`);
    }
  }
  if (h.unswept !== undefined) {
    if (!Array.isArray(h.unswept) || h.unswept.length !== 360) throw new Error(`${path}.unswept must have 360 entries`);
    if (!h.unswept.every((v) => typeof v === 'boolean')) throw new Error(`${path}.unswept has invalid entries`);
  }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const EMISSIONS: EmissionClass[] = ['emission', 'broadband', 'mixed'];
const FILTER_KINDS: FilterKind[] = ['none', 'broadband-lp', 'dual-band', 'narrowband'];

function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function checkTarget(t: Record<string, unknown>, path: string): void {
  if (typeof t.id !== 'string') throw new Error(`${path}.id must be a string`);
  if (!Array.isArray(t.names) || t.names.length === 0 || !t.names.every((n) => typeof n === 'string')) {
    throw new Error(`${path}.names must be a non-empty list of strings`);
  }
  if (!finite(t.ra)) throw new Error(`${path}.ra must be a finite number`);
  if (!finite(t.dec)) throw new Error(`${path}.dec must be a finite number`);
  if (typeof t.type !== 'string') throw new Error(`${path}.type must be a string`);
  for (const k of ['majArcmin', 'minArcmin', 'posAngle', 'mag', 'surfBr']) {
    if (t[k] === undefined) t[k] = null;
    else if (t[k] !== null && !finite(t[k])) throw new Error(`${path}.${k} must be null or a finite number`);
  }
  if (!EMISSIONS.includes(t.emission as EmissionClass)) throw new Error(`${path}.emission must be one of ${EMISSIONS.join(', ')}`);
}

function checkGear(g: Record<string, unknown>, path: string): void {
  if (typeof g.id !== 'string') throw new Error(`${path}.id must be a string`);
  if (typeof g.name !== 'string') throw new Error(`${path}.name must be a string`);
  for (const k of ['focalLengthMm', 'sensorWmm', 'sensorHmm', 'pixelUm', 'minAltDeg', 'maxAltDeg']) {
    if (!finite(g[k]) || (g[k] as number) <= 0) throw new Error(`${path}.${k} must be a positive number`);
  }
  if (!Array.isArray(g.filters)) throw new Error(`${path}.filters must be an array`);
  g.filters.forEach((f: unknown, j: number) => {
    const fp = `${path}.filters[${j}]`;
    if (!isObj(f)) throw new Error(`${fp} must be an object`);
    if (typeof f.id !== 'string') throw new Error(`${fp}.id must be a string`);
    if (typeof f.name !== 'string') throw new Error(`${fp}.name must be a string`);
    if (!FILTER_KINDS.includes(f.kind as FilterKind)) throw new Error(`${fp}.kind must be one of ${FILTER_KINDS.join(', ')}`);
  });
}

/** Validate untrusted data and normalise it into an AppState; throws Error naming the first problem. */
function parseState(raw: unknown): AppState {
  if (!isObj(raw)) throw new Error('Backup data must be an object');
  if (raw.version !== 1) throw new Error(`Unsupported backup version: ${String(raw.version)} (expected 1)`);
  for (const k of ['sites', 'gear', 'customTargets'] as const) {
    if (!Array.isArray(raw[k])) throw new Error(`${k} must be an array`);
  }
  if (!isObj(raw.settings)) throw new Error('settings must be an object');

  const sites = raw.sites as unknown[];
  sites.forEach((s, i) => {
    if (!isObj(s)) throw new Error(`sites[${i}] must be an object`);
    if (typeof s.id !== 'string') throw new Error(`sites[${i}].id must be a string`);
    if (typeof s.name !== 'string') throw new Error(`sites[${i}].name must be a string`);
    if (typeof s.lat !== 'number' || !Number.isFinite(s.lat)) throw new Error(`sites[${i}].lat must be a number`);
    if (typeof s.lon !== 'number' || !Number.isFinite(s.lon)) throw new Error(`sites[${i}].lon must be a number`);
    if (typeof s.timezone !== 'string' || !validTimeZone(s.timezone)) {
      throw new Error(`sites[${i}].timezone must be a valid IANA time zone`);
    }
    if (s.sky === undefined) s.sky = {};
    else if (!isObj(s.sky)) throw new Error(`sites[${i}].sky must be an object`);
    if (typeof s.elevation !== 'number' || !Number.isFinite(s.elevation)) s.elevation = 0;
    if (typeof s.treesBare !== 'boolean') s.treesBare = false;
    if (typeof s.isDefault !== 'boolean') s.isDefault = false;
    if (s.horizon === undefined) s.horizon = null;
    else if (s.horizon !== null) checkHorizon(s.horizon, `sites[${i}].horizon`);
  });
  (raw.gear as unknown[]).forEach((g, i) => {
    if (!isObj(g)) throw new Error(`gear[${i}] must be an object`);
    checkGear(g, `gear[${i}]`);
  });
  (raw.customTargets as unknown[]).forEach((t, i) => {
    if (!isObj(t)) throw new Error(`customTargets[${i}] must be an object`);
    checkTarget(t, `customTargets[${i}]`);
  });

  const gear = raw.gear as Gear[];
  if (!gear.some((g) => g.id === SEESTAR_S50_PRO.id)) gear.unshift(structuredClone(SEESTAR_S50_PRO));

  const selGear = gear.find((g) => g.id === raw.selectedGearId) ?? gear.find((g) => g.id === SEESTAR_S50_PRO.id)!;
  const filterIds = selGear.filters.map((f) => f.id);
  const selFilter =
    typeof raw.selectedFilterId === 'string' && filterIds.includes(raw.selectedFilterId)
      ? raw.selectedFilterId
      : filterIds.includes(DEFAULT_FILTER_ID)
        ? DEFAULT_FILTER_ID
        : (filterIds[0] ?? DEFAULT_FILTER_ID);
  // M4: an unresolved selection falls back to the default site, else the first.
  const typedSites = sites as Site[];
  const selectedSiteId =
    typeof raw.selectedSiteId === 'string' && typedSites.some((s) => s.id === raw.selectedSiteId)
      ? raw.selectedSiteId
      : ((typedSites.find((s) => s.isDefault) ?? typedSites[0])?.id ?? null);
  const dismissed = Array.isArray(raw.dismissed) ? raw.dismissed.filter((d): d is string => typeof d === 'string') : [];

  return {
    version: 1,
    sites: sites as Site[],
    gear,
    settings: mergeSettings(raw.settings),
    selectedSiteId,
    selectedGearId: selGear.id,
    selectedFilterId: selFilter,
    customTargets: raw.customTargets as Target[],
    dismissed,
  };
}

export function importState(json: string): AppState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Backup file is not valid JSON');
  }
  return parseState(raw);
}

export function exportState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

/** Never throws: any failure yields defaults plus a message. Bad raw data is preserved under CORRUPT_KEY. */
export function loadState(storage: Storage): { state: AppState; error: string | null } {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (e) {
    return { state: defaultState(), error: `Could not read saved data: ${(e as Error).message}` };
  }
  if (raw === null) return { state: defaultState(), error: null };
  try {
    return { state: importState(raw), error: null };
  } catch (e) {
    try {
      storage.setItem(CORRUPT_KEY, raw);
    } catch {
      /* best effort */
    }
    return { state: defaultState(), error: `Saved data was invalid and has been reset: ${(e as Error).message}` };
  }
}

/** Never throws (quota / private mode); persistence is best effort. */
export function saveState(storage: Storage, state: AppState): void {
  try {
    storage.setItem(STORAGE_KEY, exportState(state));
  } catch {
    /* best effort */
  }
}
