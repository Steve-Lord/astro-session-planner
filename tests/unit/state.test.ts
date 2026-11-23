import { describe, it, expect } from 'vitest';
import { defaultState, loadState, saveState, exportState, importState } from '../../src/lib/store/state';
import { withMount } from '../../src/lib/gear/fit';
import { SEESTAR_S50_PRO } from '../../src/lib/gear/fit';
import { DEFAULT_SETTINGS } from '../../src/lib/sky/brightness';
import type { Site } from '../../src/lib/types';

class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

const site: Site = { id: 's1', name: 'Home', lat: 51.5, lon: -0.1, elevation: 10, timezone: 'Europe/London',
  sky: { bortle: 6 }, horizon: null, treesBare: false, isDefault: true };

describe('defaultState', () => {
  it('has Seestar, dual-band and default settings', () => {
    const s = defaultState();
    expect(s.version).toBe(1);
    expect(s.sites).toEqual([]);
    expect(s.gear).toEqual([SEESTAR_S50_PRO]);
    expect(s.selectedGearId).toBe(SEESTAR_S50_PRO.id);
    expect(s.selectedFilterId).toBe('dual-band');
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('load/save', () => {
  it('missing key gives defaults and no error', () => {
    const r = loadState(new MemStorage());
    expect(r.error).toBeNull();
    expect(r.state).toEqual(defaultState());
  });
  it('round-trips', () => {
    const st = new MemStorage();
    const s = { ...defaultState(), sites: [site], selectedSiteId: 's1', settings: { ...DEFAULT_SETTINGS, faintLimitMag: 6 } };
    saveState(st, s);
    const r = loadState(st);
    expect(r.error).toBeNull();
    expect(r.state).toEqual(s);
  });
  it('keeps an equatorial mount through save and load', () => {
    const st = new MemStorage();
    const d = defaultState();
    const s = { ...d, gear: [withMount(d.gear[0], 'eq'), ...d.gear.slice(1)] };
    saveState(st, s);
    const r = loadState(st);
    expect(r.error).toBeNull();
    expect(r.state.gear[0].mount).toBe('eq');
    expect(r.state.gear[0].maxAltDeg).toBe(90);
  });
  it('garbage gives defaults, error, and a corrupt backup', () => {
    const st = new MemStorage();
    st.setItem('asp:v1', 'not json{{');
    const r = loadState(st);
    expect(r.error).toMatch(/not valid JSON/);
    expect(r.state).toEqual(defaultState());
    expect(st.getItem('asp:v1:corrupt')).toBe('not json{{');
  });
  it('structurally invalid gives defaults and error', () => {
    const st = new MemStorage();
    st.setItem('asp:v1', JSON.stringify({ version: 1, sites: 'x' }));
    const r = loadState(st);
    expect(r.error).toMatch(/sites/);
    expect(st.getItem('asp:v1:corrupt')).toContain('"sites"');
  });
  it('does not throw if storage throws', () => {
    const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } } as unknown as Storage;
    expect(loadState(bad).error).toMatch(/denied/);
    expect(() => saveState(bad, defaultState())).not.toThrow();
  });
});

describe('importState', () => {
  it('rejects bad JSON', () => {
    expect(() => importState('nope')).toThrow('Backup file is not valid JSON');
  });
  it('rejects wrong version', () => {
    expect(() => importState('{"version":99}')).toThrow(/version/);
  });
  it('names the first problem', () => {
    const j = JSON.stringify({ ...defaultState(), sites: [{ ...site, lat: '51' }] });
    expect(() => importState(j)).toThrow('sites[0].lat must be a number');
  });
  it('re-adds built-in Seestar when gear is missing', () => {
    const j = JSON.stringify({ ...defaultState(), gear: [] });
    const s = importState(j);
    expect(s.gear.map((g) => g.id)).toContain(SEESTAR_S50_PRO.id);
  });
  it('fills missing settings from defaults', () => {
    const j = JSON.stringify({ ...defaultState(), settings: { faintLimitMag: 6 } });
    expect(importState(j).settings).toEqual({ ...DEFAULT_SETTINGS, faintLimitMag: 6 });
  });
  it('falls back for unresolved gear/filter selection', () => {
    const j = JSON.stringify({ ...defaultState(), selectedGearId: 'zzz', selectedFilterId: 'nope' });
    const s = importState(j);
    expect(s.selectedGearId).toBe(SEESTAR_S50_PRO.id);
    expect(s.selectedFilterId).toBe('dual-band');
  });
  it('export/import round-trips', () => {
    const s = { ...defaultState(), sites: [site], selectedSiteId: 's1' };
    expect(importState(exportState(s))).toEqual(s);
  });
});

describe('hardening', () => {
  it.each(['null', '42', '[]'])('rejects non-object %s', (j) => {
    expect(() => importState(j)).toThrow(/object/);
    const st = new MemStorage();
    st.setItem('asp:v1', j);
    const r = loadState(st);
    expect(r.error).not.toBeNull();
    expect(r.state).toEqual(defaultState());
  });
  it('rejects non-object settings', () => {
    expect(() => importState(JSON.stringify({ ...defaultState(), settings: 5 }))).toThrow('settings must be an object');
  });
  it('unresolved selectedSiteId falls back to the default site (M4)', () => {
    const other = { ...site, id: 's2', isDefault: false };
    const j = JSON.stringify({ ...defaultState(), sites: [other, site], selectedSiteId: 'ghost' });
    expect(importState(j).selectedSiteId).toBe('s1');
  });
  it('null selectedSiteId with sites falls back to the first site when none is default (M4)', () => {
    const a = { ...site, id: 'a', isDefault: false };
    const b = { ...site, id: 'b', isDefault: false };
    expect(importState(JSON.stringify({ ...defaultState(), sites: [a, b], selectedSiteId: null })).selectedSiteId).toBe('a');
  });
  it('selectedSiteId stays null with no sites', () => {
    expect(importState(JSON.stringify({ ...defaultState(), selectedSiteId: 'ghost' })).selectedSiteId).toBeNull();
  });
  it('wrong-typed settings fall back; unknown keys dropped; darkSunAlt validated', () => {
    const j = JSON.stringify({ ...defaultState(), settings: { faintLimitMag: 'x', darkSunAlt: -15, bogus: 1, clearanceDeg: 4 } });
    const s = importState(j).settings;
    expect(s).toEqual({ ...DEFAULT_SETTINGS, clearanceDeg: 4 });
    expect('bogus' in s).toBe(false);
  });
  it('filter falls back to first filter when gear lacks dual-band', () => {
    const g = { ...SEESTAR_S50_PRO, id: 'g2', filters: [{ id: 'f1', name: 'F', kind: 'none' as const }] };
    const j = JSON.stringify({ ...defaultState(), gear: [SEESTAR_S50_PRO, g], selectedGearId: 'g2', selectedFilterId: 'zz' });
    expect(importState(j).selectedFilterId).toBe('f1');
  });
  it('corrupt load leaves asp:v1 untouched', () => {
    const st = new MemStorage();
    st.setItem('asp:v1', 'garbage');
    loadState(st);
    expect(st.getItem('asp:v1')).toBe('garbage');
  });
});

describe('site normalisation on import', () => {
  const backup = (siteOverride: Record<string, unknown>, drop: string[] = []) => {
    const s: Record<string, unknown> = { ...site, ...siteOverride };
    for (const k of drop) delete s[k];
    return JSON.stringify({ ...defaultState(), sites: [s] });
  };
  const horizon = (over: Record<string, unknown> = {}) => ({
    altitudes: new Array(360).fill(0), seasonal: new Array(360).fill(false), leafOffAltitudes: new Array(360).fill(0),
    northOffsetDeg: 0, createdAt: 'x', source: 'manual', ...over,
  });

  it('defaults missing sky, treesBare, isDefault and elevation', () => {
    const out = importState(backup({}, ['sky', 'treesBare', 'isDefault', 'elevation'])).sites[0];
    expect(out.sky).toEqual({});
    expect(out.treesBare).toBe(false);
    expect(out.isDefault).toBe(false);
    expect(out.elevation).toBe(0);
  });
  it('rejects a non-object sky', () => {
    expect(() => importState(backup({ sky: 5 }))).toThrow('sites[0].sky must be an object');
  });
  it('treats undefined horizon as null and accepts a valid one', () => {
    expect(importState(backup({}, ['horizon'])).sites[0].horizon).toBeNull();
    expect(importState(backup({ horizon: horizon() })).sites[0].horizon?.altitudes).toHaveLength(360);
  });
  it('defaults a missing calibration to null and validates calibration and unswept', () => {
    expect(importState(backup({ horizon: horizon() })).sites[0].horizon?.calibration).toBeNull();
    const cal = { target: 'moon', at: '2026-11-22T20:00:00Z', residualAltDeg: 0.4 };
    expect(importState(backup({ horizon: horizon({ calibration: cal }) })).sites[0].horizon?.calibration).toEqual(cal);
    expect(() => importState(backup({ horizon: horizon({ calibration: { target: 'moon', at: 'x' } }) }))).toThrow('sites[0].horizon.calibration');
    expect(() => importState(backup({ horizon: horizon({ calibration: { ...cal, residualAltDeg: null } }) }))).toThrow('sites[0].horizon.calibration');
    const ok = new Array(360).fill(false);
    expect(importState(backup({ horizon: horizon({ unswept: ok }) })).sites[0].horizon?.unswept).toHaveLength(360);
    expect(() => importState(backup({ horizon: horizon({ unswept: [true] }) }))).toThrow('sites[0].horizon.unswept must have 360 entries');
    expect(() => importState(backup({ horizon: horizon({ unswept: new Array(360).fill(1) }) }))).toThrow('sites[0].horizon.unswept');
  });
  it('accepts and keeps sweptHere: true; rejects other values', () => {
    expect(importState(backup({ horizon: horizon({ sweptHere: true }) })).sites[0].horizon?.sweptHere).toBe(true);
    expect(importState(backup({ horizon: horizon() })).sites[0].horizon).not.toHaveProperty('sweptHere');
    expect(() => importState(backup({ horizon: horizon({ sweptHere: 'yes' }) }))).toThrow('sites[0].horizon.sweptHere must be true when present');
    expect(() => importState(backup({ horizon: horizon({ sweptHere: false }) }))).toThrow('sites[0].horizon.sweptHere');
    const st = new MemStorage();
    saveState(st, importState(backup({ horizon: horizon({ sweptHere: true }) })));
    expect(loadState(st).state.sites[0].horizon?.sweptHere).toBe(true);
  });
  it('rejects malformed horizons naming the field', () => {
    expect(() => importState(backup({ horizon: 3 }))).toThrow('sites[0].horizon must be null or an object');
    expect(() => importState(backup({ horizon: horizon({ altitudes: [1, 2] }) }))).toThrow('sites[0].horizon.altitudes must have 360 entries');
    expect(() => importState(backup({ horizon: horizon({ seasonal: new Array(360).fill(1) }) }))).toThrow('sites[0].horizon.seasonal');
    const bad = new Array(360).fill(0); bad[7] = 'x';
    expect(() => importState(backup({ horizon: horizon({ leafOffAltitudes: bad }) }))).toThrow('sites[0].horizon.leafOffAltitudes');
  });
});

describe('element-level validation (D1)', () => {
  const custom = { id: 'c1', names: ['My nebula'], ra: 10, dec: 20, type: 'EmN', majArcmin: 10, minArcmin: 5,
    posAngle: null, mag: 8, surfBr: null, emission: 'emission' };
  const imp = (patch: Record<string, unknown>) => importState(JSON.stringify({ ...defaultState(), ...patch }));
  const withTarget = (t: Record<string, unknown>) => imp({ customTargets: [{ ...custom, ...t }] });

  it('accepts a valid custom target', () => {
    expect(withTarget({}).customTargets[0]).toEqual(custom);
  });
  it.each([
    [{ names: 'x' }, 'customTargets[0].names'],
    [{ names: [] }, 'customTargets[0].names'],
    [{ names: [1] }, 'customTargets[0].names'],
    [{ ra: Infinity }, 'customTargets[0].ra'],
    [{ dec: null }, 'customTargets[0].dec'],
    [{ majArcmin: 'big' }, 'customTargets[0].majArcmin'],
    [{ minArcmin: 'NaN' }, 'customTargets[0].minArcmin'],
    [{ posAngle: '45' }, 'customTargets[0].posAngle'],
    [{ mag: {} }, 'customTargets[0].mag'],
    [{ surfBr: true }, 'customTargets[0].surfBr'],
    [{ emission: 'radio' }, 'customTargets[0].emission'],
    [{ type: 3 }, 'customTargets[0].type'],
  ])('rejects custom target %o naming %s', (patch, field) => {
    expect(() => withTarget(patch)).toThrow(field);
  });
  it('rejects an invalid site timezone naming the field', () => {
    expect(() => imp({ sites: [{ ...site, timezone: 'Mars/Olympus' }] })).toThrow('sites[0].timezone');
  });
  const gear = SEESTAR_S50_PRO;
  it.each(['focalLengthMm', 'sensorWmm', 'sensorHmm', 'pixelUm', 'minAltDeg', 'maxAltDeg'])(
    'rejects non-positive or non-finite gear.%s', (k) => {
      expect(() => imp({ gear: [{ ...gear, [k]: 0 }] })).toThrow(`gear[0].${k}`);
      expect(() => imp({ gear: [{ ...gear, [k]: 'x' }] })).toThrow(`gear[0].${k}`);
    });
  it('rejects malformed filters naming the field', () => {
    expect(() => imp({ gear: [{ ...gear, filters: [{ id: 'f', name: 'F', kind: 'uv' }] }] })).toThrow('gear[0].filters[0].kind');
    expect(() => imp({ gear: [{ ...gear, filters: [{ id: 1, name: 'F', kind: 'none' }] }] })).toThrow('gear[0].filters[0].id');
    expect(() => imp({ gear: [{ ...gear, filters: [null] }] })).toThrow('gear[0].filters[0]');
  });
});

describe('dismissed hints (I4)', () => {
  it('defaults to none and round-trips', () => {
    expect(defaultState().dismissed).toEqual([]);
    const s = { ...defaultState(), dismissed: ['ios-install'] };
    expect(importState(exportState(s)).dismissed).toEqual(['ios-install']);
  });
  it('drops a malformed dismissed list', () => {
    expect(importState(JSON.stringify({ ...defaultState(), dismissed: 'x' })).dismissed).toEqual([]);
    expect(importState(JSON.stringify({ ...defaultState(), dismissed: ['a', 2] })).dismissed).toEqual(['a']);
  });
});
