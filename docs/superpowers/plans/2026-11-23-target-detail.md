# Target Detail Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping a target on Tonight, or a name in a hidden list, opens a detail screen with:
- an altitude chart drawn against the owner's horizon;
- a Moon distance strip;
- a frame preview;
- either the score breakdown or, for a hidden target, the reason it was hidden.

**Architecture:**
- **Planner refactor.** The per-target body of `planNight` moves into an exported `evaluateTarget`, which returns either an entry or a hidden verdict with its cause. Tonight and the detail screen therefore share one code path. `explainTarget` reuses it for a single target.
- **Chart data.** A pure `nightSeries` samples the target, horizon, needed height and Moon from sunset to sunrise.
- **Frame preview data.** A pure `framePreview` computes the preview geometry.
- **The screen.** It renders inside `Tonight.svelte`, which stays mounted with its list hidden. The screen is addressed by `#target=<id>&date=YYYY-MM-DD`.

**Tech Stack:** Svelte 5 runes, TypeScript strict, astronomy-engine, Vitest, Playwright.

**Spec:** docs/superpowers/specs/2026-11-23-target-detail-design.md (approved 2026-11-23). It amends §7.7 "Target detail" of docs/superpowers/specs/2026-11-22-astro-session-planner-design.md.

## Global Constraints

- **No change to the ranking or hidden lists.** The existing `tests/unit/regression.test.ts`, `score.test.ts` and `visibility.test.ts` must pass unchanged.
- **Numbers match Tonight.** The detail's window, hours, peak and fit text match the Tonight row exactly.
- **Offline.** No new network calls.
- **Phone first.** A 390 px viewport with no horizontal scroll. Charts are SVG scaled to the card width.
- **Theme.** Use the theme tokens from `src/app.css`.
- **Usable stretches.** Only the planner's `windows` (runs of 30 min or more in the dark window) are highlighted. Twilight and short runs are never highlighted.
- **Horizon band.** The band is `heightAt` (leaf-off when `treesBare`). The needed-height line is the height the planner requires, so that `frameClears(...) === (alt >= needed)`.
- **Limit lines.** The minimum-altitude line is dashed at `gear.minAltDeg`. The mount-limit line is dashed at 80° and drawn only when `gear.mount === 'altaz'`.
- **Moon shading.** The "moonlight hurts" zone is a separation under `moonSepZeroDeg + moonSepSpanDeg` (60°) while illumination is over `moonIllumThreshold` (0.3). These are the existing constants in `src/lib/plan/score.ts`, not copies.
- **Detail address.** `#target=<encodeURIComponent(id)>&date=YYYY-MM-DD`. A cold load lands Tonight on that date, which counts as a picked date (`datePicked = true`).
- **Pushing redeploys the live site.** The controller asks the owner before any push.

## Review Focus

1. **Detail matches the list.** A target's detail summary must equal its Tonight row (window, hours, peak, fit), including with a custom target and with the equatorial mount. Pinned in Task 1 (`explainTarget` equals the `planNight` entry for every entry on the regression night) and Task 4 (e2e compares the row text with the detail text).
2. **Back keeps the list as it was.** Back, by button or browser, returns to the same scroll position without re-planning. A cold-loaded detail's Back must not leave the app. Pinned in Task 4 (e2e scroll check, `goBack`, cold load then Back).
3. **The needed-height line agrees with `frameClears`.** If the line sits above the target while the stretch is highlighted, or the other way round, the chart contradicts itself. Pinned in Task 2 (property test over a grid of alt/az against a real profile).
4. **Unusual targets don't break the screen.** No size, no minor axis, no position angle, a mosaic, and an unknown or deleted id must all render without errors. Pinned in Task 3 (`framePreview` cases) and Task 4 (unknown-id e2e).
5. **Nights without darkness.** On a no-dark night, or when the Sun never sets, the chart and reason must still render. Pinned in Task 1 (`no-dark` cause) and Task 2 (Oslo midsummer `nightSeries` falls back to `nightBounds`).

---

### Task 1: One evaluation path for Tonight and the detail

**Files:**
- Modify: `src/lib/types.ts` (add the types below)
- Modify: `src/lib/plan/night.ts` (extract `evaluateTarget`, add `explainTarget`)
- Test: `tests/unit/detail.test.ts` (new)

**Interfaces:**
- Produces, in types.ts:
  - `export type HiddenCause = 'no-dark' | 'never-rises' | 'never-clears' | 'short-gaps' | 'too-small' | 'too-faint'`
  - `export type TargetVerdict = { kind: 'entry'; entry: PlanEntry } | { kind: 'hidden'; reason: HiddenReason; cause: HiddenCause; fill: number | null; contrastMag: number | null }`
