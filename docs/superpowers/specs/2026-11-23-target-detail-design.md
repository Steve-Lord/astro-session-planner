# Target detail screen — design

Plan 3, part 1 of 3. The order agreed with the owner on 2026-11-23 is: target detail, then the sky dome, then weather. This document amends the main design (docs/superpowers/specs/2026-11-22-astro-session-planner-design.md §7.7 "Target detail"). The weather parts of that section (hourly cloud along the chart) are moved to Plan 3 part 3.

## Intent

The Tonight list says *what* to shoot and gives a best window. It doesn't let the owner *see* why: when a target clears the roofline, how close it gets to the mount limit, when the Moon is in the way, and how the object sits in the frame. The owner's garden is heavily blocked to the south and west, at about 30–38°, so whether a target clears the horizon is often what decides the night. The detail screen makes that visible for one target at a time, to help choose between targets and to time a session.

## Goals

- Tap a target on Tonight to open its own detail screen for the same site, gear, filter and date.
- Show an **altitude chart** for the night:
  - the target's height;
  - the owner's horizon height in the target's direction, moving with the target;
  - twilight and dark shading;
  - the usable stretch highlighted;
  - the Moon's height.
- Show a **Moon distance strip**: the target-to-Moon angle through the night, with a one-line Moon summary.
- Show a **frame preview**: the Seestar frame outline with the object's catalogued size and angle drawn to scale, and the panel grid when it's a mosaic.
- Show the **score breakdown**. This is the content of today's "why" list, which moves here.
- **Hidden targets open it too.** Targets in the Blocked/low, Too small and Too faint lists can be tapped. The screen then shows why each one was hidden.

## Non-goals

- Weather on the chart. That belongs to part 3.
- Photos or star-field images in the frame preview. It is outlines only.
- Editing anything from this screen.
- Comparing several targets on one chart.

## Anti-goals

- No change to the ranking or to which targets are hidden. This screen only explains what the planner already decided. Its numbers must match the Tonight row exactly: the window, hours, peak and fit.
- It must not need the network. It works offline like the rest of the app.
- The chart must stay readable on a 390 px-wide phone. It is not a desktop chart squeezed down.

## Approaches considered (owner picked 1)

1. **Its own screen** *(chosen)*.
   - The detail fills the screen, and Back or the phone's back gesture returns to Tonight at the same scroll position.
   - The address holds the target, so the screen can be bookmarked or reloaded.
   - The chart gets the full width.
2. **Expand in the list.** Rejected: the chart is squeezed, and long rows make scrolling jumpy.
3. **Bottom sheet.** Rejected: it covers the list anyway, and on iOS it fights page scrolling and browser gestures.

## Design

### Getting there and back

- Tapping a Tonight row opens the detail. The whole row is the tap target, and the separate "why" button goes.
- Each name in an expanded hidden list is also tappable.
- The detail screen's address carries the target id and the date, for example `#target=<id>&date=2026-11-22` (exact format is the builder's call). It uses the currently selected site, gear and filter.
- **Reload and bookmark:**
  - Reloading the address shows the same detail.
  - If the id is unknown (for example a custom target that has since been deleted), the screen says so and offers Back.
- **Back:**
  - "‹ Tonight" at the top returns to Tonight, as does the browser or phone back gesture.
  - Tonight keeps its scroll position and its date. Tonight is not re-planned on return unless something changed.

### Header

- Name and common name, type and emission class.
- One summary line in the same words the Tonight row uses:
  - best window and hours;
  - peak altitude;
  - fit text (`fills 48%`, `MOSAIC 2×2`, `size unknown`).
- For a hidden target, a plain reason replaces the summary. For example:
  - "Hidden: never clears your horizon above 15° tonight"
  - "Hidden: too faint — 1.2 mag fainter than the sky with the Moon up"
  - "Hidden: too small — fills 3% of the frame"

### Altitude chart

The time axis runs from **sunset to sunrise** for the chosen date and site. Shading:
- civil, nautical and astronomical twilight in steps;
- the dark window the planner used (−18°, or −12° on nights with no astronomical darkness) shaded darkest.

Hour ticks are in the site's time zone.

Lines and bands:
- **Target altitude:** a solid line through the night.
- **Horizon band:** for each sample, the height of the owner's horizon at the target's azimuth at that moment, filled from 0° up. Leaf-off heights are used when the site says the trees are bare, matching how the planner reads the horizon (`heightAt`).
  - With no horizon saved, the band is flat at 0° and a note says "No horizon saved for this site".
- **Usable stretch:** the samples the planner counts as usable, highlighted under or along the target line. The rule is:
  - at or above the minimum altitude;
  - at or below the mount limit;
  - the frame clears the horizon plus clearance.
  
  If there are two windows (for example when alt-az splits a transit at the zenith), both are highlighted and the best one is marked.
