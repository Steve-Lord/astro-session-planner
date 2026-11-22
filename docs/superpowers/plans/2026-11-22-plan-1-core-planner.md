# Plan 1 — Core Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed, installable web app that shows a ranked, filter-aware shortlist of deep-sky targets for any night from a saved site with a hand-drawn horizon, using the Seestar S50 Pro profile.

**Architecture:** Static Svelte + TypeScript single-page app. Pure, unit-tested modules under `src/lib/` do all astronomy, horizon, fit, sky-brightness and ranking maths. The night plan runs in a Web Worker over a catalog JSON built at build time from OpenNGC plus a curated addendum. State lives in localStorage with JSON export/import.

**Tech Stack:** Vite, Svelte 5, TypeScript, astronomy-engine, date-fns-tz, vite-plugin-pwa, Vitest, Playwright, GitHub Actions → GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-22-astro-session-planner-design.md`

**Later plans (not in this one):** Plan 2 — phone sweep, north calibration, QR/link hand-off (spec §7.3, §7.9). Plan 3 — sky dome, target-detail altitude chart, FoV preview, weather (spec §7.7 detail/dome, §7.8).

## Global Constraints

- No backend; all computation in the browser. App must work offline after first load (PWA) — weather excepted (Plan 3).
- Personal data (site location, horizon) lives only in browser storage; never committed, never in URLs.
- Seestar S50 Pro built-in gear: focal 260 mm, sensor 11.14 × 6.26 mm, pixel 2.9 µm, alt-az, filters: `none`, `dual-band` → FoV ≈ 2.45° × 1.38° (147′ × 82.8′).
- Dark window = Sun < −18°; option for nautical (−12°).
- Usable sample: frame lower edge (centre alt − half frame diagonal) ≥ horizon + clearance (default 2°) across the frame's azimuth span; altitude ≥ min (default 15°) and ≤ max (default 80°); seasonal ranges blocked unless "trees bare".
- Windows: keep all usable runs ≥ 30 min; primary figure = total usable hours.
- "Tonight" and night boundaries are computed in the **site's IANA timezone**.
- Sampling interval 5 min.
- OpenNGC attribution (CC-BY-SA-4.0) shown in-app; catalog data file carries the licence.
- Svelte 5 runes syntax; TypeScript `strict: true`.
- Creating the GitHub repo and pushing are outward-facing: **ask the owner before doing either**.

## Review Focus

1. **Summer nights with no astronomical darkness** (owner is likely ~50–55°N): when the Sun never reaches −18°, the plan must fall back to −12° automatically and show a banner saying so — never an empty list with no explanation. Test in Task 7.
2. **Targets/frames straddling azimuth 0°/360° (due north):** horizon lookup and frame-span clearance must wrap. Test in Task 3.
3. **DST change nights** (e.g. Europe/London night of 2026-10-24→25): night boundaries and displayed times must be correct in local time. Test in Task 2.
4. **Corrupt/old localStorage or a bad import file:** the app loads with defaults (or keeps current state) and shows an error, never a blank page. Test in Task 9.
5. **Targets up all night / circumpolar:** a window that spans the whole dark period is reported with correct start/end, not dropped or split. Test in Task 7.

---

## File Structure

```
astro-session-planner/
  index.html  package.json  vite.config.ts  tsconfig.json  svelte.config.js  playwright.config.ts
  .github/workflows/deploy.yml
  data/openngc/NGC.csv  data/openngc/LICENSE  data/addendum.json
  scripts/build-catalog.ts          — OpenNGC + addendum → public/catalog.json
  public/catalog.json               — generated, committed
  src/
    main.ts  App.svelte
    lib/types.ts                    — shared data model (spec §7.2)
    lib/astro/time.ts               — site-timezone night bounds, dark window
    lib/astro/positions.ts          — precession to date, LST, fast alt-az, Sun/Moon
    lib/horizon/profile.ts          — profile lookup, frame clearance
    lib/gear/fit.ts                 — FoV, frame fit, mosaic panels
    lib/sky/brightness.ts           — Bortle→SQM, moonlit sky, filter effect
    lib/plan/visibility.ts          — samples → usable runs/windows
    lib/plan/faintness.ts           — contrast + too-faint verdict
    lib/plan/score.ts               — ranking score + breakdown
    lib/plan/night.ts               — planNight orchestrator
    lib/plan/worker.ts              — Web Worker wrapper
    lib/catalog/load.ts             — fetch + validate catalog.json
    lib/store/state.ts              — AppState, defaults, persistence, export/import
    ui/Tonight.svelte  ui/TargetRow.svelte  ui/HiddenList.svelte
    ui/Sites.svelte  ui/HorizonEditor.svelte  ui/GearView.svelte  ui/Settings.svelte
  tests/unit/*.test.ts  tests/e2e/*.spec.ts  tests/fixtures/
```

## Shared types (`src/lib/types.ts`, created in Task 2, used everywhere)

```ts
export type EmissionClass = 'emission' | 'broadband' | 'mixed';
export type FilterKind = 'none' | 'broadband-lp' | 'dual-band' | 'narrowband';
export interface HorizonProfile { altitudes: number[]; seasonal: boolean[]; leafOffAltitudes: number[];
  northOffsetDeg: number; createdAt: string; source: 'sweep' | 'manual' | 'import'; }   // arrays length 360, index = true azimuth°
export interface Site { id: string; name: string; lat: number; lon: number; elevation: number; timezone: string;
  sky: { bortle?: number; sqm?: number }; horizon: HorizonProfile | null; treesBare: boolean; isDefault: boolean; }
export interface Filter { id: string; name: string; kind: FilterKind; }
export interface Gear { id: string; name: string; focalLengthMm: number; sensorWmm: number; sensorHmm: number;
  pixelUm: number; mount: 'altaz' | 'eq'; minAltDeg: number; maxAltDeg: number; filters: Filter[]; builtIn: boolean; }
export interface Target { id: string; names: string[]; ra: number; dec: number;   // J2000 degrees
  type: string; majArcmin: number | null; minArcmin: number | null; posAngle: number | null;
  mag: number | null; surfBr: number | null;   // mag/arcsec²
  emission: EmissionClass; }
export interface Settings { clearanceDeg: number; darkSunAlt: -18 | -12; faintLimitMag: number;
  dualBandGainMag: number; narrowbandGainMag: number; broadbandFilterPenaltyMag: number; tooSmallFill: number; }
export interface TimeWindow { start: number; end: number; }   // epoch ms
export type FitLabel = 'too-small' | 'good' | 'tight' | 'mosaic' | 'size-unknown';
export interface Fit { label: FitLabel; fill: number | null; panels: [number, number] | null; }
export type HiddenReason = 'blocked' | 'too-small' | 'too-faint';
export interface ScoreBreakdown { hours: number; altitude: number; fit: number; contrast: number; moon: number; }
export interface PlanEntry { target: Target; windows: TimeWindow[]; totalHours: number; best: TimeWindow; peakAlt: number;
  fit: Fit; contrastMag: number; minMoonSepDeg: number | null; score: number; breakdown: ScoreBreakdown; }
export interface NightPlan { siteId: string; date: string; darkWindow: TimeWindow | null; darkSunAltUsed: -18 | -12;
  noAstroDark: boolean; moon: { illumination: number; rise: number | null; set: number | null };
  entries: PlanEntry[]; hidden: Record<HiddenReason, Target[]>; }
```

---

### Task 1: Project scaffold, test harness, PWA shell

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `svelte.config.js`, `playwright.config.ts`, `index.html`, `src/main.ts`, `src/App.svelte`, `.gitignore`, `README.md`
- Test: `tests/e2e/smoke.spec.ts`

**Interfaces:** Produces npm scripts used by every later task: `npm test` (Vitest, `tests/unit`), `npm run e2e` (Playwright against `vite preview`), `npm run build`, `npm run build:catalog`.

- [ ] **Step 1:** Scaffold with `npm create vite@latest . -- --template svelte-ts`; add deps `astronomy-engine date-fns-tz` and dev deps `vitest @playwright/test vite-plugin-pwa tsx`. Set `base: './'` in `vite.config.ts` (works under a GitHub Pages sub-path). Configure vite-plugin-pwa with `registerType: 'autoUpdate'`, precache `catalog.json`, manifest name "Astro Session Planner", `display: 'standalone'`.
- [ ] **Step 2: Write the failing e2e test** `smoke.spec.ts`: load `/`, expect heading text `Astro Session Planner` visible and a `link[rel=manifest]` present.
- [ ] **Step 3:** Run `npx playwright install chromium && npm run build && npm run e2e`. Expected: FAIL (heading missing).
- [ ] **Step 4:** Replace `App.svelte` with a minimal shell: `<h1>Astro Session Planner</h1>`.
- [ ] **Step 5:** Run `npm run build && npm run e2e`. Expected: PASS. Also `npm test` runs (0 tests, exit 0 via `--passWithNoTests`).
- [ ] **Step 6: Commit** — `git add -A && git commit -m "chore: scaffold Vite + Svelte + TS app with PWA and test harness"`

---

### Task 2: Shared types, site-timezone night bounds, positions

**Files:**
- Create: `src/lib/types.ts` (content above), `src/lib/astro/time.ts`, `src/lib/astro/positions.ts`
- Test: `tests/unit/time.test.ts`, `tests/unit/positions.test.ts`

**Interfaces:**
- Produces (`time.ts`):
  - `nightBounds(date: string /* YYYY-MM-DD local */, timezone: string): TimeWindow` — local 12:00 on `date` to local 12:00 next day, as epoch ms (use `date-fns-tz` `fromZonedTime`).
  - `darkWindow(site: Site, date: string, sunAlt: -18 | -12): TimeWindow | null` — Sun crossing below/above `sunAlt` within `nightBounds`; `null` if never below. Use astronomy-engine `SearchAltitude`.
  - `tonight(timezone: string, now?: Date): string` — local date; before local 12:00 counts as the previous date's night.
  - `formatLocal(t: number, timezone: string): string` — `HH:mm`.
- Produces (`positions.ts`):
  - `precessToDate(ra: number, dec: number, t: number): { ra: number; dec: number }` — J2000 → equator of date (astronomy-engine `Rotation_EQJ_EQD`).
  - `lstDeg(t: number, lon: number): number` — via `SiderealTime`.
  - `altAz(raDate: number, decDate: number, lat: number, lstDeg: number): { alt: number; az: number }` — plain spherical trig, az from north through east, 0–360, no refraction. This is the hot path: no allocations beyond the return object.
  - `sunAltAz(t, site)`, `moonAltAz(t, site)`: `{ alt; az }`; `moonRaDec(t): { ra; dec }`; `moonIllumination(t): number` (0–1); `moonRiseSet(site, window: TimeWindow): { rise: number | null; set: number | null }`.

- [ ] **Step 1: Write failing tests** in `time.test.ts`:
  - `darkWindow` for London (51.5, −0.13, `Europe/London`) on `2026-12-21`: start within ±10 min of 18:00 local, end within ±10 min of 06:10 local.
  - same site `2026-06-21` at −18 → `null`; at −12 → non-null.
  - DST: `nightBounds('2026-10-24','Europe/London')` spans 25 h (end − start = 90 000 000 ms); `formatLocal` of start = `12:00`, of end = `12:00`.
  - `tonight('Europe/London', new Date('2026-11-23T09:00:00Z'))` → `'2026-11-22'`; at `'2026-11-23T13:00:00Z'` → `'2026-11-23'`.
- [ ] **Step 2: Write failing tests** in `positions.test.ts`:
  - Polaris (J2000 ra 37.954, dec 89.264) from lat 52: `alt` within 1.0° of 52 at any t; `az` within 1.5° of 0 or 360.
  - `altAz` vs astronomy-engine `Horizon()` (no refraction) for M31 at 10 random times over 2026, London: |Δalt| < 0.05°, |Δaz| < 0.1° (when alt > 5°).
  - `moonIllumination` at full Moon 2026-11-24T14:53Z > 0.99 (check date against astronomy-engine `SearchMoonPhase` in test instead of hard-coding if it differs).
- [ ] **Step 3:** Run `npm test`. Expected: FAIL (modules missing).
- [ ] **Step 4:** Implement `types.ts`, `time.ts`, `positions.ts` per the signatures above.
- [ ] **Step 5:** Run `npm test`. Expected: PASS.
- [ ] **Step 6: Commit** — `feat: site-timezone night bounds and fast alt-az positions`

---

### Task 3: Horizon profile and frame clearance

**Files:**
- Create: `src/lib/horizon/profile.ts`
- Test: `tests/unit/profile.test.ts`

**Interfaces:**
- Consumes: `HorizonProfile`, `Site` from `types.ts`.
- Produces:
  - `flatProfile(): HorizonProfile` — all zeros, `source: 'manual'`.
  - `heightAt(p: HorizonProfile | null, az: number, treesBare: boolean): number` — linear interpolation between integer azimuths with wrap (359→0); uses `leafOffAltitudes[i]` instead of `altitudes[i]` where `seasonal[i] && treesBare`; `null` profile → 0.
  - `frameClears(p, treesBare, alt: number, az: number, halfDiagDeg: number, clearanceDeg: number): boolean` — azimuth half-span = `halfDiagDeg / max(cos(alt), 0.1)`; checks every integer azimuth in `[az − span, az + span]` (wrapping) that `alt − halfDiagDeg ≥ heightAt + clearanceDeg`.
  - `setRange(p, fromAz: number, toAz: number, alt: number): HorizonProfile` — immutable update with wrap (used by the editor).

- [ ] **Step 1: Write failing tests**:
  - `heightAt` interpolation: alts[10]=20, alts[11]=30 → `heightAt(p,10.5,false)` = 25.
  - Wrap: alts[359]=40, alts[0]=20 → `heightAt(p,359.5,false)` = 30; `setRange(p,350,10,25)` sets indices 350–359 and 0–10.
  - Seasonal: index 90 alt 35, seasonal true, leafOff 10 → `heightAt(p,90,false)`=35, `heightAt(p,90,true)`=10.
  - `frameClears`: wall of 30° at az 355–5 only; target at az 2, alt 33.3, halfDiag 1.4, clearance 2 → false (33.3−1.4 = 31.9 < 32); alt 33.5 at az 20 → true; alt 34 at az 359 → true (32.6 ≥ 32).
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat: horizon profile lookup and frame clearance with azimuth wrap`

