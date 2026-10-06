# Exaggerated world travel, nominal indicated speed

High-air travel deliberately exaggerates real movement through the world while the speed display follows an independent, drone-like nominal flight model. It is virtual telemetry, not the physical distance travelled per second. WHOOP's normal indicated horizontal bound remains 16 m/s (about 58 km/h); its clear-high-air world-travel bound is now 320 m/s, **20× normal travel**, rather than the previous 48 m/s. Positions, scenery flow, collisions, mission speed tolerances and navigation distances all use actual world movement. Only the HUD speed uses `indicatedSpeed`.

## Input, ramp and braking

- Low flight retains the original force, damping, control response and 16 m/s WHOOP bound. Nominal telemetry integrates this same unscaled control model independently of altitude assistance. Altitude changes do not multiply or divide the displayed speed
- Travel demand now grows continuously across 45–100% directional stick, with no dwell timer or delayed mode switch. Positive horizontal-speed take-up is limited to 90 m/s² and 110 m/s³ times the aircraft acceleration factor; release and safety braking stay responsive. See [onset measurements and input-transition tests](travel-onset.md). There are no new keys or menus
- The height blend still uses 30–90 m **usable clearance**. With the 4 m look-ahead terrain margin, full open-ocean/flat-ground travel begins at 94 m actual AGL; assistance starts above 34 m. Terrain elevation, roofs and overhead collision solids count. Absolute world Z does not
- Full travel multiplies thrust and its corresponding damping response by 2.4, approaching the 20× bound quickly rather than merely raising an unreachable speed cap
- Releasing directional input, opposing travel or full descent cancels assistance promptly. Small yaw/descent inputs reduce it continuously rather than toggling a timed boost: assistance reaches zero at 15% downward throttle or 0.5 m/s downward motion. Overspeed drag and a 240 m/s²×aircraft-factor recovery rate shed excess motion continuously. No instant velocity reset or teleport is used
- Reset, relocation and mission retry clear both travel intent and nominal velocity. Aircraft changes preserve ongoing movement while changing the profile bound. Crash indication becomes zero immediately, including crashes flagged by the swept-solid check outside FlightState

## Measured motion

60 Hz frames, two physics substeps, neutral vertical input, full forward stick,120 m AGL over open sea. Distances and actual speeds are world measurements. Indication is simulated independently.

WHOOP trajectory:

| Time | Actual speed | Indicated speed | Actual distance |
|---|---:|---:|---:|
|1 s|53.18 m/s|3.83 m/s|18.22 m|
|2 s|143.18 m/s|7.29 m/s|116.40 m|
|4 s|279.94 m/s|11.54 m/s|562.86 m|
|8 s|318.35 m/s|14.83 m/s|1,794.91 m|

After 30 seconds of continuous high-air input:

| Aircraft | Actual world bound | Nominal horizontal bound | Release: travel in 2 s / remaining speed | Reverse stop / forward overshoot |
|---|---:|---:|---:|---:|
|WHOOP 75|320.0 m/s|16.00 m/s|103.53 m /3.50 m/s|2.30 s /112.94 m|
|MICRO 65|288.0 m/s|14.40 m/s|78.46 m /1.94 m/s|1.92 s /84.69 m|
|SCOUT 85|352.0 m/s|17.60 m/s|131.69 m /5.46 m/s|2.68 s /145.33 m|
|RACER 90|377.6 m/s|18.88 m/s|126.12 m /4.48 m/s|2.38 s /137.84 m|
|CINE 95|300.8 m/s|15.04 m/s|101.39 m /3.65 m/s|2.40 s /110.98 m|

Release removes more than 98% of established world speed in two seconds. Stopping distance is still meaningful: the player must slow for arrival. Nominal indicated speed must not be used to estimate stopping distance in the exaggerated-travel zone.

## Cross-region travel

WHOOP starts at rest, already at a fixed safe altitude at least 110 m above the sampled route terrain/near-path collision solids. The pilot holds a normalized straight direction; timing ends on crossing the destination plane. **Climb, descent and final arrival braking are excluded.** There is no automatic altitude following or teleporting during these runs.

| Route | Distance | Original normal flight | Previous 3× build | Current 20× travel |
|---|---:|---:|---:|---:|
|Airfield→East Harbor|1,804 m|115.93 s|41.68 s|8.03 s|
|East Harbor→Lighthouse|3,669 m|232.49 s|80.54 s|13.87 s|

The retained baseline measurements are from `87ecb79c000d17dc774be3a4983b0f81c9a0c378`; the earlier 3×/fixed-camera source is `53b030a3753de196fc3c054ac6b07b9d0aa49cfb`. Current trip numbers are reproduced by `test-fast-travel.mjs` using actual controls and collision checks.

## Terrain, solids, turns and boundaries

Look-ahead distance now derives from stopping distance: 20 m +0.25 s of current travel +v²/(2×recovery deceleration). Both intended direction and current momentum are considered. Terrain samples are at most 8 m apart with a 4 m margin. All 235 collision-solid boxes use continuous padded XY corridors, so thin obstacles do not vanish between terrain samples. Outward assistance is withdrawn before the existing outer-boundary spring; the spring itself is unchanged.

Actual solid collision remains an exact swept segment after each physics substep. For fast steps exceeding 1 m horizontal displacement, terrain contact is additionally sampled at no more than 0.75 m intervals and the first detected contact bracket is bisected ten times. The flight stops at that contact. Ordinary low-speed steps retain the original terrain handling exactly. This guards high-speed crest crossing; it is still a sampled terrain sweep, not an analytic guarantee for arbitrary unmodelled geometry.

Turning cancels or reduces travel assistance according to the directional alignment and yaw input. Momentum remains continuous while scaled braking restores close-range motion. The player remains responsible for choosing a clear path; this is not automatic collision avoidance. Existing cosmetic rocks, vegetation and animated turbine blades remain outside solid collision geometry.

## Verification and performance limits

The suites cover all five aircraft at low/high altitude and 30/60/144 Hz; real travel; normalized analog/keyboard diagonals; release/reverse/descent; map edges/corners; terrain/roof/crane/bridge forecasts; swept thin-solid and intervening-crest impacts; reset/retry/relocation/teleport; aircraft switching; virtual telemetry parity, altitude continuity and crash/reset lifecycle; and actual-speed mission arrival checks. Independent review additionally compared low flight bit-for-bit with the immutable baseline at 20/30/60/144 Hz in sea, land and boundary scenarios; ran 105 terrain approaches and 25 descent cases; and found no blocking defect. All existing mission regressions remain required.

The HUD change is one speed-reference substitution. Camera behavior is separately integrated; camera motion and teleport detection must use actual world speed, never nominal indication. Actual travel can move up to 18.88 m per 50 ms rendered frame.

At ordinary maximum speeds, clearance work is bounded by 97 terrain queries and 470 precomputed box visits per physics substep when both paths differ. Fast terrain contact adds up to 16 sample queries, plus up to 11 refinement/contact-height queries only when contact is detected. Low-flight steps skip these added terrain samples. Box-height and slab rejection reduce average work. There is no new drawing, mesh or texture cost from this physics/telemetry patch, but CPU cost is increased. Existing forest LOD updates after 12 m of movement and terrain/scene coverage also change more frequently during fast travel. Device CPU, GPU, streaming feel, physical touch and subjective playability remain unmeasured. Cloud WebGL restrictions still prevent a genuine visual/mobile FPS claim.