- **Minimum altitude:** a dashed line at the gear's minimum (15°).
- **Mount limit:** a dashed line at 80° only when the gear is alt-az. When it's equatorial there is no line.
- **Moon:** a dotted line for the Moon's height while it's above the horizon.

The vertical axis runs 0–90°.

Tapping or dragging on the chart shows a readout for that time: the target's altitude and azimuth, the horizon height there, and the Moon's distance. *(Builder's call how this looks. A crosshair with a small label is enough.)*

### Moon distance strip

- A thin strip under the chart on the same time axis. It shows the target-to-Moon angle while the Moon is up, and nothing while it's down.
- A shaded zone marks where moonlight noticeably hurts: under 60° from the target while the Moon is more than 30% lit. These are the existing score constants (`moonSepZeroDeg + moonSepSpanDeg`, `moonIllumThreshold`), so the picture agrees with the ranking.
- **Summary line:** "Moon NN% lit · closest NN° at HH:mm · rises/sets HH:mm". When the Moon is down all night, it reads "Moon down all night".
- The strip only shows information; the ranking doesn't change.

### Frame preview

- The Seestar frame is drawn as a rectangle in its true proportions: landscape, long side 11.14 mm × short side 6.26 mm at 260 mm focal length, about 147′ × 83′. It is sized to fit the card width.
- **Object outline:**
  - The object is drawn as an ellipse from `majArcmin`, `minArcmin` and `posAngle`, all to the same scale.
  - With no position angle, the major axis lies along the frame's long side. A note says "orientation unknown".
  - With no minor axis, it is drawn as a circle.
  - With no size, the frame is shown alone and labelled "size unknown".
- **Mosaic:** the panel grid from the planner's fit (for example 2×2) is drawn, and the object is centred on the whole grid.
- The caption repeats the fit text and the field size in arcminutes.

### Score breakdown

The five factors with their values, as the "why" list shows today: hours, altitude, fit, contrast and Moon. They are worded as now, with the same numbers. Hidden targets have no score, so for them this section is replaced by the reason line in the header.

## Constraints

- Svelte 5 runes, TypeScript strict, and the existing dark theme tokens from `src/app.css`.
- Phone first: a 390 px viewport with no horizontal scroll. Charts are SVG scaled to the card width, with text and lines readable without zooming.
- All the numbers come from the same functions the planner uses, so the detail can never disagree with Tonight:
  - `buildContext` / `visibility` for altitudes and usable samples;
  - `heightAt` for the horizon;
  - `frameFit` / `fovArcmin` for the frame;
  - the Moon samples from the night context.

  The chart needs sunset to sunrise, which is wider than the dark-only sampling `buildContext` does today. Sampling that wider span must not change any planner result.
- Each target is computed on demand. This is one target, not the catalogue, so it runs on the main thread, and opening it should feel instant on an iPhone 12 Pro.
- It must work offline. There are no new network calls.

## Calls made after the builder check (designer's calls; the owner can overrule)

1. **Horizon band against "usable".** The band shows the horizon itself (`heightAt`). The planner needs the frame's half-diagonal plus the clearance above that, so a thin line drawn above the band marks this "needed height", and the legend names it. That way a target line just above the band but below the needed line visibly explains why that stretch isn't usable.
2. **What is highlighted.** Only the planner's `windows` are highlighted: runs of 30 minutes or more inside the dark window. These are exactly what Tonight counts. Twilight and short runs are not highlighted, so the chart can never contradict "Hidden: never clears…".
3. **Data for hidden targets.** The detail recomputes the one target by calling the planner on a one-target catalogue, so the numbers come out identical. The recompute also returns the specific reason and its numbers. `NightPlan` and the worker payload are unchanged. The "blocked" wording separates its causes:
   - never rises above the minimum;
   - never clears the horizon;
   - only short gaps (under 30 min);
   - no dark window tonight.
4. **Date on reload or bookmark.** The detail address carries the date. Back from a cold-loaded detail lands on Tonight at that same date, which counts as a date the user chose, so it doesn't follow the clock.
5. **Where it lives.** The detail is drawn over the Tonight tab while Tonight stays mounted but hidden, which is how it keeps its scroll position and plan. The tab bar stays visible with Tonight shown as active.

## Left to the builder

- The exact address format, and how Tonight keeps its scroll position.
- Chart styling, colours and the readout's look, within the theme tokens.
- Whether the sunset-to-sunrise sampling extends `buildContext` or is a separate helper. Either way, planner results must stay identical, which the existing tests pin.
- How the hidden-reason sentence is worded for each reason, keeping to the planner's actual cause.
