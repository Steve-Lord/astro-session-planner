# Plan 2 — Phone Horizon Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner measure a site's real 360° obstruction profile by sweeping an iPhone camera along the skyline, correct the compass against the Moon/a planet/a bright star, review it in the existing editor, and hand it to the laptop with a link or QR code.

**Architecture:** Pure, unit-tested modules under `src/lib/sweep/` (device-orientation maths, WMM2025 magnetic declination, sample binning, calibration) and `src/lib/horizon/share.ts` (compact link encoding). Thin browser adapters (`sensors.ts`) wrap permissions, camera, orientation events and wake lock. Three new screens (Sweep, Calibrate, Share/Import) plug into the existing Sites → HorizonEditor flow; the sweep result opens in the editor as an unsaved working copy, so Plan 1's review/edit/Save path and unsaved-changes guards apply unchanged.

**Tech Stack:** existing (Svelte 5, TS, astronomy-engine, Vitest, Playwright) + `qrcode-generator` (MIT, no deps) for QR SVG. Browser APIs: `DeviceOrientationEvent` (+ iOS `requestPermission`, `webkitCompassHeading`), `deviceorientationabsolute` (Android), `getUserMedia`, `navigator.wakeLock`, `navigator.share`, `CompressionStream('deflate-raw')`.

**Spec:** `docs/superpowers/specs/2026-11-22-astro-session-planner-design.md` — §7.3 (sweep), §7.9 (target device), §4 anti-goals, §5 constraints.

## Global Constraints

- Sensors and camera need a secure context (HTTPS or localhost). iOS: `DeviceOrientationEvent.requestPermission()` must be called directly inside the tap handler, before any `await` of something else.
- Primary platform: **iPhone 12 Pro, Safari**, both in a tab and as a Home Screen app. Android Chrome best-effort. Laptops (no sensors) must get a clear "use your phone" message and the manual editor, never a blank screen.
- Profiles stay `HorizonProfile` (360 entries, index = **true** azimuth°). The sweep writes true azimuths: compass heading + magnetic declination (WMM2025, always applied) + calibration offset.
- Accuracy target after calibration: ±2° altitude, ±5° azimuth.
- Sample rejection: roll (rotation about the camera axis) > 20°, angular speed > 30°/s, or compass/gyro disagreement (see Task 3). Binning: median per 1° bin; gaps ≤ 5° interpolated; larger gaps stay **unswept** and must be resolved by the user (re-sweep or explicit "fill from neighbours") — never silently 0.
- Calibration never offers or prompts the Sun, nor any object within 30° of the Sun.
- Hand-off links carry only the horizon (altitudes 0.5° quantised, seasonal flags, leaf-off altitudes, north offset, calibration flag) in the URL **fragment** — no coordinates, site name, or ids. Importing never changes state without the user confirming a target site.
- No new network calls at runtime. WMM coefficients are vendored (NOAA, public domain).
- Svelte 5 runes, TS strict, dark theme tokens from `src/app.css`, 390 px phone layout, no horizontal scroll.
- Pushing to GitHub redeploys the live site: **the controller asks the owner before any push.**

## Out of scope here

- The "night check" (bright stars drawn over the roofline on the sky dome, spec §7.3 step 5) belongs to Plan 3's dome view.

## Review Focus

