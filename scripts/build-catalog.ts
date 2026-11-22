import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCatalog, type Addendum } from '../src/lib/catalog/build.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const csv = readFileSync(`${root}data/openngc/NGC.csv`, 'utf8');
const addendum = JSON.parse(readFileSync(`${root}data/addendum.json`, 'utf8')) as Addendum;
const out = `${root}public/catalog.json`;
const catalog = buildCatalog(csv, addendum);
// null-valued keys are omitted to keep the file small; loadCatalog restores them.
writeFileSync(out, JSON.stringify(catalog, (_k, v) => (v === null ? undefined : v)));
console.log(`catalog.json: ${catalog.length} targets, ${(statSync(out).size / 1024).toFixed(0)} KiB`);
