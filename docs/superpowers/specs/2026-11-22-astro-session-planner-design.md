# Astro Session Planner — Design

Date: 2026-11-22
Status: approved 2026-11-22

## 1. Intent

A browser app that answers, in seconds: **"What should I point the Seestar at tonight, from here, and when?"**

The owner images mainly from a back garden with major obstructions (house, trees, etc.) and occasionally travels to a dark site. General-purpose planners don't know the real local horizon, the Seestar's narrow field, or that a dual-band filter changes what is worth shooting under moonlight and garden light pollution. This app knows all three and gives a ranked shortlist with best times.

Success looks like: on a clear evening, open the app, trust the top few results are genuinely clear of the roofline and worthwhile with this gear tonight, and go.

## 2. Goals

1. **Sites with real horizons.** Garden is the primary saved site; dark sites are additional saved sites. Each has location, light-pollution level and a 360° horizon profile.
2. **Phone horizon sweep.** Measure a site's obstructions by sweeping a phone camera along the skyline; the app records azimuth/altitude from the phone's sensors and builds the profile. Profile can be reviewed and hand-corrected.
3. **Gear profiles.** One built-in profile now: ZWO Seestar S50 Pro with its dual-band filter. Gear is a list so new rigs can be added later.
4. **Ranked shortlist for a night.** Defaults to tonight; date picker for any other night. Each entry shows its best window, peak altitude, frame fill, and flags (mosaic needed, Moon nearby, etc.).
5. **Filter- and condition-aware faintness.** Moon (computed), site sky brightness, and filter decide whether a target is worth shooting; emission targets survive moonlight/light pollution with dual-band, broadband targets don't.
6. **Mosaic flagging.** Targets larger than the frame are kept and marked "mosaic", with an estimated panel count, rather than hidden.
7. **Visualisation.** (a) A full-sky dome view showing the horizon profile/obstructions with targets plotted, scrubbable through the night. (b) Per-target altitude-over-the-night chart drawn against the horizon height at the target's azimuth.
8. **Weather cross-check.** Hourly cloud forecast across each target's window and an at-a-glance "next few nights" cloud strip, as a sanity check alongside the owner's existing source.
9. **Explain exclusions.** Hidden targets are counted by reason (blocked/low, too small, too faint) and viewable, so missing favourites are explicable.
10. **Works offline in the field** (except weather).

## 3. Non-goals