---

### Task 4: Gear field of view and frame fit

**Files:**
- Create: `src/lib/gear/fit.ts`
- Test: `tests/unit/fit.test.ts`

**Interfaces:**
- Produces:
  - `SEESTAR_S50_PRO: Gear` — id `seestar-s50-pro`, values from Global Constraints, `minAltDeg: 15`, `maxAltDeg: 80`, filters `[{id:'none',name:'No filter',kind:'none'},{id:'dual-band',name:'Dual-band (Hα/OIII)',kind:'dual-band'}]`, `builtIn: true`.
  - `fovArcmin(g: Gear): { long: number; short: number; halfDiagDeg: number }` — `2·atan(size/2f)`.
  - `frameFit(t: Target, g: Gear, tooSmallFill: number): Fit` — fill = maj/long. `size-unknown` if `majArcmin` null. `too-small` if fill < `tooSmallFill`. `mosaic` if maj > long or (min ?? maj) > short; panels = `[ceil(maj/(0.85·long)), ceil(min/(0.85·short))]`. `tight` if fill > 0.8. Else `good`.

- [ ] **Step 1: Write failing tests**: S50 Pro `long` ≈ 147.3 ±0.5, `short` ≈ 82.8 ±0.5, `halfDiagDeg` ≈ 1.40 ±0.02. NGC 7000 (120×100) → `mosaic`, panels `[1,2]`. M31 (190×60) → `mosaic` `[2,1]`. M33 (70.8×41.7) → `good`, fill ≈ 0.48. NGC 7662 (0.5×0.5), tooSmallFill 0.05 → `too-small`. null size → `size-unknown`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** Implement. **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat: Seestar S50 Pro profile, FoV and frame fit with mosaic panels`

---

### Task 5: Sky brightness and filter effect

**Files:**
- Create: `src/lib/sky/brightness.ts`
- Test: `tests/unit/brightness.test.ts`

**Interfaces:**
- Produces:
  - `BORTLE_SQM = [21.9, 21.6, 21.4, 20.8, 20.1, 19.3, 18.6, 18.0, 17.5]` (index = class − 1).
  - `baselineSqm(sky: Site['sky']): number` — `sqm` if set, else Bortle table, else 19.3 (Bortle 6).
  - `moonlitSqm(baseSqm, moonAlt, moonIllum, targetAlt, sepDeg): number` — Krisciunas & Schaefer (1991): moon brightness in nanoLamberts from phase angle (from illumination), scattering function of `sepDeg`, extinction k = 0.172 with airmass `X(z) = (1 − 0.96 sin²z)^−0.5`; convert to mag/arcsec² with `(20.7233 − ln(B/34.08)) / 0.92104` and add fluxes with the baseline. Moon alt ≤ 0 → `baseSqm`.
  - `effectiveSky(sqm: number, emission: EmissionClass, filter: FilterKind, s: Settings): number` — emission: + `dualBandGainMag` (dual-band) or + `narrowbandGainMag` (narrowband); mixed: half the gain; broadband with a narrow filter: − `broadbandFilterPenaltyMag`; `none` → unchanged. (Larger = darker.)
  - `DEFAULT_SETTINGS: Settings = { clearanceDeg: 2, darkSunAlt: -18, faintLimitMag: 5.0, dualBandGainMag: 2.5, narrowbandGainMag: 3.5, broadbandFilterPenaltyMag: 0.3, tooSmallFill: 0.05 }` — exported from here.

- [ ] **Step 1: Write failing tests**: `baselineSqm({bortle:6})` = 19.3; `{sqm:20.5}` → 20.5; `{}` → 19.3. Moon below horizon → unchanged. Full Moon (illum 1, alt 45), target alt 45, sep 30, base 19.3 → result between 17.0 and 18.3. Same at sep 120 → brighter than base by less than at sep 30. Illum 0.08 → within 0.3 of base. `effectiveSky(18,'emission','dual-band',DEFAULT_SETTINGS)` = 20.5; broadband + dual-band = 17.7; any + `none` = 18.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat: sky brightness model with moonlight and filter gain`