1. **Magnetic disturbance mid-sweep** (steel lintels, cars): heading jumps that the gyro didn't see must be rejected and surfaced ("compass disturbed — move away from metal"), not baked into the profile. Test in Task 3.
2. **Gaps left in the sweep:** unswept bins larger than 5° must block "Use this horizon" until re-swept or explicitly filled, and the editor must show them. Test in Tasks 3 and 6.
3. **Sensors unavailable or permission denied** (laptop, iOS "Don't Allow", insecure origin): clear message, link to manual editor. Test in Task 6.
4. **Bad or truncated hand-off link** (copied partially, old version, someone else's link): explicit error, no state change; valid link still requires choosing a site and confirming. Test in Tasks 5 and 8.
5. **Phone held landscape or flat:** samples rejected with a "hold the phone upright in portrait" prompt; azimuth wrap at 359→0 handled in binning and in rotation by a calibration offset. Test in Tasks 1, 3 and 4.

---

## File Structure

```
src/lib/sweep/orientation.ts   — Euler → rotation matrix → camera alt/az/roll; heading helpers; angle utils
src/lib/sweep/wmm2025.ts       — generated coefficient table (from data/wmm/WMM2025.COF)
src/lib/sweep/geomag.ts        — magnetic declination (WMM spherical-harmonic synthesis)
src/lib/sweep/binning.ts       — SweepAccumulator: accept/reject samples, coverage, toProfile
src/lib/sweep/calibration.ts   — candidate objects, offset from aimed samples, rotateProfile
src/lib/sweep/sensors.ts       — browser adapters: permissions, orientation stream, camera, wake lock
src/lib/horizon/share.ts       — encode/decode horizon link payload; import URL helpers
src/ui/SensorProbe.svelte      — hidden #sensor-probe debug screen (raw + computed readouts)
src/ui/SweepView.svelte        — full-screen camera sweep
src/ui/CalibrateView.svelte    — aim-at-object north fine-tune
src/ui/ShareHorizon.svelte     — link / QR / share sheet for one site's horizon
src/ui/ImportHorizon.svelte    — confirm-and-apply dialog for #import-horizon=…
data/wmm/WMM2025.COF, data/wmm/WMM2025_TestValues.txt, data/wmm/SOURCE.md
scripts/build-wmm.ts           — COF → src/lib/sweep/wmm2025.ts
Modify: src/lib/types.ts, src/lib/store/state.ts, src/App.svelte, src/ui/Sites.svelte, src/ui/HorizonEditor.svelte
Tests: tests/unit/{orientation,geomag,binning,calibration,share}.test.ts, tests/e2e/{sweep,share}.spec.ts, tests/e2e/sensors-stub.ts
```

## Shared type change (Task 4 makes it)

```ts
export interface HorizonCalibration { target: string; at: string; residualAltDeg: number; }
export interface HorizonProfile { /* existing fields */ calibration: HorizonCalibration | null; unswept?: boolean[] }
```
`calibration` null = uncalibrated (badge). `unswept[i]` true where the sweep had no data (only present on sweep-sourced profiles; absent = all swept). `parseState` treats a missing `calibration` as null and validates `unswept` as an optional boolean[360].

---

### Task 1: Orientation maths + sensor probe (then owner checkpoint)

**Files:** Create `src/lib/sweep/orientation.ts`, `src/lib/sweep/sensors.ts` (orientation + permission parts only), `src/ui/SensorProbe.svelte`; Modify `src/App.svelte` (route `#sensor-probe`, not in the tab bar). Test: `tests/unit/orientation.test.ts`.

**Interfaces — Produces:**
- `cameraDirection(alpha: number, beta: number, gamma: number): { alt: number; azRel: number; roll: number }` — W3C rotation `R = Rz(α)·Rx(β)·Ry(γ)` (earth frame X=East, Y=North, Z=Up); rear camera looks along device −Z, so `d = −R·ẑ = −(cα·sγ + cγ·sα·sβ, sα·sγ − cα·cγ·sβ, cβ·cγ)`; `alt = asin(d_z)`, `azRel = atan2(d_x, d_y)` normalised 0–360 (east of the alpha reference). `roll` = angle between the device +Y axis and the vertical plane containing `d` (0 when the phone is upright in portrait), degrees, signed.
- `wrap360(a)`, `angDiff(a, b)` (signed shortest, −180..180), `circularMean(degs: number[]): number`.
- `type OrientationSample = { t: number; alt: number; azRel: number; azMag: number; roll: number; absolute: boolean; compassAccuracy: number | null }` (`azRel` is the gyro-referenced azimuth from `cameraDirection`, used to detect compass jumps).
- `sensors.ts`: `sensorSupport(): { secure: boolean; orientation: boolean; needsPermission: boolean; camera: boolean }`; `requestMotionPermission(): Promise<'granted' | 'denied' | 'not-needed'>` (call synchronously first in a tap handler); `startOrientation(cb: (s: OrientationSample) => void): () => void` — iOS: `deviceorientation` with `webkitCompassHeading`; Android: `deviceorientationabsolute`; computes `azMag` per **Ruling P1** below.
- **Ruling P1 (provisional, confirmed at the checkpoint):** iOS `azMag = wrap360(webkitCompassHeading)` when |β−90| < 50 (iOS reports the rear-camera heading when the phone is upright); otherwise `wrap360(azRel + k)` where `k` is a running circular mean of `webkitCompassHeading − azRel` collected while upright. Android: `azMag = wrap360(360 − α)`-based via `cameraDirection` with absolute α (`azRel` is already north-referenced).
- `SensorProbe.svelte`: Start button (requests permission), live readout of α, β, γ, `webkitCompassHeading`, `webkitCompassAccuracy`, computed alt/azRel/roll/azMag, sample rate; and a "mark" button that logs the current reading with a free-text label, with a Copy-all button so the owner can paste results back.

- [ ] **Step 1: Failing tests** `orientation.test.ts`: upright portrait facing north (α=0, β=90, γ=0) → alt 0, azRel 0, roll 0; α=90 → azRel 270; β=120, γ=0 → alt 30; β=60 → alt −30; flat face-up (β=0,γ=0) → alt −90; portrait tilted 15° about the camera axis → |roll| ≈ 15 (±0.5) and alt/azRel unchanged (±0.5); `angDiff(350, 10)` = 20, `angDiff(10, 350)` = −20; `circularMean([350, 10])` = 0 (±1e-9, accept 360); 1000 random (α,β,γ) with β∈[60,120]: `d` from `cameraDirection` matches an independent quaternion implementation in the test within 1e-9.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** Implement. **Step 4:** PASS; `npm run check` clean.
- [ ] **Step 5: Commit** — `feat: device-orientation camera maths and sensor probe screen`
- [ ] **Step 6: OWNER CHECKPOINT (controller).** Ask the owner to approve pushing so the probe is on HTTPS (GitHub Pages). Then ask them, on the iPhone in Safari: open `…/#sensor-probe`, Start, hold the phone upright in portrait, point the camera at four landmarks whose directions they know (or N/E/S/W by a map app), mark each; tilt up 30° at one; then copy the log back. The controller rules on P1 from the data (record in ledger) before Task 6. If `webkitCompassHeading` does not track the camera when upright, switch to the alpha-offset formula for all poses.

---

### Task 2: Magnetic declination (WMM2025)

**Files:** Create `data/wmm/WMM2025.COF`, `data/wmm/WMM2025_TestValues.txt`, `data/wmm/SOURCE.md` (vendored from NOAA NCEI WMM2025 release; record URL and date), `scripts/build-wmm.ts` (writes `src/lib/sweep/wmm2025.ts`), `src/lib/sweep/geomag.ts`. Test: `tests/unit/geomag.test.ts`.

**Interfaces — Produces:** `declination(latDeg: number, lonDeg: number, heightKm: number, date: Date): number` — degrees, east positive. Standard WMM synthesis to degree/order 12 (Schmidt semi-normalised associated Legendre functions, geodetic→geocentric conversion on WGS84, secular variation from epoch 2025.0). Throws a `RangeError` outside 2025.0–2030.0.

- [ ] **Step 1: Failing test** — every row of `WMM2025_TestValues.txt` (date, height, lat, lon → D): `declination` within 0.01°.
- [ ] **Step 2:** FAIL. **Step 3:** Implement build script + `npm run build:wmm` + synthesis. **Step 4:** PASS. **Step 5: Commit** — `feat: WMM2025 magnetic declination`

---

### Task 3: Sweep accumulator and binning

**Files:** Create `src/lib/sweep/binning.ts`. Test: `tests/unit/binning.test.ts`.

**Interfaces — Consumes:** `OrientationSample`, `angDiff`, `wrap360` (Task 1). **Produces:**
```ts
export type Rejection = 'roll' | 'fast' | 'compass-jump' | 'not-upright' | 'low-accuracy'
export class SweepAccumulator {
  constructor(opts: { declinationDeg: number; offsetDeg?: number; maxRollDeg?: 20; maxRateDegPerS?: 30; maxGapFillDeg?: 5 })
  add(s: OrientationSample): { accepted: true; azTrue: number } | { accepted: false; reason: Rejection }
  coverage(): { swept: number; total: 360; bins: boolean[] }   // bins with ≥1 accepted sample
  largeGaps(): { from: number; to: number }[]                  // unswept runs > maxGapFillDeg (wrap-aware)
  toProfile(opts?: { fillLargeGaps?: boolean }): HorizonProfile // throws if largeGaps() non-empty and !fillLargeGaps
}
```
Rules: `azTrue = wrap360(azMag + declinationDeg + offsetDeg)`. Reject `not-upright` when alt is outside −10..80; `roll` when |roll| > maxRoll; `fast` when angular speed between consecutive samples (great-circle on alt/az) > maxRate; `compass-jump` when consecutive `azMag` change exceeds the change in `azRel` by > 8° (gyro says it didn't turn); `low-accuracy` when `compassAccuracy` > 25 (iOS reports degrees; null = unknown, accept). Bin = `Math.floor(azTrue)`; value = median alt (clamped 0–90 after median). `toProfile`: gaps ≤ 5° linearly interpolated (wrap-aware); with `fillLargeGaps` large gaps also interpolated and marked in `unswept`; `source: 'sweep'`, `northOffsetDeg: offsetDeg`, `calibration: null`, `seasonal`/`leafOffAltitudes` all false/0.

- [ ] **Step 1: Failing tests:** synthetic sweep of a known skyline (roof 30° from 90–150, trees 20° from 200–260, else 3°) with noise ±0.5° and 3 samples/° → profile within ±1° everywhere; wrap: samples at 359.6 and 0.4 land in bins 359 and 0; a 3° gap is interpolated, an 8° gap appears in `largeGaps()` and `toProfile()` throws, `toProfile({fillLargeGaps:true})` interpolates and sets `unswept` for those 8 bins; roll 25° rejected `roll`; jump of 40° azMag with 1° azRel change rejected `compass-jump`; 50°/s rejected `fast`; declination 2° shifts the roof edge by +2 bins; median resists a single 60° outlier in a bin.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5: Commit** — `feat: sweep sample filtering and 1° binning`

---

### Task 4: Calibration maths + profile type change

**Files:** Create `src/lib/sweep/calibration.ts`; Modify `src/lib/types.ts`, `src/lib/store/state.ts` (validation of `calibration`, `unswept`), every place that builds a `HorizonProfile` (`flatProfile`, editor) to include `calibration: null`. Test: `tests/unit/calibration.test.ts`, additions to `tests/unit/state.test.ts`.

**Interfaces — Produces:**
- `BRIGHT_STARS: { name: string; ra: number; dec: number; mag: number }[]` — the 20 brightest stars visible from 50–55°N (J2000 degrees), constants in the file.
- `calibrationCandidates(site: Site, at: Date): { id: string; label: string; alt: number; az: number; kind: 'moon' | 'planet' | 'star' }[]` — Moon, Venus, Mars, Jupiter, Saturn and `BRIGHT_STARS`; apparent alt/az **with normal refraction** (astronomy-engine `Horizon(..., 'normal')`); only alt between 5° and 60°; **excludes the Sun and anything within 30° of it**; sorted Moon, planets, then stars by magnitude.
- `offsetFromAim(aimed: { azMag: number; alt: number }[], truth: { az: number; alt: number }, declinationDeg: number): { offsetDeg: number; residualAltDeg: number; spreadDeg: number }` — circular mean of `truth.az − (azMag + declination)`; `residualAltDeg` = mean measured alt − truth alt; `spreadDeg` = circular std dev of the per-sample offsets.
- `rotateProfile(p: HorizonProfile, deltaDeg: number): HorizonProfile` — shifts all per-azimuth arrays by `deltaDeg` (linear interpolation between bins, wrap-aware), adds `deltaDeg` to `northOffsetDeg`; pure.

- [ ] **Step 1: Failing tests:** candidates never include 'sun' and exclude Venus when it is < 30° from the Sun (pick a 2026 date where that holds, found via astronomy-engine in the test); all candidates have 5 ≤ alt ≤ 60; `offsetFromAim` with readings 10° low in azimuth → offset +10 (wrap case: truth 355, measured 5 → −10); `rotateProfile(p, 10)` moves a 30° roof at 90–150 to 100–160 and wraps a feature at 355–5 to 5–15; rotating by +7 then −7 returns the original within 0.01; `parseState` accepts a profile without `calibration` (→ null), rejects `unswept` of wrong length.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5: Commit** — `feat: calibration candidates, offset solve and profile rotation`

---

### Task 5: Horizon share encoding

**Files:** Create `src/lib/horizon/share.ts`. Add dependency `qrcode-generator`. Test: `tests/unit/share.test.ts`.

**Interfaces — Produces:**
- `encodeHorizon(p: HorizonProfile): Promise<string>` — payload v1: byte 0 = version 1; byte 1 = flags (bit 0 = has seasonal data, bit 1 = calibrated); bytes 2–361 = `round(alt*2)` (0–180); then, only if bit 0: 45-byte seasonal bitset and 360 bytes leaf-off `round(alt*2)`; then int16 big-endian `round(northOffsetDeg*10)`. Then `deflate-raw` via `CompressionStream`, then base64url.
- `decodeHorizon(s: string): Promise<HorizonProfile>` — reverse; throws `Error` with a human message on bad base64, unknown version, wrong length, or decompression failure. Decoded profile: `source: 'import'`, `createdAt` now, `calibration` = `{ target: 'imported', at: now, residualAltDeg: 0 }` if the flag was set else null.
- `importUrl(base: string, payload: string): string` → `${base}#import-horizon=${payload}`; `readImportHash(hash: string): string | null`.
- `horizonQrSvg(url: string): string` — `qrcode-generator`, error level L, typeNumber 0 (auto).

- [ ] **Step 1: Failing tests:** round trip of a realistic profile within 0.25° per bin, seasonal + leaf-off preserved, offset within 0.05°; flat profile encodes to < 120 chars; realistic garden profile < 600 chars; truncated string → throws "link is incomplete"; version 2 → throws "made by a newer version"; the encoded string contains no digits sequence matching the site lat/lon (privacy smoke check: encode a profile from a site at 51.4823,−0.0077 and assert neither "51.48" nor "0.0077" appears in the URL).
- [ ] **Step 2:** FAIL. **Step 3:** Implement (Vitest runs on Node 24, which has `CompressionStream`). **Step 4:** PASS. **Step 5: Commit** — `feat: compact horizon share links`

---

### Task 6: Sweep screen

**Files:** Create `src/ui/SweepView.svelte`; extend `src/lib/sweep/sensors.ts` (`startCamera(video: HTMLVideoElement): Promise<() => void>` with `facingMode: { ideal: 'environment' }`, `playsinline`, muted; `keepAwake(): Promise<() => void>` via `navigator.wakeLock`, no-op if absent); Modify `src/ui/Sites.svelte` (row button "Sweep horizon"; on finish open `HorizonEditor` with the swept profile as its working copy, marked dirty), `src/ui/HorizonEditor.svelte` (optional `initial?: HorizonProfile` prop; draw `unswept` bins hatched; show "uncalibrated" badge when `calibration` null and `source` is sweep/import). Test: `tests/e2e/sensors-stub.ts`, `tests/e2e/sweep.spec.ts`.

**Behaviour:** Start screen explains the sweep in three lines and has one "Start" button that calls `requestMotionPermission()` first then `startCamera`. Denied / unsupported / insecure → message naming the cause, plus "Draw it by hand instead" (opens the manual editor). Running view: full-screen video, horizontal crosshair line across the centre, readout (alt, true az), a 360° coverage ring (swept bins filled), and a status line for the latest rejection ("Hold the phone upright", "Slow down", "Compass disturbed — move away from metal"). Buttons: "Done" (enabled at any time) → if `largeGaps()` non-empty, show them ("Not swept: 120°–131°") with "Sweep the gaps" or "Fill from neighbours"; else build the profile. Declination from `declination(site.lat, site.lon, site.elevation/1000, now)`. Wake lock held while running; camera and listeners stopped on exit.

- [ ] **Step 1: e2e stub** `sensors-stub.ts`: `addInitScript` that replaces `navigator.mediaDevices.getUserMedia` with a canvas `captureStream()`, defines `DeviceOrientationEvent.requestPermission` returning 'granted', and exposes `window.__emitOrientation(alpha, beta, gamma, compassHeading)` dispatching a `deviceorientation` event with `webkitCompassHeading`.
- [ ] **Step 2: Failing e2e tests:** (a) full synthetic sweep (roof 30° over 90–150) via `__emitOrientation`, Done → editor opens dirty with the roof present (sample `aria-valuenow` near 30 at the 120° control point), Save → stored profile `source: 'sweep'`; (b) sweep leaving an 8° gap → Done shows the gap message; "Fill from neighbours" → editor shows hatched bins; (c) permission denied stub → message + "Draw it by hand instead" opens the editor; (d) no `DeviceOrientationEvent` → "needs a phone" message; (e) 390 px: no horizontal scroll.
- [ ] **Step 3:** FAIL. **Step 4:** Implement. **Step 5:** PASS (`npm run e2e`, `npm test`, `npm run check`). **Step 6: Commit** — `feat: phone horizon sweep screen`

---

### Task 7: Calibrate screen

**Files:** Create `src/ui/CalibrateView.svelte`; Modify `src/ui/HorizonEditor.svelte` ("Calibrate north" button; shown on phones with sensor support) and `src/ui/SweepView.svelte` (after Done, offer "Calibrate now (recommended)" before opening the editor). Test: extend `tests/e2e/sweep.spec.ts`.

**Behaviour:** list `calibrationCandidates(site, now)` with alt/az and a one-line hint ("Moon — low in the south-east"); empty list → explain why ("Nothing bright enough is up right now — try after dark") and allow skipping. Pick one → camera view with crosshair; user centres it and holds; "Lock" averages accepted samples over 1.5 s (needs ≥ 10); show result: "North corrected by +7.4°; altitude reads 1.1° high"; if `spreadDeg` > 3 ask to retry. Apply → `rotateProfile(working, offset)` and set `calibration`. Nothing in this screen ever names or points at the Sun.

- [ ] **Step 1: Failing e2e:** fixed clock via `window.__testNow` (epoch ms) set by the init script and read through `now(): Date` exported from `sensors.ts` (falls back to `new Date()`); all screens use `now()`; aim stub readings 10° west of the chosen candidate → after Lock the editor's roof edge shifts +10° and the badge disappears; candidates list never contains "Sun".
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5: Commit** — `feat: north calibration against the Moon, planets and bright stars`

---

### Task 8: Share and import

**Files:** Create `src/ui/ShareHorizon.svelte`, `src/ui/ImportHorizon.svelte`; Modify `src/ui/HorizonEditor.svelte` ("Send to another device" button, enabled when saved), `src/App.svelte` (on load and on `hashchange`, if `readImportHash(location.hash)` → show `ImportHorizon`, then `history.replaceState` to `#sites`). Test: `tests/e2e/share.spec.ts`.

**Behaviour:** Share panel: "Share…" (`navigator.share({ url })` when available — AirDrop/Messages on iPhone), the QR SVG sized to fit 390 px, and "Copy link". Copy explains "The link contains only the horizon shape — no location." Import dialog: decode (errors shown verbatim, nothing changes, "Dismiss"); preview the profile as a small read-only panorama; choose a site (select) or "New site…" (opens the site form, then applies); "Replace horizon" confirms if the site already has one; applying sets the site's horizon and opens its editor (saved, not dirty).

- [ ] **Step 1: Failing e2e:** share a seeded profile → link text matches `/#import-horizon=[A-Za-z0-9_-]+$/` and contains no "51.5"; open that URL in a fresh context with one seeded site → dialog, choose site, Replace → stored horizon equals the original within 0.5° per bin, URL hash becomes `#sites`; truncated link → error text, storage unchanged; QR `<svg>` renders inside a 390 px viewport without horizontal scroll.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5: Commit** — `feat: send a horizon to another device by link or QR`

---

### Task 9: Docs, deploy and on-device acceptance

**Files:** Modify `README.md` (sweep how-to: hold upright, sweep slowly, calibrate after dark, send to laptop), `docs/superpowers/specs/…` only if a ruling changed the design (note it in a "Changes after Plan 2" section).

- [ ] **Step 1:** Update README; commit `docs: horizon sweep guide`.
- [ ] **Step 2: Controller asks the owner** to approve merging to main and pushing (redeploys the live site).
- [ ] **Step 3:** After the deploy is green, the owner does the acceptance run on the iPhone (Safari tab and Home Screen app): sweep the garden, calibrate on the Moon or a bright star, check three known features (e.g. chimney, tree gap, roof ridge) read within ±2° altitude / ±5° azimuth of where they look, send to the laptop via AirDrop or QR, import, and check Tonight changes. Findings come back to the controller; fixes go through a normal task.
