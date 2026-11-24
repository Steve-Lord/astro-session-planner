# Sky dome — design

This is Plan 3, part 2 of 3. The order agreed with the owner on 2026-11-23 is: target detail (done, merged at 0b1732f), then the sky dome, then weather.

This document amends the main design (docs/superpowers/specs/2026-11-22-astro-session-planner-design.md):
- §7.7 "Sky dome" and goal 7(a);
- the "night check" in §7.3 step 5.

## Intent

The owner wants to judge target choice against the actual conditions on the night. In the owner's words, that includes "scope pointing towards light source for instance".

- The planner already decides what clears the roofline. The dome doesn't decide anything new. It shows **where everything is on the sky**, so the owner can make that judgement themselves.
- The owner can see, for example:
  - that a target sits over a neighbour's light;
  - that it is heading into the trees in an hour;
  - that it is near the Moon.
- The detail screen answers "when does this one target clear my roofline". The dome shows the whole sky at once.

## Goals

- A new **Sky** tab with a round, top-down map of the sky for the selected site, gear, filter and date:
  - zenith in the centre, horizon at the edge;
  - north at the top, east on the left, the view you get looking up;
  - the compass points labelled.
- **Obstructions** are filled solid from the horizon profile around the rim.
  - Trees are shown leaf-off when the site's "trees bare" setting says so, matching how the planner reads the horizon (`heightAt`).
- **Targets** from tonight's list are plotted at their position for the chosen time and labelled by name.
- The **Moon** is plotted with its phase percentage while it's up.
- **Bright stars** are plotted as named dots so the owner can get their bearings against the real sky. They use the existing `BRIGHT_STARS` list from the compass calibration.
- A **time slider** runs from sunset to sunrise. Everything moves with it.
- **Tapping a target** opens its existing detail screen.

## Non-goals

- Knowledge of light sources: streetlights, town glow, marked "lit" directions. The owner said explicitly that they don't want this. They'll judge it themselves from the map.
- Any change to the ranking or to which targets are shown. The dome shows tonight's list, and nothing more is decided there.
- Hidden targets on the dome.
- A planetarium: no constellation lines, no faint stars, no Milky Way.
- Weather (Plan 3 part 3).
- Editing the horizon from the dome.

## Anti-goals

- The dome must never disagree with Tonight. It must use the same plan, date, site, gear and filter, and the same positions. Two copies of the controls that can drift apart would be a failure, which was the risk the owner accepted by choosing a separate tab.
- It must stay readable on a 390 px phone: labels must not pile into an unreadable clump.
- It must not need the network.

## Approaches considered (owner picked 2)

1. **A List / Dome switch on Tonight.** This was the designer's recommendation: it shares everything with the list for free. Not chosen.
2. **A new Sky tab** *(chosen)*. It is easy to reach. The cost is keeping its controls in step with Tonight, which this design handles by sharing state (below).
3. **The dome always shown above the list.** Rejected: it fills most of a phone screen and pushes the list down.

## Design

### Shared night selection

Site, gear and filter are already global (`appState.selected*`). The **date** and the **computed plan** live inside `Tonight.svelte` today. They move to shared state so that both tabs read the same ones:

- The date and the "date was picked by the user / follow the clock" behaviour move out of Tonight into a shared store. The existing behaviour stays the same and is still tested:
  - cold load from the `?date=` parameter or a `#target=…&date=` address;
  - following the clock across noon;
  - date picked.
- The plan for that selection is computed once and read by both tabs, so the dome's targets are exactly Tonight's list.
- The site / gear / filter / date controls become one shared component shown at the top of both tabs. Changing anything on either tab changes both.

### The map

- The projection is polar: radius proportional to `90° − altitude`, with azimuth around the circle. North is up and east is left.
  - Rings at 30° and 60° are drawn faintly and labelled.
  - The gear's minimum altitude (15°) is drawn as a dashed ring.
  - On an alt-az mount, the 80° limit is drawn as a small dashed circle round the zenith. It is not drawn on an equatorial mount.
- **Obstructions:** the region between the horizon edge and `heightAt(profile, az, treesBare)` is filled solid, all the way round. Seasonal (tree) ranges are drawn in a different shade so the owner can tell a roof from trees.
  - With no horizon saved, nothing is filled and a note says "No horizon saved for this site".