---

### Task 6: Catalog build and loader

**Files:**
- Create: `data/openngc/NGC.csv` + `data/openngc/LICENSE` (vendored from github.com/mattiaverga/OpenNGC, `database_files/NGC.csv`; record the commit hash in `data/openngc/SOURCE.md`), `data/addendum.json`, `scripts/build-catalog.ts`, `src/lib/catalog/load.ts`, `public/catalog.json` (generated)
- Test: `tests/unit/catalog.test.ts`, `tests/fixtures/ngc-sample.csv`

**Interfaces:**
- Produces:
  - `buildCatalog(csv: string, addendum: Addendum): Target[]` (exported from the script module for testing). Semicolon CSV; RA/Dec sexagesimal → degrees. Include types `G GPair GTrpl GGroup OCl GCl Cl+N PN HII EmN RfN SNR Neb`; exclude `* ** *Ass Dup NonEx Nova Other`. Emission class: `HII EmN SNR PN Cl+N` → emission; `RfN G GPair GTrpl GGroup OCl GCl` → broadband; `Neb` → mixed. `surfBr`: OpenNGC `SurfBr` (mag/arcmin²) + 8.89; if absent and mag + size known, estimate `mag + 2.5·log10(π/4 · maj · min · 3600)`; else null. `mag` = V-Mag ?? B-Mag. `names`: designation, Messier (`M 31`), common names. `id` = OpenNGC name (`NGC0224`).
  - Addendum format: `{ "add": Target[], "override": { [id: string]: Partial<Target> }, "complexes": { target: Target, hides: string[] }[] }` — complexes add one combined target and drop the parts in `hides` from the catalog.
  - Addendum must include at least: Veil Complex (hides NGC6960, NGC6992, NGC6995, NGC6979, IC1340), Sh2-101, Sh2-129, Sh2-155, Sh2-171, Sh2-240, Sh2-308, and `surfBr` overrides for NGC7000, IC1805, IC1848, NGC281, IC1396, NGC2237, IC5070 so the §7.10 regression cases behave. Values from published catalog sizes; builder's call within those.
  - `loadCatalog(url = './catalog.json'): Promise<Target[]>` — throws a descriptive error if the JSON isn't an array of objects with numeric `ra`/`dec`.
