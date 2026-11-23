# Equatorial Mount Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Equatorial / Alt-az switch to each gear card. In equatorial mode the zenith cut-off goes, so targets passing overhead count for their whole time up.

**Architecture:** `Gear.mount` already exists. A pure helper `withMount` sets `mount` and the matching `maxAltDeg` (alt-az 80°, eq 90°). The visibility code already reads `gear.maxAltDeg`, so it needs no change. GearView gets a two-option switch that replaces the gear entry in `appState`, and auto-save persists it.

**Tech Stack:** Svelte 5 runes, TypeScript strict, Vitest, Playwright.

**Spec:** docs/superpowers/specs/2026-11-22-equatorial-mount-design.md (the short design, approved 2026-11-22). It amends §6/§7 of docs/superpowers/specs/2026-11-22-astro-session-planner-design.md, where the "≤ ~80° alt-az zenith limit, per gear" rule lives.

## Global Constraints

- Upper altitude limit: alt-az **80°**, equatorial **90°**. The minimum altitude (15°) does not change with the mount.
- The built-in Seestar ships as `mount: 'altaz'`. A stored choice survives reloads, and loading never resets it.
- The Gear page stays read-only apart from the mount switch.
- Mount mode changes nothing in the ranking except the altitude window. Horizon, contrast and fit are untouched.
- Svelte 5 runes, TS strict, dark theme tokens from `src/app.css`, 390 px phone layout, no horizontal scroll.
- No new network calls. Pushing redeploys the live site: the controller asks the owner before any push.

## Review Focus

1. A stored state from before this change (mount 'altaz', maxAltDeg 80) loads unchanged, and the user's later 'eq' choice survives reload. Pinned in Task 1 (state round-trip test).
2. Switching mount while Tonight is open re-ranks without a reload. Pinned in Task 2 (e2e checks the Tonight row changes after the switch).
3. Tapping the already-selected option is a no-op and does not reset other gear fields. Pinned in Task 1 (`withMount` keeps every other field) and Task 2 (`aria-pressed`).
4. The switch fits a 390 px card with no horizontal scroll. Pinned in Task 2 (e2e at 390 px width).
5. A target that transits above 80° gets one continuous window in eq mode instead of being split at the zenith. Pinned in Task 1 (visibility test).

---

### Task 1: `withMount` helper and visibility proof

**Files:**
- Modify: `src/lib/gear/fit.ts` (add the export next to `SEESTAR_S50_PRO`)
- Test: `tests/unit/fit.test.ts`, `tests/unit/visibility.test.ts`, `tests/unit/state.test.ts`

**Interfaces:**
- Produces: `export const MOUNT_MAX_ALT: Record<Gear['mount'], number> = { altaz: 80, eq: 90 }` and `export function withMount(g: Gear, mount: Gear['mount']): Gear`. The helper returns a new object with `mount` set and `maxAltDeg = MOUNT_MAX_ALT[mount]`. Every other field is unchanged and the input is not mutated.

- [ ] **Step 1: Write failing tests**
  - fit.test.ts `withMount sets mount and the zenith limit`:
    - `withMount(SEESTAR_S50_PRO, 'eq')` has `mount === 'eq'` and `maxAltDeg === 90`.
    - `withMount(that, 'altaz').maxAltDeg === 80`.
    - `SEESTAR_S50_PRO.mount` is still `'altaz'`, so the input was not mutated.
    - Every other field `toEqual`s the input's.
  - visibility.test.ts `eq mount keeps a near-zenith transit in one window`:
    - Use London, `buildContext(london, gear, settings, '2026-12-21')`, and target `tgt('zen', 90, 51.5)`, which transits at about 90° near local midnight.
    - With the alt-az gear, expect `windows.length` to be 2.
    - With `buildContext(london, withMount(gear, 'eq'), settings, '2026-12-21')`, expect `windows.length` to be 1 and `peakAlt` > 85.
  - state.test.ts `keeps an equatorial mount through save and load`: replace `gear[0]` in `defaultState()` with `withMount(…, 'eq')`, then `saveState` and `loadState`. Expect `gear[0].mount` to be `'eq'` and `maxAltDeg` to be 90.
- [ ] **Step 2:** Run `npx vitest run tests/unit/fit.test.ts tests/unit/visibility.test.ts tests/unit/state.test.ts`. Expected: FAIL, because `withMount` is not exported.
- [ ] **Step 3:** Implement `MOUNT_MAX_ALT` and `withMount` in `src/lib/gear/fit.ts`. If the state test fails on validation, fix `checkGear` in `src/lib/store/state.ts` so it accepts `'altaz' | 'eq'`.
- [ ] **Step 4:** Run `npm test` and `npm run check`. Expected: all pass, 0 errors.
- [ ] **Step 5:** Commit `feat: withMount helper — equatorial mode lifts the 80° zenith limit`.

### Task 2: Mount switch on the Gear page

**Files:**
- Modify: `src/ui/GearView.svelte`
- Test: `tests/e2e/gear.spec.ts` (new)

**Interfaces:**
- Consumes: `withMount`, `MOUNT_MAX_ALT` (Task 1). `appState.gear` from `src/lib/store/state.svelte` is persisted by the existing auto-save.

- [ ] **Step 1: Write failing e2e** `tests/e2e/gear.spec.ts` (use `seedStorage` from `./seed`):
  - Test `mount switch lifts the zenith limit and persists`:
    - Go to `/?date=2026-11-22`. Read the text of the Tonight row containing `NGC 7000`. It transits at about 83° from London, so alt-az splits its window.
    - Open the Gear tab. The Seestar card has a group labelled `Mount` with buttons `Alt-az` (`aria-pressed="true"`) and `Equatorial`. The card shows the note `Alt-az: tracking fails above 80° and the field rotates during long sessions.`
    - Click `Equatorial`. Expect `aria-pressed="true"` on it, Altitude limits `15°–90°`, and the note hidden.
    - Back on Tonight, without a reload, the `NGC 7000` row text differs from before.
    - Reload. Gear still shows `Equatorial` pressed.
  - Test `mount switch fits a phone card`:
    - At viewport 390×844, the Gear page has `document.documentElement.scrollWidth <= 390`.
    - Clicking the pressed `Alt-az` leaves limits at `15°–80°`.
- [ ] **Step 2:** Run `npm run e2e -- gear.spec.ts`. Expected: FAIL, because there is no Mount group.
- [ ] **Step 3:** In GearView, replace the Mount `<dd>` text with a segmented control: `role="group" aria-label="Mount"`, two `<button type="button" aria-pressed>`.
  - On click, set `appState.gear[i] = withMount(appState.gear[i], m)`.
  - Show the alt-az note as a dim line under the card only while the mount is `'altaz'`.
  - Change the footer to `Gear is read-only in this version, apart from the mount.`
  - Use existing theme tokens.
- [ ] **Step 4:** Run `npm test`, `npm run check` and `npm run e2e`. Expected: all pass.
- [ ] **Step 5:** README: add one sentence under Gear: "Set Mount to Equatorial when the Seestar is polar-aligned on a wedge; targets passing overhead then count all the way up." Commit `feat: equatorial/alt-az switch on the Gear page`.