- Produces, in night.ts:
  - `export function evaluateTarget(t: Target, ctx: NightContext, env: { filterKind: FilterKind; baseSqm: number; mid: number }): TargetVerdict`
    - `planNight` calls it for every target and pushes the entry, or the target into `hidden[reason]`.
  - `export function explainTarget(input: Omit<PlanInput, 'catalog'>, target: Target): TargetVerdict`
    - A null context returns `{ kind:'hidden', reason:'blocked', cause:'no-dark', fill:null, contrastMag:null }`.
- How each cause is set:
  - `never-rises`: `neverRises` is true.
  - `short-gaps`: no `best` window, but some `usable[i] === 1`.
  - `never-clears`: no `best` window and no usable sample at all.
  - `too-small`: `fill` = `fit.fill`.
  - `too-faint`: `contrastMag` = the computed contrast.

- [ ] **Step 1: Write failing tests** in `tests/unit/detail.test.ts`. Reuse the London site and settings from `regression.test.ts`, or a shared helper if one exists.
  - `explainTarget matches planNight for every shown entry`. On 2026-11-22 dual-band with the full catalogue:
    - for each `e` of `plan.entries`, `explainTarget(input, e.target)` toEqual `{ kind: 'entry', entry: e }`;
    - for each target in each `plan.hidden[r]`, the verdict has `kind 'hidden'` and `reason r`.
  - `causes`:
    - NGC 104 gives `never-rises`.
    - NGC 7662 gives `too-small` with `fill` closeTo 0.28/147.3 (2 digits).
    - On a site whose horizon is flat at 89°, NGC 7000 gives `never-clears`.
    - Oslo (lat 60, lon 10.7, Europe/Oslo) on 2026-06-21 gives `no-dark`.
    - Find one `short-gaps` case by building a horizon with a 1-in-every-20° notch that lets NGC 7000 through for under 30 minutes. If none can be built cleanly, assert the cause logic on a hand-made `NightContext`.
    - The first target in `plan.hidden['too-faint']` gives `too-faint` with a finite `contrastMag`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/detail.test.ts`. Expected: FAIL, because `explainTarget` is not exported.
- [ ] **Step 3: Implement** by moving the loop body unchanged into `evaluateTarget`. The `Omit<PlanEntry,'score'|'breakdown'>` build plus `scoreEntry` moves with it.
- [ ] **Step 4:** Run `npm test` and `npm run check`. Expected: all pass. The regression, score and visibility tests are untouched.
- [ ] **Step 5:** Commit `refactor: evaluateTarget/explainTarget — one evaluation path with hidden causes`.

### Task 2: Night series for the chart

**Files:**
- Modify: `src/lib/astro/time.ts`. Widen `darkWindow`'s `sunAlt` parameter to `number`; existing callers are unchanged.
- Modify: `src/lib/horizon/profile.ts` (add `neededHeight`)
- Create: `src/lib/plan/series.ts`
- Test: `tests/unit/series.test.ts` (new), `tests/unit/profile.test.ts`

**Interfaces:**
- Produces:
  - `export function neededHeight(p: HorizonProfile | null, treesBare: boolean, alt: number, az: number, halfDiagDeg: number, clearanceDeg: number): number`
    - Returns the max of `heightAt` over the same azimuth span `frameClears` checks, plus `halfDiagDeg + clearanceDeg`.
  - `export interface NightSeries`:
    - `span: TimeWindow`
    - `twilight: { civil: TimeWindow | null; nautical: TimeWindow | null; astro: TimeWindow | null }`
    - `times: number[]`
    - `alt`, `az`, `horizon`, `needed`, `moonAlt`, `moonSep`: all `Float32Array`. `moonSep` is NaN while the Moon is below 0°.
    - `moonIllum: number`, `moonRise: number | null`, `moonSet: number | null`
  - `export function nightSeries(site: Site, gear: Gear, settings: Settings, date: string, target: Target): NightSeries`
    - `span` is `darkWindow(site, date, -0.833)`, falling back to `nightBounds(date, tz)` when the Sun never sets.
    - Steps are 5 min.
    - Altitude and azimuth come from `altAz` with `precessToDate` at mid-span, as `visibility` does.
    - The Moon comes from `moonAltAz` / `moonRaDec`. Separation uses the same great-circle formula as night.ts: export `sepDeg` from night.ts and reuse it.
    - Illumination is at mid-span. Rise and set come from `moonRiseSet(site, nightBounds(...))`.

- [ ] **Step 1: Write failing tests:**
  - profile.test.ts `neededHeight agrees with frameClears`. Use a profile with steps (0° for az 0–89, 35° for 90–269, 20° for 270–359), halfDiag 1.4 and clearance 2. For alt from 0 to 88 in steps of 0.5 and az from 0 to 359 in steps of 7, expect `frameClears(...) === (alt >= neededHeight(...))`.
  - series.test.ts:
    - `span runs sunset to sunrise`: London on 2026-11-22. `span.start` is within 2 min of local sunset (16:00–16:10 Europe/London), and `span.end` is within the morning 07:30–08:00. `twilight.astro` equals `darkWindow(site, date, -18)`.
    - `target samples agree with visibility`: for NGC 7000, at every time common with `buildContext` sampling, `alt` is within 1e-6 of `visibility(...).alts`.
    - `horizon and needed`: with the stepped profile, `horizon[i] === heightAt(...)`, and `needed[i] >= horizon[i] + 2`.
    - `moonSep is NaN exactly while the Moon is down`.
    - `no sunset`: Oslo-like lat 70 on 2026-06-21 gives `span` equal to `nightBounds` and `twilight.astro === null`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/series.test.ts tests/unit/profile.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` and `npm run check`. Expected: pass.
