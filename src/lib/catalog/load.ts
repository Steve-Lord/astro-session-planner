import type { Target } from '../types';

export async function loadCatalog(url = './catalog.json'): Promise<Target[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Catalog fetch failed: ${url} returned HTTP ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error(`Catalog at ${url} is not an array`);
  data.forEach((t, i) => {
    const o = t as Record<string, unknown> | null;
    if (typeof o !== 'object' || o === null || typeof o.ra !== 'number' || typeof o.dec !== 'number') {
      throw new Error(`Catalog at ${url}: entry ${i} is not an object with numeric ra/dec`);
    }
  });
  return (data as Partial<Target>[]).map((t) => ({
    majArcmin: null, minArcmin: null, posAngle: null, mag: null, surfBr: null, ...t,
  })) as Target[];
}