- [ ] **Step 1: Write failing tests** against a 6-row fixture (`NGC0224` galaxy with M=31, a `*` row, a `Dup` row, a `HII` row without SurfBr, `NGC6960`, `NGC6992`) + a fixture addendum: excludes `*`/`Dup`; M31 has `names` containing `M 31` and `Andromeda Galaxy`, `emission: 'broadband'`, ra ≈ 10.68, dec ≈ 41.27; HII row gets estimated `surfBr`; complex hides both Veil parts and adds one target.
- [ ] **Step 2:** FAIL. **Step 3:** Implement; add `"build:catalog": "tsx scripts/build-catalog.ts"` writing `public/catalog.json` (minified). **Step 4:** PASS; run `npm run build:catalog` and check the output has > 9 000 entries and is < 2 MB.
- [ ] **Step 5: Commit** — `feat: OpenNGC + curated addendum catalog build and loader`

---

### Task 7: Visibility sampling and windows

**Files:**
- Create: `src/lib/plan/visibility.ts`
- Test: `tests/unit/visibility.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `NightContext` = `{ site; gear; settings; dark: TimeWindow; times: number[]; lst: number[]; sun: number[]; moon: { alt: number; az: number; ra: number; dec: number; illum: number }[] }` built by `buildContext(site, gear, settings, date): { ctx: NightContext | null; darkSunAltUsed: -18|-12; noAstroDark: boolean }` — samples every 5 min across the dark window; if `darkWindow(−18)` is null and `settings.darkSunAlt === -18`, use −12 and set `noAstroDark: true`; if still null, `ctx` is null.
  - `visibility(t: Target, ctx: NightContext): { windows: TimeWindow[]; totalHours: number; best: TimeWindow | null; peakAlt: number; alts: Float32Array; usable: Uint8Array }` — per sample: precess once per target (at mid-night), `altAz`, usable per Global Constraints via `frameClears` with `fovArcmin(gear).halfDiagDeg`. Runs < 30 min dropped. `best` = longest run.
  - `neverRises(t: Target, lat: number, minAlt: number): boolean` — `90 − |lat − dec| < minAlt`, used to skip early.

- [ ] **Step 1: Write failing tests** (London, flat horizon unless stated, S50 Pro, defaults):
  - `2026-06-21` → `noAstroDark: true`, `darkSunAltUsed: -12`, `ctx` non-null.
  - Circumpolar: constructed target ra 0, dec 72 (stays between ~34° and ~69° from London, inside 15–80°) on `2026-12-21` → exactly one window whose start = dark start and end = dark end (±5 min).
  - Split: compute M42's azimuth at 23:00 local on `2026-12-21` with `altAz`; set a 60° horizon over that azimuth ±5° only → `windows.length === 2` and `totalHours` = sum of both durations.
  - `neverRises` for dec −60 at lat 51.5 → true.
  - Performance: full `public/catalog.json` for one night completes in < 2000 ms in Node.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat: night sampling with usable windows and twilight fallback`