- [ ] **Step 5:** Commit `feat: nightSeries and neededHeight for the target chart`.

### Task 3: Frame preview geometry

**Files:**
- Create: `src/lib/gear/preview.ts`
- Test: `tests/unit/preview.test.ts` (new)

**Interfaces:**
- Produces:
  - `export interface FramePreview`:
    - `frameW: number; frameH: number` are arcminutes, landscape (`fovArcmin(g).long × short`).
    - `cols: number; rows: number` are 1×1 unless the fit is a mosaic.
    - `gridW: number; gridH: number` are arcminutes: `cols * 0.85 * frameW + 0.15 * frameW`, and the same for rows and frameH.
    - `ellipse: { rx: number; ry: number; rotateDeg: number } | null`
    - `orientationKnown: boolean`
  - `export function framePreview(t: Target, g: Gear, fit: Fit): FramePreview`
- Ellipse rules:
  - `rx = maj / 2` and `ry = (min ?? maj) / 2`.
  - The frame is drawn north up and east left, so `rotateDeg = ((90 - posAngle) % 180 + 180) % 180`.
  - With no `posAngle`, `rotateDeg` is 0 (major axis along the long side) and `orientationKnown` is false.
  - With no `majArcmin`, `ellipse` is null.
  - `cols` and `rows` come from `fit.panels` as [long-axis count, short-axis count].

- [ ] **Step 1: Write failing tests:**
  - S50 frame: `frameW` closeTo 147.3 (1 digit) and `frameH` closeTo 82.8 (1 digit).
  - M31 (NGC0224 values: maj 178, min 70, PA 35) with `frameFit` mosaic:
    - cols and rows equal `fit.panels`;
    - `gridW` is at least 178;
    - `rotateDeg` is 55;
    - `orientationKnown` is true.
  - NGC 7000 (maj 120, min 100, PA null): `rotateDeg` is 0, `orientationKnown` is false, `ry` is 50.
  - NGC 104 (maj 32, no min): `rx` equals `ry`, both 16.
  - A size-unknown target gives `ellipse` null with cols and rows 1.
  - PA 90 gives 0. PA 0 gives 90. PA 170 gives 100.
- [ ] **Step 2:** Run `npx vitest run tests/unit/preview.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Use `PANEL_OVERLAP_FACTOR`: export it from fit.ts rather than copying 0.85.
- [ ] **Step 4:** Run `npm test` and `npm run check`. Expected: pass.
- [ ] **Step 5:** Commit `feat: framePreview geometry`.

### Task 4: Detail screen and navigation

**Files:**
- Create: `src/lib/detailHash.ts`, `src/ui/TargetDetail.svelte`
- Modify: `src/App.svelte` (`fromHash` maps `#target=…` to the Tonight tab), `src/ui/Tonight.svelte`, `src/ui/TargetRow.svelte`, `src/ui/HiddenList.svelte`
- Test: `tests/unit/detailHash.test.ts`, `tests/e2e/detail.spec.ts` (new), `tests/e2e/tonight.spec.ts` (the "why" assertions move to detail.spec)

