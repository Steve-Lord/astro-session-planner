import { describe, it, expect } from 'vitest';
import { defaultState, loadState, saveState, exportState, importState } from '../../src/lib/store/state';
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