---

### Task 8: Faintness, score, planNight, and the regression set

**Files:**
- Create: `src/lib/plan/faintness.ts`, `src/lib/plan/score.ts`, `src/lib/plan/night.ts`, `src/lib/plan/worker.ts`
- Test: `tests/unit/faintness.test.ts`, `tests/unit/score.test.ts`, `tests/unit/regression.test.ts`

**Interfaces:**
- Produces:
  - `contrastMag(t: Target, effSky: number): number | null` — `t.surfBr − effSky` (null if no surfBr; null contrast is never "too faint").
  - `isTooFaint(contrast: number | null, s: Settings): boolean` — `contrast !== null && contrast > s.faintLimitMag`.
  - `scoreEntry(e: Omit<PlanEntry,'score'|'breakdown'>, s: Settings): { score: number; breakdown: ScoreBreakdown }` — product of: hours `min(1, totalHours/4)`; altitude `max(0,(sin(peak) − sin(15°))/(1 − sin(15°)))`; fit good 1 / tight 0.9 / size-unknown 0.8 / mosaic `0.7/√(panels[0]·panels[1])`; contrast `clamp((s.faintLimitMag − contrast)/s.faintLimitMag, 0.1, 1)` (1 if null); moon `clamp((minMoonSep − 10)/50, 0.3, 1)` when Moon up during best window with illum > 0.3, else 1. Weights live in one exported `WEIGHTS` object.
  - `planNight(input: { site: Site; gear: Gear; filterId: string; settings: Settings; date: string; catalog: Target[] }): NightPlan` — skip `neverRises`; each hidden target gets the first reason that applies, in this order: `blocked` (no window), `too-small` (fit), `too-faint` (contrast evaluated at the best window's midpoint using `moonlitSqm` + `effectiveSky`); entries sorted by score desc.
  - `worker.ts`: `postMessage(input)` → replies `NightPlan`; plus `planNightAsync(input): Promise<NightPlan>` helper for the UI.
- [ ] **Step 1: Write failing faintness/score unit tests** using constructed inputs (no astronomy), per spec §7.10, Bortle 6 (19.3), defaults:
  - NGC 7000 (`surfBr` from addendum, emission), dual-band, half Moon sky 18.3 → not too faint.
  - M101 (surfBr 23.7, broadband), dual-band, sky 18.3 → too faint; no filter, new Moon sky 19.3 → not too faint.
  - IC 1805 and NGC 281, dual-band, sky 18.3 → not too faint.
  - NGC 2403 (surfBr ≈ 23.4), sky 17.6 (bright Moon), no filter → too faint.
  - Score is 0 when totalHours = 0; mosaic 2×2 scores lower than identical `good`.
- [ ] **Step 2: Write failing `regression.test.ts`**: `planNight` for London, Bortle 6, flat horizon, S50 Pro, dual-band, `2026-11-22`, real catalog → NGC 7000, NGC 281, IC 1805 in `entries`; NGC 7662 in `hidden['too-small']`; NGC 7000 entry `fit.label === 'mosaic'`. Second case: same site `2026-11-24` (full Moon), no filter → M33 in `hidden['too-faint']`. These pin the default calibration: if one fails, check the model and the addendum values before changing the assertion, and write the reason in the test.
- [ ] **Step 3:** `npm test` → FAIL. **Step 4:** Implement. **Step 5:** `npm test` → PASS.
- [ ] **Step 6: Commit** — `feat: faintness, ranking score and planNight with regression set`

---

### Task 9: App state, persistence, export/import

**Files:**
- Create: `src/lib/store/state.ts`
- Test: `tests/unit/state.test.ts`

**Interfaces:**
- Produces:
  - `AppState = { version: 1; sites: Site[]; gear: Gear[]; settings: Settings; selectedSiteId: string | null; selectedGearId: string; selectedFilterId: string; customTargets: Target[] }`.
  - `defaultState(): AppState` — no sites, gear `[SEESTAR_S50_PRO]`, filter `dual-band`, `DEFAULT_SETTINGS`.
  - `loadState(storage: Storage): { state: AppState; error: string | null }` — key `asp:v1`; on missing → defaults, null error; on unparseable/invalid → defaults + error message (original raw value copied to `asp:v1:corrupt` before overwriting).
  - `saveState(storage, state): void`.
  - `exportState(state): string` (pretty JSON) / `importState(json: string): AppState` — throws `Error` with a human message on invalid input; built-in gear always re-added if missing.
  - `appState` — a Svelte 5 `$state` store module wrapping the above with auto-save (in `state.svelte.ts` if runes need it; keep the pure functions in `state.ts`).
- [ ] **Step 1: Write failing tests** with an in-memory `Storage` fake: round-trip save/load; garbage string → defaults + error + `asp:v1:corrupt` holds the garbage; `importState('{"version":99}')` throws; import without gear → Seestar present.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat: persisted app state with safe load and JSON export/import`

---

### Task 10: Tonight screen

**Files:**
- Create: `src/ui/Tonight.svelte`, `src/ui/TargetRow.svelte`, `src/ui/HiddenList.svelte`; Modify: `src/App.svelte`
- Test: `tests/e2e/tonight.spec.ts`

**Interfaces:** Consumes `appState`, `loadCatalog`, `planNightAsync`, `tonight`, `formatLocal`.

Layout per spec §7.7 (Tonight sketch, minus the cloud strip — Plan 3). Header: site picker, gear + filter picker, ◀ date ▶ with date input; summary line `Dark HH:mm–HH:mm · Moon NN% rises/sets HH:mm`. Banner when `noAstroDark`: "No astronomical darkness tonight — using nautical twilight (Sun below −12°)." Rows: rank, primary name + common name, type/emission class, best window `HH:mm–HH:mm` and total hours, peak°, fit text (`fills 48%`, `MOSAIC 1×2`, `size unknown`), expandable "why" showing the five breakdown factors. Footer: hidden counts per reason, each expandable to the list. The catalog passed to `planNightAsync` is `loadCatalog()` concatenated with `appState.customTargets`. No site → prompt linking to Sites. Error from `loadState` shown as a dismissible banner.

- [ ] **Step 1: Write failing e2e tests**: seed localStorage with a London site (Bortle 6, flat) and Seestar dual-band; visit `/?date=2026-11-22` (support a `date` query param for testing and deep links); expect ≥ 10 rows, first row has a time range matching `/\d\d:\d\d–\d\d:\d\d/`, a row containing `NGC 7000` shows `MOSAIC`; clicking "too small" expands a list containing `NGC 7662`. Date `2026-06-21` shows the nautical banner. Corrupt localStorage → page renders the "no site" prompt and an error banner.
- [ ] **Step 2:** `npm run build && npm run e2e` → FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat: Tonight shortlist screen`

---

### Task 11: Sites, manual horizon editor, gear, settings

**Files:**
- Create: `src/ui/Sites.svelte`, `src/ui/HorizonEditor.svelte`, `src/ui/GearView.svelte`, `src/ui/Settings.svelte`; Modify: `src/App.svelte` (simple tab nav: Tonight · Sites · Gear · Settings)
- Test: `tests/e2e/sites.spec.ts`

**Interfaces:** Consumes `appState`, `flatProfile`, `setRange`, `baselineSqm`, `importState`/`exportState`.

- **Sites:** list/add/edit/delete; fields name, lat, lon (with "Use my location" via `navigator.geolocation`), elevation, timezone (`<select>` of `Intl.supportedValuesOf('timeZone')`, default device zone), Bortle (1–9) or SQM, link to `https://www.lightpollutionmap.info` (plain link, no coordinates in the URL), default-site toggle, "trees bare" toggle. Badge "no horizon set" when `horizon` null.
- **HorizonEditor:** SVG unrolled panorama, x = azimuth 0–360 (N E S W labels), y = altitude 0–90. Control points every 10°; drag vertically to set altitude (applies `setRange` over ±5°). Tool to mark a selected azimuth range seasonal and set its leaf-off altitude. "Reset flat". Saves to the site with `source: 'manual'`. Keyboard: arrow up/down adjusts the focused point by 1°.
- **GearView:** read-only Seestar card (FoV, filters). Adding custom gear is out of scope for v1 beyond the data model.
- **Settings:** number inputs for every `Settings` field with defaults shown and "reset defaults"; **Custom targets** list with add/delete (name, RA h:m:s, Dec d:m:s, major/minor arcmin, type → emission class; id `custom-<uuid>`); Export (download `astro-session-planner-backup.json`) and Import (file input → `importState`, error shown inline); OpenNGC attribution text and link.

- [ ] **Step 1: Write failing e2e tests**: create a site via the form → appears in Tonight's picker; in the editor focus the point at 180° and press ArrowUp 30× → localStorage profile `altitudes[180] === 30`; Tonight for that site then lists fewer entries than with a flat horizon; export then import of the downloaded file restores the site; importing a non-JSON file shows an error and leaves sites unchanged; adding a custom target (ra 0h, dec +72°, 10×10′) makes it appear in Tonight for `2026-12-21`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat: site management, manual horizon editor, gear and settings screens`

---

### Task 12: Deploy to GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`; Modify: `README.md`

- [ ] **Step 1:** Workflow on push to `main`: Node 22, `npm ci`, `npm test`, `npm run build`, `npx playwright install --with-deps chromium && npm run e2e`, then `actions/upload-pages-artifact` (dist) + `actions/deploy-pages`.
- [ ] **Step 2:** README: what it is, privacy note (data stays in browser), dev commands, OpenNGC attribution.
- [ ] **Step 3: Commit** — `ci: build, test and deploy to GitHub Pages`
- [ ] **Step 4: Ask the owner** to confirm creating public repo `astro-session-planner` on their GitHub account and pushing. On yes: `gh repo create astro-session-planner --public --source . --push`, enable Pages with source "GitHub Actions" (`gh api -X POST repos/{owner}/astro-session-planner/pages -f build_type=workflow`).
- [ ] **Step 5:** Verify the workflow run is green (`gh run watch`) and the Pages URL serves the app; open it on the iPhone (owner) and check "Add to Home Screen" works offline after one load.