**Interfaces:**
- Consumes: `explainTarget`, `TargetVerdict`, `HiddenCause` (Task 1).
- Produces:
  - `export function detailHash(id: string, date: string): string`
  - `export function parseDetailHash(hash: string): { id: string; date: string | null } | null`
    - It requires `date` to match `YYYY-MM-DD`; anything else becomes null.
  - `TargetDetail.svelte` props: `{ target: Target | null; input: Omit<PlanInput,'catalog'>; onback: () => void }`
    - `target === null` means the id is unknown.
    - Task 5 adds charts inside it, between the header and the breakdown, in a `<div class="charts">`.
- Behaviour:
  - **Rows:**
    - Each Tonight row's title and meta become one `<a href={detailHash(id, date)}>`.
    - The "why" button and its factor list are removed from TargetRow.
    - Each hidden-list `<li>` contains an `<a>` the same way. HiddenList gets a `date` prop.
  - **Tonight:**
    - It parses the hash on mount and on `hashchange`.
    - When a detail opens, it records `window.scrollY`, sets the list wrapper `hidden`, scrolls to the top and renders TargetDetail.
    - On close, it unhides the list and restores the scroll after `tick()`.
    - A cold-load hash date sets `date` and `datePicked = true`.
    - The target is looked up in `catalog` plus `appState.customTargets` by id. While the catalogue is loading, it shows "Loading…".
  - **Back** (`‹ Tonight`): call `history.back()` if the detail was opened by an in-app hashchange, else `location.hash = '#tonight'`.
  - **Header:** name, common name, type and emission class.
    - For an entry, the summary uses the same strings as TargetRow: extract the window, hours, peak and fit formatting into a shared helper, `src/ui/format.ts`, used by both.
    - For a hidden verdict, the reason uses this exact copy:
      - `no-dark`: `Hidden: no usable darkness this night`
      - `never-rises`: `Hidden: never rises above ${gear.minAltDeg}° from here`
      - `never-clears`: `Hidden: never clears your horizon while it's dark`
      - `short-gaps`: `Hidden: only clear for gaps under 30 minutes`
      - `too-small`: `Hidden: too small — fills ${Math.round(fill*100)}% of the frame`
      - `too-faint`: `Hidden: too faint — ${contrastMag.toFixed(1)} mag fainter than the sky`
  - **Breakdown** (entries only): `<dl class="factors">` with the five labelled factors, exactly as TargetRow shows them today.
  - **Unknown id:** `This target isn't in the catalogue any more.` plus Back.

- [ ] **Step 1: Write failing tests.**
  - detailHash.test.ts:
    - `parseDetailHash(detailHash('custom:a b', '2026-11-22'))` round-trips the id and date.
    - `#target=NGC7000` gives date null.
    - `#target=NGC7000&date=bad` gives date null.
    - `#tonight` gives null.
  - detail.spec.ts (seeded London, `/?date=2026-11-22`):
    1. `row opens detail with matching summary`:
       - Capture the NGC 7000 row's `.meta` text, then click its link.
       - The heading contains `NGC 7000`, and the detail summary contains the same window `HH:mm–HH:mm`, hours, `peak NN°` and `MOSAIC`.
       - There are 5 `dd` in `.factors`.
       - No `why` button exists anywhere on Tonight.
    2. `back keeps scroll and does not re-plan`:
       - Scroll so that row 20 is in view and record `scrollY`.
       - Open row 20, click `‹ Tonight`, and expect `scrollY` within 5 px of the recorded value.
       - Expect no `Planning…` status appeared. Watch with `page.locator('text=Planning…')` count 0 right after Back.
       - Open again and use `page.goBack()`; the list is visible.
    3. `hidden targets explain themselves`:
       - Open the `Too small` list and click `NGC 7662`. Expect `Hidden: too small — fills 0% of the frame`, then Back.
       - Cold load `/#target=NGC0104&date=2026-11-22` and expect `Hidden: never rises above 15° from here`.
       - Click `‹ Tonight`: Tonight shows date `2026-11-22` in the date input, and the page URL is still the app.
    4. `unknown id`: cold load `/#target=nope&date=2026-11-22` and expect `This target isn't in the catalogue any more.`
    5. `phone width`: at 390×844 on the NGC 7000 detail, `document.documentElement.scrollWidth <= 390`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/detailHash.test.ts` and `npm run e2e -- detail.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement as described above. Update tonight.spec.ts so it no longer clicks `why`; the `Too small` assertion stays.
- [ ] **Step 4:** Run `npm test`, `npm run check` and `npm run e2e`. Expected: all pass.
- [ ] **Step 5:** Commit `feat: target detail screen — open from Tonight and hidden lists`.

### Task 5: Altitude chart, Moon strip and frame preview on the detail

