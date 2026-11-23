# Equatorial mount mode — short design

**Intent.** The owner's Seestar S50 Pro normally sits polar-aligned on a wedge. Alt-az is the exception. The planner treats it as alt-az only, so it cuts every target off at 80°, the alt-az zenith limit. That makes targets passing overhead look worse than they are.

**Goals.** A mount switch on the Gear page: Equatorial / Alt-az. It is remembered on the device. In equatorial mode the upper altitude limit is 90°, so there is no zenith cut-off. Tonight re-ranks straight away.

**Non-goals.** Exposure planning and field-rotation scoring: the app does not plan subs. Per-site or per-night mount choice. General gear editing: the Gear page otherwise stays read-only.

**Anti-goals.** Mount mode should not change anything else in the ranking. Minimum altitude, horizon, contrast and fit all stay as they are.

**Approaches considered.**
1. Gear-page switch. *Chosen by the owner*: the wedge is the default, so alt-az needs only an occasional tap.
2. Per-night switch on Tonight. Rejected: clutter on the main screen for a rarely changed choice.
3. Mount stored per site. Rejected: the setup doesn't follow the place.

**Design.**
- `Gear.mount` already exists (`'altaz' | 'eq'`). The Gear page shows a two-option switch on each gear card. Choosing an option sets `mount` and sets `maxAltDeg` to 80 for alt-az or 90 for equatorial, and saves through the existing store. That way the visibility code (`gear.maxAltDeg`) needs no change.
- The built-in Seestar keeps alt-az as the out-of-box default, because that is how it ships for other users. The owner flips it once and it stays flipped. Loading keeps the stored mount, and existing storage validation already accepts both values.
- The alt-az card carries one dim line: "Alt-az: tracking fails above 80° and the field rotates during long sessions." *(Builder's call.)*
- Tests: a unit test checks that the visibility window includes 80–90° altitude only in eq mode. Another checks that a store round-trip keeps the mount. An e2e test flips the switch and checks that a high-transiting target's usable hours change on Tonight.

**Changed from the chat proposal.** The chat proposal said the equatorial upper limit would be editable. Instead it is fixed at 90° and not editable, because the Gear page is read-only and the owner reported no pole-side limit. If the Seestar turns out to struggle near the pole on a wedge, that becomes a follow-up.

**Left to the builder.** Switch styling (segmented control in the existing dark theme) and the exact wording of the note.
