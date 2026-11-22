import type { EmissionClass, Target } from '../types';

export interface Addendum {
  add: Target[];
  override: Record<string, Partial<Target>>;
  complexes: { target: Target; hides: string[] }[];
}

const EMISSION: Record<string, EmissionClass> = {
  HII: 'emission', EmN: 'emission', SNR: 'emission', PN: 'emission', 'Cl+N': 'emission',
  RfN: 'broadband', G: 'broadband', GPair: 'broadband', GTrpl: 'broadband', GGroup: 'broadband',
  OCl: 'broadband', GCl: 'broadband',
  Neb: 'mixed',
};

/** Parse semicolon-separated CSV with optional double-quoted fields (which may contain newlines). */
export function parseCsv(text: string, delimiter = ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function sexagesimal(s: string): number | null {
  const m = /^([+-])?(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(s.trim());
  if (!m) return null;
  const v = Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 3600;
  return m[1] === '-' ? -v : v;
}

const num = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const roundOrNull = (v: number | null, d: number) => (v === null ? null : round(v, d));

const size = (v: number | null) => (v === null ? null : round(v, v < 1 ? 2 : v < 10 ? 1 : 0));

/** "NGC0224" -> "NGC 224", "IC0001" -> "IC 1", "NGC0247C" -> "NGC 247C". */
function designation(id: string): string {
  const m = /^([A-Za-z]+)0*(\d.*)$/.exec(id);
  return m ? `${m[1]} ${m[2]}` : id;
}

export function buildCatalog(csv: string, addendum: Addendum): Target[] {
  const [header, ...rows] = parseCsv(csv);
  const col = (name: string) => header.indexOf(name);
  const idx = {
    name: col('Name'), type: col('Type'), ra: col('RA'), dec: col('Dec'), maj: col('MajAx'),
    min: col('MinAx'), pa: col('PosAng'), b: col('B-Mag'), v: col('V-Mag'), sb: col('SurfBr'),
    m: col('M'), common: col('Common names'),
  };
  for (const [k, v] of Object.entries(idx)) if (v < 0) throw new Error(`NGC.csv is missing column for "${k}"`);

  const byId = new Map<string, Target>();
  for (const r of rows) {
    const type = r[idx.type];
    const emission = EMISSION[type];
    if (!emission) continue;
    const ra = sexagesimal(r[idx.ra] ?? '');
    const dec = sexagesimal(r[idx.dec] ?? '');
    if (ra === null || dec === null) continue;
    const id = r[idx.name];
    const maj = num(r[idx.maj]);
    const min = num(r[idx.min]);
    const mag = num(r[idx.v]) ?? num(r[idx.b]);
    // OpenNGC SurfBr is already mag/arcsec² (e.g. M31 = 23.63), so it is used as-is.
    let surfBr = num(r[idx.sb]);
    if (surfBr === null && mag !== null && maj !== null && min !== null) {
      surfBr = mag + 2.5 * Math.log10((Math.PI / 4) * maj * min * 3600);
    }
    const names = [designation(id)];
    const mNum = num(r[idx.m]);
    if (mNum !== null) names.push(`M ${mNum}`);
    for (const n of (r[idx.common] ?? '').split(',')) if (n.trim()) names.push(n.trim());
    byId.set(id, {
      id, names, ra: round(ra * 15, 4), dec: round(dec, 4), type,
      majArcmin: size(maj), minArcmin: size(min), posAngle: num(r[idx.pa]),
      mag: roundOrNull(mag, 1), surfBr: roundOrNull(surfBr, 1), emission,
    });
  }

  for (const [id, patch] of Object.entries(addendum.override)) {
    const t = byId.get(id);
    if (!t) throw new Error(`Addendum override for unknown target ${id}`);
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'names') t.names = [...new Set([...t.names, ...(v as string[])])]; // extend, never replace
      else if (!k.startsWith('_')) (t as unknown as Record<string, unknown>)[k] = v;
    }
  }
  for (const c of addendum.complexes) {
    for (const h of c.hides) byId.delete(h);
    byId.set(c.target.id, c.target);
  }
  for (const t of addendum.add) byId.set(t.id, t);
  return [...byId.values()];
}
