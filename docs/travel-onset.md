# Continuous high-air acceleration take-up

The previous high-air travel build (`f39a01155b706e138039b87e86f820e1a4a83af6`) combined an 80% stick threshold, a 0.4-second hold and a 1.2-second ramp. Its thrust and response multipliers compounded nonlinearly. WHOOP moved only 1.22 m/s at 0.4 seconds, then reached about 177.5 m/s² acceleration at 1.5 seconds: an objectively delayed surge even though individual formulas were continuous.

The revised model has no hold timer or delayed activation state. Travel demand increases smoothly across 45–100% stick and the existing terrain-clearance envelope. Gentle input at or below 45% retains the original force model even in clear high air. Positive horizontal-speed take-up is bounded by 90 m/s² and 110 m/s³ times the aircraft acceleration factor. Midpoint integration starts responding immediately and avoids a frame-rate-dependent launch ramp. The 20× world-speed limit and independent nominal speed indication are retained.

These are **positive horizontal speed take-up** bounds, not bounds on every acceleration vector or all braking jerk. Release, opposite input and hazard braking remain responsive. Tiny yaw/descent changes now fade the travel demand instead of resetting a timer; 15% downward throttle or 0.5 m/s downward motion fully removes assistance. Terrain/structure/boundary foresight remains authoritative. The broad stick range also makes partial-stick high-air travel faster than before, rather than packing most travel response into the final 20% of input.

## Measured WHOOP response

60 Hz frames, two physics substeps, full forward input, neutral throttle, 120 m AGL over open sea. Actual world movement is measured; the HUD retains its independent nominal model.

| Measure | Prior build | Revised |
|---|---:|---:|
| Peak positive acceleration from rest | 177.50 m/s² | 90.00 m/s² |
| Peak positive take-up jerk from rest | 264.30 m/s³ | 110.00 m/s³ |
| Speed at 0.25 s | 0.59 m/s | 3.44 m/s |
| Speed at 0.5 s | 1.73 m/s | 13.75 m/s |
| Speed at 1 s | 19.66 m/s | 53.18 m/s |
| Speed at 2 s | 166.38 m/s | 143.18 m/s |
| Speed at 4 s | 289.19 m/s | 279.94 m/s |
| Speed at 8 s | 318.72 m/s | 318.35 m/s |
| Distance after 8 s | 1,825.26 m | 1,794.91 m |
| Airfield→Harbor, 1,804 m | 7.93 s | 8.03 s |
| Harbor→Lighthouse, 3,669 m | 13.77 s | 13.87 s |

The two trip timings start already at safe altitude and exclude climb, descent and arrival braking. The new take-up removes about 49% of peak launch acceleration and 58% of positive launch jerk while adding only about 0.1 seconds to these measured trips. WHOOP's nominal indication after 8 seconds remains 14.83 m/s, regardless of the travel magnification.

After 20 seconds at fixed stick magnitude, clear high-air WHOOP speeds are:

| Stick | Prior | Revised |
|---|---:|---:|
| 40% | 4.42 m/s | 4.42 m/s |
| 50% | 5.57 m/s | 8.03 m/s |
| 60% | 6.74 m/s | 30.14 m/s |
| 75% | 9.25 m/s | 109.16 m/s |
| 80% | 10.35 m/s | 147.91 m/s |
| 85% | 45.85 m/s | 190.99 m/s |
| 90% | 135.26 m/s | 236.31 m/s |
| 100% | 319.95 m/s | 319.95 m/s |

## Verification

`test-travel-onset.mjs` covers all five aircraft at 30/60/144 Hz: immediate keyboard input, a two-second analog stick ramp, oscillation around the old 80% threshold, ascent through the clearance band without position edits, brief release/reapply, static threshold continuity and tiny positive/negative throttle/yaw changes. It checks the acceleration/positive-jerk bounds and retained >19× actual speed after eight seconds. WHOOP's eight-second displacement spread is about 3 mm across those frame rates.

Existing high-air, low-air, virtual-telemetry, reset/retry/teleport, collision, boundary and mission regressions remain in the aggregate suite. Independent review also verified bit-identical low-flight motion and shallow descents at 1%, 2.5%, 5% and 10% down input across every aircraft: assistance and excess speed are gone before low-clearance handling resumes. Established full-speed release/reverse braking distances remain the same as the preceding build.

No renderer, chase camera, shader, texture, geometry, HUD or vertical-flight changes are part of this patch. Maximum foresight/sweep work is unchanged, but its checks can now run for a wider range of high-air stick inputs. There are no new GPU passes or assets. Subjective flight feel and physical-device performance still require hands-on validation; numerical checks do not claim a visual/mobile playtest.