- Controlling the Seestar or exporting plans to it.
- A planetarium/star chart.
- Image processing (that's pixinsight-mcp).
- Accounts, cloud sync, multi-user.
- Solar-system objects (planets, comets) in v1 — deep-sky only.
- Being the primary weather decider.

## 4. Anti-goals (failure even if it "works")

- Recommending a target that's actually behind the house.
- Needing a connection at a dark site to plan.
- Fiddly setup: sweeping a site should take a few minutes, not an evening.
- Opaque ranking: if the owner can't see why something is ranked or hidden, they won't trust it.
- Sending the garden location anywhere beyond what weather lookup needs.

## 5. Constraints

- **Camera, compass and motion sensors require HTTPS** (secure context). iOS additionally requires `DeviceOrientationEvent.requestPermission()` from a user tap.
- **Free static hosting** on the owner's GitHub account (GitHub Pages). On a free GitHub plan, Pages requires a **public** repo. No personal data (location, horizon) lives in the repo — it stays in browser storage.
- **No backend.** Any third-party API must be HTTPS and send CORS headers.
  - Open-Meteo: verified HTTPS + `Access-Control-Allow-Origin: *`; provides hourly low/mid/high cloud cover, humidity, wind including upper-level winds. No key.
  - 7Timer! (seeing/transparency): HTTPS works but **sends no CORS header**, so a browser can't call it directly. See §7.
- Seestar S50 Pro telephoto: 260 mm f/5.2, 3840×2160 sensor at 2.9 µm (≈11.1 × 6.3 mm) → **FoV ≈ 2.45° × 1.38°** (2.8° diagonal, matches ZWO's published figure); ≈2.3″/px. Alt-az mount: tracking degrades near the zenith and the field rotates.

## 6. Approaches considered

1. **Static web app, hosted free — CHOSEN.** All astronomy and the catalog run in the browser; installable PWA, offline-capable; data per device; phone → laptop hand-off of a horizon via link/QR or file. Trade-off: no automatic sync — acceptable because sweeps happen a few times a year.
2. **Local Node server on the Mac** (like the pipeline editor). Rejected: HTTPS requirement for phone sensors means self-signed certs on the phone; unusable at a dark site unless the Mac is serving.
3. **Static app + hosted database (e.g. Supabase).** Rejected: accounts and a hosted service for data that rarely changes.

Owner picked 1, in a **new standalone repo** under their GitHub account.

## 7. Design

### 7.1 Architecture & stack (builder's calls, stated)

- TypeScript, Vite, Svelte (small, fast, little boilerplate); `vite-plugin-pwa` for install/offline.
- **astronomy-engine** (MIT) for Sun/Moon/target positions, rise/set, twilight, Moon phase & separation.
- Catalog: **OpenNGC** (CC-BY-SA-4.0; NGC/IC with Messier cross-refs, sizes, magnitudes, surface brightness, type) preprocessed at build time into a compact JSON bundled with the app. Attribution shown in-app. Plus a small **hand-curated addendum** (JSON in the repo) that (a) adds popular objects OpenNGC lacks (selected Sharpless nebulae etc.) and (b) defines **complexes** that OpenNGC splits into parts (e.g. the Veil) with a single overall size, so mosaic flags are right. Objects with missing size are excluded from fit checks and flagged "size unknown"; missing surface brightness is estimated from magnitude and size where possible, else flagged. Users can add **custom targets** (name, RA/Dec, size, type). Full Sharpless/Barnard/LDN catalogs are a later addition; the catalog layer accepts multiple sources. *(builder's call)*
- Storage: browser storage (IndexedDB or localStorage — data is a few KB per site). Full export/import as a JSON file for backup and moving between devices.
- Rendering: custom canvas/SVG for the sky dome and altitude charts.
- Tests: Vitest for the astronomy/scoring/horizon maths; Playwright for key flows.
- Deploy: GitHub Actions → GitHub Pages.

### 7.2 Data model (sketch)

```
Site    { id, name, lat, lon, elevation, timezone,
          skyBrightness: { bortle?, sqm? },
          horizon: HorizonProfile, isDefault }
HorizonProfile { altitudes: number[360]  // degrees, per 1° azimuth (true north)
                 seasonal?: boolean[360] // trees etc.
                 northOffsetDeg, createdAt, source: 'sweep'|'manual'|'import' }
Gear    { id, name, focalLengthMm, sensorWmm, sensorHmm, pixelUm,
          filters: Filter[], mount: 'altaz'|'eq' }
Filter  { id, name, kind: 'none'|'broadband-lp'|'dual-band'|'narrowband' }
Target  { id, names[], ra, dec, type, majArcmin, minArcmin, posAngle,
          mag, surfBr, emission: 'emission'|'broadband'|'mixed' }
```

### 7.3 Phone horizon sweep

1. On the phone, open the app → Site → "Sweep horizon". Tap to grant camera + motion permission.
2. Full-screen rear camera with a horizontal crosshair line at screen centre (on the camera's optical axis). Phone held **portrait**; altitude and azimuth are taken from the full device orientation (rotation matrix / quaternion), so moderate roll is compensated rather than assumed zero; samples with excessive roll or fast motion are rejected. Accuracy target after calibration: **±2° altitude, ±5° azimuth**. *(builder's call)* Hold phone upright; keep the line on the top edge of whatever blocks the sky (roof, tree line); where the sky is open down to the real horizon, keep it on that.
3. Sweep a full 360°. The app samples azimuth (iOS `webkitCompassHeading`; Android `deviceorientationabsolute`) and altitude (from device pitch), with a progress ring showing covered azimuth. Gaps can be re-swept.
4. Samples are binned to 1° azimuth (median per bin; small gaps interpolated).
5. **North calibration:** compasses drift near buildings (10–20° is realistic). (a) Automatic magnetic-declination correction for the site's location, always applied. (b) A **prominent, strongly encouraged** fine-tune: aim the crosshair at the Moon, a bright planet or bright star — the app knows its true azimuth and computes the offset; the offset is stored on the profile and can be redone later without re-sweeping. Horizons swept on this device without a fine-tune show an "uncalibrated" badge (see "Changes after Plan 2"). Never prompt the user to aim at the Sun. *(builder's call)*
   **Night check:** the sky dome view can show bright stars near the roofline for "is Vega really just above that chimney?" spot-checks.
6. **Review/edit:** profile shown as an unrolled 360° panorama line (and on the dome view); drag points to adjust; mark ranges as "seasonal/trees".
7. **Hand-off:** phone shows a QR code / link encoding **only the horizon profile** (360 values quantised to 0.5°, plus seasonal flags and north offset) in the URL fragment — no coordinates or site name; opening it on the laptop imports into a site the user picks. JSON file export/import (which does include everything) also works. *(builder's call)*
8. Manual entry fallback: draw the profile directly in the editor (no phone).

### 7.4 Night computation

For the chosen site, gear+filter, and date (night = local evening to next morning):

- Dark window: Sun below −18° (astronomical). Setting for nautical (−12°) as an option.
- Sample every 5 min. For each target and sample: altitude/azimuth; **usable** if, within the dark window:
  - the **whole frame clears the obstruction**: the lower edge of the frame (target centre altitude − half the frame diagonal, ≈1.4° for the S50 Pro) is above the horizon profile across the frame's azimuth span, plus a clearance margin (default 2°); *(builder's call)*
  - target altitude ≥ a hard minimum (default 15°, per gear — low altitude means thick air and poor results) and ≤ ~80° (alt-az zenith limit, per gear); *(builder's call)*
  - ranges marked **seasonal (trees) count as blocked by default**; a per-site "trees bare" toggle (or month range) lowers them to a stored leaf-off altitude. *(builder's call — conservative, honours the "behind the house" anti-goal)*
- **Windows:** a target may have several usable runs (e.g. split by a tree). Store all runs ≥ 30 min. The shortlist shows **total usable hours** as the primary figure plus the best (longest) window; detail view shows every window. **Peak** = max usable altitude. *(builder's call)*
- Night and "tonight" are defined in the **selected site's timezone**, not the device clock. *(builder's call)*
- **Moon:** illumination, altitude, and separation from target per sample.

### 7.5 Fit and faintness

- **Frame fill** = target major axis vs frame long side (also check minor vs short side, accounting for position angle if known). Labels: too small (below a threshold, e.g. < 5% of frame long side — tunable), good, tight, **mosaic** (exceeds frame) with estimated panel grid (e.g. 2×1, 2×2) and a note that it needs more time.
- **Site baseline** is entered by the user as SQM (mag/arcsec²) or Bortle class; Bortle maps to a mid-class SQM via a standard table in code. The site form links to lightpollutionmap.info for lookup (no bundled light-pollution data). *(builder's call)*
- **Sky brightness** per sample = site baseline degraded by moonlight (Krisciunas–Schaefer-style model using Moon phase, altitude, and separation).
- **Filter effect:** dual-band/narrowband reduces effective sky background for emission targets by a configurable number of magnitudes; broadband targets get little or no benefit (and some penalty for light loss).
- **Too faint** if target surface brightness vs effective sky gives a contrast below threshold across the best window. Thresholds are tunable constants with sensible defaults, documented in code; the builder should sanity-check against known cases (e.g. NGC 7000 with dual-band under a half Moon from Bortle 6 = OK; M101 under the same = poor).

### 7.6 Ranking

Score combines (multiplicatively, so any zero kills it): usable hours in best window, peak altitude (airmass), frame fit (mosaic reduces but doesn't zero), contrast vs sky (filter-aware), Moon separation penalty. Each result shows a short "why" breakdown on demand. Weights are constants in one module.

### 7.7 Screens

**Tonight (home)**

```
Back garden ▾ · Seestar S50 Pro + dual-band ▾ · ◀ Sat 22 Nov ▶
Dark 17:45–06:10 · Moon 8% sets 19:20 · Cloud ▁▁▂▅▇▇▅▂ (tonight)
──────────────────────────────────────────────────────────────
1. NGC 7000 North America  emission  19:20–23:10  peak 54°  MOSAIC 2×2
2. M33 Triangulum          galaxy    20:10–02:30  peak 61°  fills 40%
3. NGC 281 Pacman          emission  18:30–03:00  peak 70°  fills 25%
...
Hidden: 212 blocked/low · 96 too small · 41 too faint   [show]
Next nights: Sun ▇  Mon ▂  Tue ▁  Wed ▅  (cloud)
```

**Target detail:** altitude-vs-time chart with the horizon height at the target's azimuth drawn as a band beneath it, dark window shaded, Moon altitude overlaid, hourly cloud along the bottom; FoV preview rectangle drawn over the target's catalogued size (outline, not an image); ranking breakdown.

**Sky dome:** polar alt-az projection (zenith centre, horizon at edge), obstruction profile filled solid, shortlisted targets plotted, time slider across the night; tap a target to open detail.

**Sites / Gear / Sweep / Settings:** CRUD for sites and gear; sweep flow; thresholds; export/import.

### 7.8 Weather

- Open-Meteo hourly cloud cover (low/mid/high), humidity/dew point, wind, and 250 hPa wind speed (jet-stream strength, a rough seeing proxy), fetched for the site's lat/lon rounded to 2 decimals. Cached; shown with fetch time; absent offline without breaking anything.
- Seeing from 7Timer! isn't available directly (no CORS). For the Seestar at ~2.3″/px seeing is rarely the limiting factor, so v1 ships without 7Timer and shows the jet-stream proxy instead. A tiny proxy (e.g. a free Cloudflare Worker) can be added later if wanted.
- Weather never changes the ranking; it's displayed alongside.

### 7.9 Target device for the sweep

Owner's phone: **iPhone 12 Pro, Safari.** iOS Safari is the primary, must-work platform for the sweep (`DeviceOrientationEvent.requestPermission()` on tap, `webkitCompassHeading`, `getUserMedia` rear camera). Test both in a Safari tab and as an installed home-screen app. Android Chrome is best-effort.

### 7.10 Validating the faintness model

The owner has no list of past results. The builder assembles a regression set of ~20 well-known targets with expected verdicts for a Seestar with dual-band from a Bortle 5–6 garden at various Moon phases. Examples: emission targets like NGC 7000, IC 1805, NGC 281 should pass under moderate Moon; faint galaxies like M101 and NGC 2403 should fail under a bright Moon; tiny objects like most planetary nebulae under 1′ should be "too small". Tests pin these expectations. Thresholds are exposed in Settings so the owner can loosen or tighten them after real sessions.

## 8. Decided by the owner

- Browser app; static hosted (approach 1); new standalone repo on owner's GitHub.
- Back garden primary; occasional dark sites.
- Phone sweep included.
- Output: ranked shortlist for tonight with best times; any date viewable.
- Gear: Seestar S50 Pro with dual-band only; Canon dropped; more gear possible later.
- Filters factored into faintness/ranking.
- Mosaic flagging wanted.
- Weather/seeing as a cross-check, not the decider.
- Sweep phone: iPhone 12 Pro with Safari. No existing target list, so the faintness thresholds get tuned from known cases (§7.10).

## 9. Left to the builder

- Repo name (proposal: `astro-session-planner`), project layout, UI styling.
- Exact scoring weights and faintness thresholds (start from §7.5–7.6, tune against known targets).
- Magnetic declination model choice (embedded WMM coefficients or equivalent).
- Sweep sampling/filtering details and UX polish.
- Catalog preprocessing details and which OpenNGC object types to include (exclude stars, duplicates, nonexistent).

## Changes after Plan 2

- Calibration targets are filtered by daylight: the Moon any time, Venus once the Sun is below the horizon, Jupiter, Saturn, Mars and bright stars only once the Sun is 6 degrees below it.
- Calibration is offered only for horizons swept on this device. The profile carries an optional `sweptHere` flag, set by the sweep and kept through hand edits and saves; it is never put in share links, so imports never have it. Hand-editing the shape (point drags, Reset flat) still marks the saved horizon `manual`, but a touched-up sweep keeps Calibrate north, because the edits were made in the sweep's own frame and rotating the whole profile keeps them consistent. Reset flat drops the flag. Imported and hand-drawn horizons cannot be calibrated.
- The "uncalibrated" badge (§7.3 item 5) appears only for horizons with `sweptHere` and no calibration. Imported horizons do not show it, since they offer no way to calibrate; hand-drawn horizons never had a compass error to correct.
- Recalibrating replaces the previous correction rather than stacking on it.
- After Done the sweep is only an unsaved working copy. The editor tells the user to Save now and calibrate later from Edit horizon; there is no draft persistence, so a sweep left unsaved can still be lost if iOS discards the page.
- Sweep and calibration pause when the page is hidden or the browser ends the camera track; a paused sweep, or typed site details, are only discarded after the user confirms.
- Compass disturbance is detected against a running compass-minus-gyro baseline (the median of the first 2 s of accepted samples, then a slow average of accepted samples), so a held or slowly ramped disturbance keeps being rejected; angular speed is measured from the gyro.
