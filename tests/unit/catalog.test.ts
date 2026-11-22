import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCatalog, type Addendum } from '../../src/lib/catalog/build';
import { loadCatalog } from '../../src/lib/catalog/load';
import type { Target } from '../../src/lib/types';

const csv = readFileSync(new URL('../fixtures/ngc-sample.csv', import.meta.url), 'utf8');
const veil: Target = { id: 'VeilComplex', names: ['Veil Complex'], ra: 312.75, dec: 30.7, type: 'SNR',
  majArcmin: 180, minArcmin: 180, posAngle: null, mag: null, surfBr: null, emission: 'emission' };
const addendum: Addendum = {
  add: [],
  override: {},
  complexes: [{ target: veil, hides: ['NGC6960', 'NGC6992'] }],
};
const none: Addendum = { add: [], override: {}, complexes: [] };

describe('buildCatalog', () => {
  it('excludes stars, double stars and duplicates', () => {
    const ids = buildCatalog(csv, none).map((t) => t.id);
    expect(ids).not.toContain('IC0071');
    expect(ids).not.toContain('IC0001');
    expect(ids).not.toContain('IC0011');
    expect(ids).toContain('NGC0224');
  });

  it('builds M31 with Messier and common names, degrees and broadband class', () => {
    const m31 = buildCatalog(csv, none).find((t) => t.id === 'NGC0224')!;
    expect(m31.names).toContain('M 31');
    expect(m31.names).toContain('Andromeda Galaxy');
    expect(m31.emission).toBe('broadband');
    expect(m31.ra).toBeCloseTo(10.68, 2);
    expect(m31.dec).toBeCloseTo(41.27, 2);
    expect(m31.surfBr).toBeCloseTo(23.63, 1);
  });

  it('estimates surface brightness for an HII row without SurfBr', () => {
    const t = buildCatalog(csv, none).find((x) => x.id === 'NGC7000')!;
    expect(t.emission).toBe('emission');
    expect(t.mag).toBe(4);
    expect(t.surfBr).toBeCloseTo(4 + 2.5 * Math.log10((Math.PI / 4) * 120 * 30 * 3600), 1);
  });

  it('does not estimate surface brightness where the magnitude is a star or cluster (C1)', () => {
    const extra = csv.trimEnd() + '\nIC5146;Cl+N;21:53:28.76;+47:16:00.9;Cyg;10.00;10.00;;7.82;7.20;;;;;;;;;;;;;;;;;;;;Cocoon Nebula;;;\n';
    const t = buildCatalog(extra, none).find((x) => x.id === 'IC5146')!;
    expect(t.mag).toBe(7.2);
    expect(t.surfBr).toBeNull();
  });

  it('strips _note keys from complexes and added targets', () => {
    const noted = { ...veil, _note: 'derivation' } as Target;
    const out = buildCatalog(csv, { add: [{ ...noted, id: 'X1' }], override: {}, complexes: [{ target: noted, hides: [] }] });
    for (const id of ['VeilComplex', 'X1']) expect(out.find((t) => t.id === id)).not.toHaveProperty('_note');
  });

  it('complexes hide their parts and add one combined target', () => {
    const out = buildCatalog(csv, addendum);
    const ids = out.map((t) => t.id);
    expect(ids).not.toContain('NGC6960');
    expect(ids).not.toContain('NGC6992');
    expect(ids.filter((i) => i === 'VeilComplex')).toHaveLength(1);
  });

  it('applies overrides and ignores underscore keys', () => {
    const out = buildCatalog(csv, { ...none, override: { NGC7000: { surfBr: 22.8, _note: 'x' } as Partial<Target> } });
    const t = out.find((x) => x.id === 'NGC7000')!;
    expect(t.surfBr).toBe(22.8);
    expect(t).not.toHaveProperty('_note');
  });

  it('extends names on override instead of replacing them', () => {
    const out = buildCatalog(csv, { ...none, override: { NGC7000: { names: ['Cygnus Wall'] } } });
    expect(out.find((x) => x.id === 'NGC7000')!.names).toEqual(['NGC 7000', 'North America Nebula', 'Cygnus Wall']);
  });
});

describe('coordinate conversion', () => {
  const byId = (id: string) => buildCatalog(csv, none).find((t) => t.id === id)!;
  it('keeps the sign of a negative declination with zero degrees', () => {
    expect(byId('IC9001').dec).toBeCloseTo(-0.5, 4);
  });
  it('converts RA near 24h', () => {
    expect(byId('IC9001').ra).toBeCloseTo(359.75, 4);
  });
  it('converts a southern declination and small RA', () => {
    expect(byId('IC9002').dec).toBeCloseTo(-(45 + 15 / 60 + 30 / 3600), 4);
    expect(byId('IC9002').ra).toBeCloseTo(30 / 3600 * 15, 4);
  });
});

describe('loadCatalog', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (body: unknown, ok = true) =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 404, json: async () => body })));

  it('returns the parsed array', async () => {
    stub([{ id: 'a', ra: 1, dec: 2 }]);
    const out = await loadCatalog('x.json');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'a', mag: null, surfBr: null, majArcmin: null });
  });
  it('throws descriptively on bad shape', async () => {
    stub({ nope: true });
    await expect(loadCatalog('x.json')).rejects.toThrow(/not an array/);
    stub([{ id: 'a', ra: '1', dec: 2 }]);
    await expect(loadCatalog('x.json')).rejects.toThrow(/entry 0.*numeric ra\/dec/);
    stub([], false);
    await expect(loadCatalog('x.json')).rejects.toThrow(/HTTP 404/);
  });
});
