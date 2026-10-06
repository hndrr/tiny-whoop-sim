# Progressive horizontal flight tuning

These measurements describe the retained close-range model. Clear high-air travel now adds a separate [smooth cruise envelope](high-altitude-cruise.md); the low-flight values below are unchanged.

This is arcade tuning, not a hardware simulation. The initial report of weak acceleration was not an immediate hard-cap bug: previous full-stick motion used constant thrust against linear drag, so its acceleration faded substantially after four seconds. The new curve reduces drag smoothly only above 65% right-stick deflection. Speed and distance are real physics values, not HUD scaling or camera effects. The 12%–65% input range retains familiar gentle response; near-neutral self-level assistance brakes drift, and opposing input provides braking before reversal.

The same circular right-stick envelope applies to keyboard, mouse, touch, physics and indicators. All aircraft share a horizontal speed-norm bound including climbing and boundary forces. Relative acceleration, turn response and speed tuning are unchanged. Vertical/descent behavior and missions were not modified.

## Baseline, full forward stick, neutral throttle (120 Hz)

| Aircraft | Speed at 1 / 2 / 4 / 8 seconds (m/s) | Distance at 1 / 2 / 4 / 8 seconds (m) | Cruise at 20 seconds (m/s) | Release: speed / distance after 2 seconds |
|---|---|---|---|---|
| WHOOP 75 | 3.663 / 6.641 / 9.754 / 11.535 | 1.688 / 6.963 / 23.833 / 67.432 | 11.885 | 5.191 m/s / 16.666 m |
| MICRO 65 | 3.923 / 6.748 / 9.354 / 10.540 | 1.868 / 7.341 / 23.915 / 64.501 | 10.694 | 3.905 m/s / 13.923 m |
| SCOUT 85 | 3.443 / 6.515 / 10.037 / 12.426 | 1.548 / 6.636 / 23.650 / 69.765 | 13.073 | 6.496 m/s / 19.356 m |
| RACER 90 | 4.232 / 7.684 / 11.369 / 13.560 | 1.957 / 8.054 / 27.650 / 78.728 | 14.025 | 6.282 m/s / 19.839 m |
| CINE 95 | 3.143 / 5.947 / 8.966 / 10.781 | 1.398 / 6.052 / 21.406 / 61.901 | 11.173 | 5.161 m/s / 16.132 m |

## New measured trajectory, 60 Hz frames with two substeps

| Aircraft | Speed at 1 / 2 / 4 / 8 seconds (m/s) | Distance at 1 / 2 / 4 / 8 seconds (m) | Release: speed / distance after 2 seconds | Reverse: stop time / forward travel |
|---|---|---|---|---|
| whoop75 | 3.828 / 7.290 / 11.542 / 14.831 | 1.715 / 7.369 / 26.672 / 80.845 | 1.544 m/s / 12.728 m | 1.617 s / 11.025 m |
| micro65 | 4.142 / 7.536 / 11.327 / 13.783 | 1.911 / 7.863 / 27.229 / 78.712 | 0.862 m/s / 9.931 m | 1.350 s / 8.297 m |
| scout85 | 3.571 / 7.058 / 11.652 / 15.706 | 1.564 / 6.959 / 26.105 / 82.335 | 2.398 m/s / 15.639 m | 1.883 s / 14.100 m |
| racer90 | 4.417 / 8.413 / 13.400 / 17.376 | 1.986 / 8.508 / 30.855 / 94.077 | 1.966 m/s / 15.357 m | 1.667 s / 13.337 m |
| cine95 | 3.273 / 6.492 / 10.538 / 13.791 | 1.416 / 6.382 / 23.842 / 73.854 | 1.637 m/s / 12.486 m | 1.717 s / 11.129 m |

Cruise bounds: 16.00 / 14.40 / 17.60 / 18.88 / 15.04 m/s, in the same aircraft order. This is approximately 35% faster than the old cruise speed, with a gradual approach under neutral throttle. Full throttle cannot bypass the norm bound.

## Verification scope

The acceleration regression covers all five aircraft, real velocity and travel, neutral and reverse braking, continuity around zero/12%/65% stick, precision input, keyboard/analog diagonal equivalence, climbing diagonal cap, boundary cap, and 30/60/144 Hz motion consistency. Existing mouse/touch pointer-handler parity tests remain in the profile suite. Midpoint attitude evaluation and trapezoidal displacement reduce straight-run frame-rate distance differences below 1 mm over eight seconds.

All seven existing mission controllers run using normal controls and real collision geometry at 30/60/144 Hz. Regional tests also cover both orbit directions, skilled 7 m/s circuits, and 640 boundary departure/transfer cases. These are numerical tests, not proof of subjective flight feel or human/mobile playability. No physical-device or hands-on feel validation is claimed.
