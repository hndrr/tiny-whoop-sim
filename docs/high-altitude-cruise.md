# High-altitude travel assistance

This is intentionally game-like **actual horizontal flight speed**. It does not change world scale, HUD units, FOV, camera animation, missions, vertical flight, or collision geometry. Holding a strong directional input in clear high air builds up to **three times the original horizontal speed**. There is no extra key or setting.

## Envelope and controls

- The original close-range model is retained, including full-stick damping 0.335, the WHOOP 16 m/s horizontal limit, gentle input and release/reverse braking
- Assistance requires more than 80% right-stick magnitude and sustained consistent travel: a 0.65 s delay followed by a 1.85 s smooth ramp. Keyboard, mouse and touch use the same normalized circular envelope
- The smooth height blend starts at 30 m **usable clearance** and reaches full strength at 90 m. Clearance is relative to terrain/sea and collision-solid tops, not absolute world Z. Look-ahead terrain receives a 4 m margin, so unobstructed level terrain typically needs 34–94 m actual AGL
- Look-ahead extends 20 m plus 2.5 seconds of current horizontal travel. Terrain is sampled at intervals no greater than 8 m. Collision solids use a continuous XY corridor padded by 8 m, including thin beams, overhead decks and roofs. During steering, both intended travel and existing momentum paths are considered
- Release, descent input, established downward motion, opposing travel and strong yaw remove travel assistance. Small corrections retain the original force model. Input release does not latch a cruise mode
- Existing excess speed is shed continuously, rather than snapped to a lower cap. The recovery speed limit falls at 18 m/s² times the aircraft acceleration factor; normal drag/reverse braking may slow faster. Pilots must still brake and steer for arrival
- Reset, relocation, mission retry, aircraft switching and direct position discontinuities discard stored cruise intent. Pause freezes the state; normal input clearing cancels assistance on resume

## Measured speed

Measured using the actual FlightState update with 60 Hz frames and two physics substeps, neutral vertical input, constant full directional stick, open sea at 120 m AGL. Rounded values:

| Aircraft | Original bound | High bound | High speed after 8 s | Release distance in 2 s from settled high cruise | Reverse stop / forward travel |
|---|---:|---:|---:|---:|---:|
| WHOOP 75 | 16.00 m/s | 48.00 m/s | 43.072 m/s | 36.99 m | 2.62 s / 42.95 m |
| MICRO 65 | 14.40 m/s | 43.20 m/s | 40.373 m/s | 28.81 m | 2.18 s / 32.24 m |
| SCOUT 85 | 17.60 m/s | 52.80 m/s | 45.267 m/s | 45.59 m | 3.05 s / 55.20 m |
| RACER 90 | 18.88 m/s | 56.64 m/s | 50.369 m/s | 44.74 m | 2.70 s / 52.29 m |
| CINE 95 | 15.04 m/s | 45.12 m/s | 40.001 m/s | 36.05 m | 2.75 s / 42.58 m |

All five aircraft shed over 85% of cruise speed within 2 seconds of releasing directional input. The longer braking distance at high speed is intentional and remains player-controlled. Maximum bounds apply to the full horizontal norm, including diagonals, climbing and boundary forces. A shrinking envelope can temporarily leave speed above the local low-flight bound while it decelerates, but never boosts past the overall high-flight bound under ordinary input.

## Actual inter-region travel comparison

Compared with immutable baseline `87ecb79c000d17dc774be3a4983b0f81c9a0c378`. WHOOP 75, 120 Hz physics, starting at rest on a straight path. Each pair uses the same fixed world altitude, at least 110 m above the highest sampled terrain/near-path collision solid. Timing stops on crossing the destination plane. These figures **exclude initial climb, final descent and arrival braking**; no automatic altitude following or teleporting occurs during a measured trip.

| Route | Distance | Before | After | Time saved |
|---|---:|---:|---:|---:|
| Airfield → East Harbor | 1,804 m | 115.93 s | 41.68 s | 64.0% |
| Airfield → North Quarry | 2,442 m | 155.80 s | 54.97 s | 64.7% |
| East Harbor → Lighthouse | 3,669 m | 232.49 s | 80.54 s | 65.4% |
| Airfield → Offshore | 1,400 m | 90.68 s | 33.27 s | 63.3% |
| Ridge Viaduct → West Wind Ridge | 992 m | 65.20 s | 24.77 s | 62.0% |

At full open-air cruise an 8 km crossing is about 167 seconds before launch/braking overhead, rather than about 500 seconds; profile differences remain proportional. Flying low or repeatedly turning/descending still takes longer.

## Verification and limits

The new regression covers all five aircraft at low/high altitude and 30/60/144 Hz, real displacement, diagonal/keyboard parity, climbing/boundary limits, release/reverse/descent, precision input, overhead and forward solids, rising terrain, reset/retry/relocation/teleport, aircraft change and pause. Existing low-flight acceleration/profile tests now run over low open sea instead of using an arbitrary world Z of 500 m. Their original speed assertions are retained. Thirty seconds of mixed low-flight commands matched the immutable baseline bit-for-bit across all five aircraft at all three frame rates. Independent 10-second high-flight tests found a worst frame-rate position spread below 1 mm.

The complete existing mission and geometry suite remains required. Numerical route checks establish reachability and physics behavior; they do not prove human playability.

This is assistance, **not automatic collision avoidance**. Terrain foresight is sampled with a conservative margin, not an analytic swept terrain collision test. Existing cosmetic vegetation/rocks and turbine blade animation remain outside collision-solid geometry. No WebGL flight, subjective hands-on control, physical touch or mobile FPS claim is made: the cloud browser GPU restriction still blocks those checks. Additional CPU work is conditional on sustained strong input above the clearance threshold; it scans 235 precomputed collision boxes per path (at most 470 box visits per substep), rejecting boxes below the terrain envelope and using early slab rejection on the others. At the fastest aircraft's ordinary maximum speed it queries at most 43 terrain points per substep: the current point plus 21 on each path when both paths differ. No additional draw calls, meshes, textures or camera effects are introduced; device CPU cost remains unmeasured.