**Files:**
- Create: `src/ui/AltitudeChart.svelte`, `src/ui/MoonStrip.svelte`, `src/ui/FramePreview.svelte`
- Modify: `src/ui/TargetDetail.svelte` (render the three inside `.charts`)
- Modify: README (one paragraph under Tonight: tap a target for its chart, Moon distance and framing)
- Test: `tests/e2e/detail.spec.ts` (add tests)

**Interfaces:**
- Consumes: `nightSeries`, `NightSeries` (Task 2); `framePreview` (Task 3); `TargetVerdict` (Task 1). For an entry, the windows come from `verdict.entry.windows` and the best window from `entry.best`. Hidden targets have no highlighted windows.
- AltitudeChart:
  - Props: `{ series: NightSeries; windows: TimeWindow[]; best: TimeWindow | null; gear: Gear; dark: TimeWindow | null; timezone: string; hasHorizon: boolean }`.
  - The `<svg role="img" aria-label="Altitude through the night">` contains, at minimum:
    - `path.target`, `path.horizon` (filled from 0), `path.needed`;
    - one `rect.usable` per window, with `rect.usable.best` on the best window;
    - `line.min-alt`, and `line.mount-limit` only for alt-az;
    - `path.moon` while the Moon is up;
    - twilight rects `rect.twilight-civil` / `-nautical` / `-astro` and `rect.dark`;
    - hour ticks in the site time zone.
  - A legend line names the target, the horizon, the "needed height" line, the usable stretch and the Moon.
  - With `hasHorizon` false, a note says `No horizon saved for this site`.
  - Tap or drag shows a readout: time, target alt/az, horizon height and Moon distance. How it looks is the builder's call.
  - Use `viewBox` scaling. Text must stay at least 11 px when rendered at 358 px width.
- MoonStrip:
  - Props: `{ series: NightSeries; timezone: string }`, on the same time axis as the chart.
  - Draws `path.moon-sep` only where `moonSep` is finite.
  - `rect.moon-hurts` is drawn below 60° (the constants from score.ts) when `moonIllum > 0.3`.
  - Summary text:
    - `Moon ${pct}% lit · closest ${deg}° at HH:mm · rises HH:mm` / `sets HH:mm`. Include whichever of rise and set exist, joined with `, `.
    - When the Moon is never up during the span, `Moon down all night`.
- FramePreview:
  - Props: `{ preview: FramePreview; fitText: string }`.
  - Draws `rect.panel` cols×rows with 15% overlap, and `ellipse.object` centred on the grid.
  - Caption: `${fitText} · field ${Math.round(frameW)}′×${Math.round(frameH)}′`. When `orientationKnown` is false, append ` · orientation unknown`. With no ellipse, write `size unknown` instead of the fit text.

- [ ] **Step 1: Write failing e2e tests** in detail.spec.ts:
  - `NGC 7000 chart`:
    - The detail has an `svg[aria-label="Altitude through the night"]` with `path.target`, `path.horizon` and `path.needed`.
    - It has at least one `rect.usable` and exactly one `rect.usable.best`.
    - It has `line.min-alt` and `line.mount-limit`, since the seed is alt-az.
    - FramePreview has 4 `rect.panel` (MOSAIC 2×2) and 1 `ellipse.object`, and the caption contains `orientation unknown`.
  - `equatorial drops the mount line`:
    - Seed gear with `withMount(…, 'eq')` values (`mount: 'eq'`, `maxAltDeg: 90`).
    - Open NGC 7000 and expect 0 `line.mount-limit`.
  - `Moon strip`:
    - Use `/?date=2026-11-24`, near full Moon, on any top-row target.
    - The summary matches `/^Moon \d+% lit · closest \d+° at \d\d:\d\d/`, and there is at least one `rect.moon-hurts`.
  - `hidden target has a chart but no usable stretch`:
    - On the NGC 104 cold load, the chart is present with 0 `rect.usable`.
  - `phone width`: at 390×844 on the NGC 7000 detail with charts, `scrollWidth <= 390`.
- [ ] **Step 2:** Run `npm run e2e -- detail.spec.ts`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement the three components and wire them in. `nightSeries` and `framePreview` are computed with `$derived` from the detail's props.
- [ ] **Step 4:** Run `npm test`, `npm run check` and `npm run e2e`. Expected: all pass. Take a 390 px screenshot of the NGC 7000 detail into the workspace and look at it: labels must not overlap, and the lines must be distinguishable.
- [ ] **Step 5:** Commit `feat: altitude chart, Moon strip and frame preview on the target detail` (README included).