- **Targets:**
  - The dome plots the targets in tonight's list, the same ones in the same order as the Tonight rows.
  - Positions use the same `altAz` and precession the planner uses.
  - A target that is up but below the roofline or the minimum altitude at the slider time is drawn faint, so the owner can see what is about to rise or has just set. A target below 0° is not drawn.
  - Labels:
    - The top 10 targets carry their name on the phone; the rest are dots.
    - Tapping a dot shows its name and a "Details ›" link.
    - Labels are nudged so they don't overlap. *(The number 10 and the label placement are the builder's call; the rule is "no unreadable clumps at 390 px".)*
- **Moon:** a disc with its illumination percentage, drawn while it's above the horizon.
- **Bright stars:** small named dots from `BRIGHT_STARS`, drawn only when the Sun is below −6°. They are dimmer than the targets so they don't compete with them.
- **Sun:** not drawn. Before dark the slider still works, but a line says how long until dark.

### Time slider

- The range is sunset to sunrise on the same 5-minute grid the planner uses.
- Hour ticks are shown in the site's time zone, with the current slider time as a large readout.
- Twilight is shaded along the slider track, as on the altitude chart.
- **Starting position:**
  - "now" when tonight is the selected night and now falls in the night;
  - otherwise the start of the dark window.
- While the date follows the clock and the slider hasn't been touched, the slider moves with the clock. Once the owner drags it, it stays where they put it until the date changes.

### To the detail screen and back

- Tapping a target's "Details ›" opens the existing detail screen for that target and date.
- From the Sky tab, Back returns to the Sky tab with the slider where it was. Both the "‹" link and the phone's back gesture do this. The link reads "‹ Sky" in that case.
- The address carries where the detail was opened from. The exact format is the builder's call; today's `#target=<id>&date=YYYY-MM-DD` from Tonight keeps working unchanged.

## Constraints

- Svelte 5 runes, TypeScript strict, the existing dark-theme tokens from `src/app.css`.
- The map is SVG scaled to the card width, like the existing charts.
- Phone first: a 390 px viewport with no horizontal scroll. Tap targets are at least 32 px; a dot's tap area can be larger than the dot itself.
- Moving the slider must feel instant on an iPhone 12 Pro. That means about 30 targets, 20 stars and the Moon per step, which fits on the main thread. Positions may be precomputed per slider step for the night.
- It works offline, with no new network calls.
- All the numbers come from the same functions the planner and the detail screen use:
  - `altAz` / `precessToDate`;
  - `heightAt`;
  - `moonAltAz` / `moonIllumination`;
  - the night grid from `nightSeries` / `buildContext`.

## Calls made after the builder check (designer's calls; the owner can overrule)

1. **Which targets.** The dome plots the **top 30** of tonight's plan, in plan order, whatever Tonight's "Show more" is showing. The Tonight rows are the same targets in the same order, so the top 30 are always the first 30 rows. Labels go on the top 10.
2. **What counts as "faint".** A target is faint at a slider time exactly when the planner would not count that sample as usable:
   - below the gear's `minAltDeg`;
   - above its `maxAltDeg`;
   - or below the needed height (`neededHeight`: the horizon plus half the frame diagonal plus the clearance).
   
   This keeps the dome and the detail chart's highlighted stretch in agreement.
3. **Positions per step.** These are computed on the main thread from the same functions (`nightSeries`, or a shared multi-target helper built on the same grid and precession) when the night or the target list changes, and then read by index as the slider moves. The planner worker is unchanged.
4. **Shared state.** The new shared night store owns:
   - the catalogue load;
   - the date and the "picked by the user / follow the clock" logic;
   - the plan;
   - the planning and error states.
   
   Tonight keeps its own paging, scroll and detail state.
   - The Sky tab stays mounted while hidden, like Tonight and Sites, so its slider survives tab switches.
   - Sky shows the detail itself, using the same `TargetDetail` component, with its back link reading "‹ Sky".
5. **Address.** `#target=<id>&date=…` with no extra parameter keeps opening in Tonight, unchanged. A detail opened from Sky adds `&from=sky` and opens in the Sky tab.
6. **Slider and clock.** The slider follows the clock only while the date follows the clock, the slider is untouched and the page is visible. "Touched" resets whenever the selected night changes.
7. **Limit rings** come from the selected gear's `minAltDeg` and `maxAltDeg`. The 80° ring is drawn only when `maxAltDeg < 90`.
8. **Tree shading.** This reads the profile's existing per-degree `seasonal` flags. Leaf-off heights are used for them when the trees are bare, matching `heightAt`.

## Left to the builder

- How the shared date/plan store is shaped, and how the existing Tonight tests are kept green while it moves.
- How many labels to show, and how they are placed.
- Colours, ring styling and the tap pop-up's look, within the theme tokens.
- The address format for "opened from Sky".
