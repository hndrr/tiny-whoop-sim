# Render performance log

Plan: [graphics-upgrade-plan.md](graphics-upgrade-plan.md).

## How to measure

Open `http://localhost:4173/?profile=1`. In the console, `tinyWhoopProfile.capture()` returns the most recently rendered frame, including frames rendered while paused:

- `sceneCalls`: draw calls of the scene render, including shadow-map draws
- `triangles`: triangles for the whole frame
- `renderSubmitMs`: CPU submission time for the scene and post passes
- `programs`: compiled shader programs
- `camera`: active camera (FPV or chase)

The poses are fixed. Each one sets `skyward.state` and stays paused. The heading is 0, so the camera looks toward +Y.

| Pose | Position | Notes |
|---|---|---|
| airfield | 0, 0, 1.2 | spawn on the runway |
| hangar | -42, 70, 3 | inside the north hangar |
| harbor | 1800, -420, 1.5 | over water, looking at the harbor |
| offshore | 0, -1400, 3 | open water, looking at the island |
| aloft | 0, -900, 300 | the whole island in view |
| ridge | -750, 1150, ground + 15 | forest ridge |

## What these numbers do and do not show

Draw calls and triangles do not depend on the hardware. Submit time is CPU time on a desktop (an Apple M5 running ANGLE Metal in the in-app Chromium browser), so it is not phone GPU time. These numbers do not measure phone frame rate.

## Baseline (before the graphics upgrade)

Viewport: 1280×720, DPR 1, `EXT_clip_control` available.

| Pose | FPV calls | FPV triangles | Chase calls | Chase triangles |
|---|---:|---:|---:|---:|
| airfield | 599 | 156k | 542 | 156k |
| hangar | 379 | 136k | 308 | 132k |
| harbor | 211 | 104k | 222 | 108k |
| offshore | 199 | 105k | 187 | 110k |
| aloft | 651 | 161k | 666 | 166k |
| ridge | 116 | 101k | 133 | 106k |

The first visit to the harbor stalled scene submission for 1408 ms. At that point, 7 new shader programs compiled; the program count went from 12 to 19.

## Phase 1: depth, draw order, culling, shadows, Lambert

Changes:
- **Depth.** Reversed float32 depth is used where the browser supports `EXT_clip_control`; logarithmic depth is the fallback, and `?depth=log` forces it. Log depth makes every fragment shader write `gl_FragDepth`, which turns off early depth rejection (and hidden-surface removal on iOS). Reversed depth keeps it on.
- **Canvas MSAA off.** The scene renders into its own feed target, so the canvas MSAA only ever applied to the full-screen post quad.
- **Draw order.** The sky draws after all opaque scenery and the ocean draws after land, so pixels they would cover underneath are rejected before shading.
- **Submerged terrain.** 187 of the 256 terrain patches lie entirely under the opaque sea surface (`terrainPatchMaxHeight`). They are no longer built.
- **Shadow updates.** The shadow map is redrawn on demand (`shadow-scheduler.mjs`): when the light frame re-centres on a whole-texel grid, when the chase airframe moves within 40 m of the ground, when the camera switches, or after a preview render. Shadows are no longer cast by the ocean, paving, floors or painted lines.
- **Program warm-up.** Both hangar light states are compiled at startup, with the feed target bound so the variants match the ones actually used. The first harbor visit no longer compiles 7 programs mid-flight; that compile took 1408 ms of submission time in the baseline.
- **Lambert.** Fully rough, non-metallic surfaces (terrain, grass, rocks, tree crowns and trunks) use Lambert instead of Standard materials.

| Pose | Calls (baseline → Phase 1) | Triangles |
|---|---:|---:|
| airfield FPV / chase | 599 → 547 / 542 → 504 | 156k → 153k |
| hangar FPV / chase | 379 → 327 / 308 → 272 | 136k → 132k |
| harbor FPV / chase | 209 → 148 / 220 → 174 | 104k → 97k |
| offshore FPV / chase | 199 → 113 / 187 → 120 | 105k → 92k |
| aloft FPV / chase | 651 → 582 / 666 → 610 | 161k → 152k |
| ridge FPV / chase | 116 → 80 / 133 → 110 | 101k → 99k |

Shadow-map passes dropped from one per frame to one per event. In FPV hover, the shadow map is drawn once.

Image parity was checked with headless Chrome (ANGLE Metal) screenshots against the baseline at the same poses. Mean luminance stays within 1% of the baseline at most poses. The exceptions:
- Terrain-dominated views (ridge, offshore) are 1–2.7% darker in the lower half, from Lambert. This is the removed GGX specular from fully rough terrain.
- The harbor view over water is about 2% brighter. The ocean is animated, so its waves are at a different phase in each screenshot.

FPV frames also carry the existing animated analog noise, which adds about 4.7 to the mean absolute difference.

## Phase 2: static batching, gate instancing, cargo detail, contact shading

Changes:
- **Static batching.** `static-batch.mjs` merges the static meshes in the airfield group and in each region group into one geometry per (material, shadow flags, 120 m cell). Positions, normals and the metre-scaled UVs are baked in. This is render-only; collision never reads meshes. Groups (gates, turbine rotors), instanced meshes and objects marked `userData.dynamic` are left alone.
- **Gate fixtures.** Gate posts, feet and dark bands now share their geometry and are drawn as three instanced meshes. Each gate ring stays a separate mesh, because each ring flashes its own material. Mission mode hides `gateFixtures` together with the rings.
- **Cargo surfaces.** Containers get corrugated cladding (16 ribs per 2 m tile, rain streaks and chalking) and crates get boards (six boards per 1.5 m tile, joints and grain). Each is a 128 px map/detail pair, about 87 KB per texture with mips. The material colour is divided by the map's mean linear albedo, so the authored average colour is unchanged.
- **Contact shading.** Each batched vertex stores its height above the base of its solid (`baseHeight`, linear, so interpolation is exact). Solids that stand on the ground are darkened down to 0.5 over their lowest metre. Slabs, beams, decks and lamps keep their albedo everywhere. The shading is applied to a clone of the material used only by the batches; painted textures that load later are copied onto the clone.

| Pose | Calls (baseline → Phase 1 → Phase 2) |
|---|---|
| airfield FPV / chase | 599 → 547 → 137 / 542 → 504 → 165 |
| hangar FPV / chase | 379 → 327 → 137 / 308 → 272 → 159 |
| harbor FPV / chase | 209 → 148 → 84 / 220 → 174 → 110 |
| offshore FPV / chase | 199 → 113 → 91 / 187 → 120 → 120 |
| aloft FPV / chase | 651 → 582 → 147 / 666 → 610 → 179 |
| ridge FPV / chase | 116 → 80 → 73 / 133 → 110 → 101 |

Chase captures can include that frame's shadow pass when the airframe moved. Mean luminance stays within 0.4% of Phase 1 at the airfield, hangar and harbor poses.

## Phase 3: screen-error terrain LOD, batched terrain, terrain shading

Changes:
- **Batched terrain.** `terrain-lod.mjs` builds only the 70 emerged 500 m patches and puts both levels of each into one `BatchedMesh`. All terrain draws as a single multi-draw call where `WEBGL_multi_draw` is available, and as a per-patch loop elsewhere. The `chunks` it returns keep `{x, y, near, far}` with visibility proxies, so the existing preview and test code still works.
- **LOD selection.** Each patch picks its level from a cost:

  > projected error = (far-mesh worst interpolation error at the near vertices) × (feed height / (2 tan(fov / 2))) / distance

  The far mesh's error is measured against its real triangle split. The threshold is 3 px, with ±20% hysteresis. Patches within 160 m of the camera are always near. Because the cost is in pixels, it does not depend on patch size, feed resolution or field of view. The rugged ridges keep fine geometry farther out; flat ground switches earlier. Near-patch counts in the CPU model: spawn 9 (the old 950 m rule gave 10), aloft 5 (2), ridge 20 (10).
- **Terrain shading.** Terrain shading is procedural, using no textures:
  - broad soil and vegetation variation at two scales (170 m and 47 m)
  - drier patches, and greener low-slope ground
  - rock blended onto steep facets, using the world-space face normal
  - a wet, darker shoreline band
  - an 11 m mid-scale tone near the camera

  The neutral grass grain fades to its exact mean linear value between 60 m and 380 m. That removes distant moiré and leaves average brightness unchanged.

| Pose | Calls (baseline → Phase 2 → Phase 3) |
|---|---|
| airfield FPV / chase | 599 → 137 → 78 / 542 → 165 → 112 |
| hangar FPV / chase | 379 → 137 → 80 / 308 → 159 → 109 |
| harbor FPV / chase | 209 → 84 → 25 / 220 → 110 → 65 |
| offshore FPV / chase | 199 → 91 → 22 / 187 → 120 → 52 |
| aloft FPV / chase | 651 → 147 → 79 / 666 → 179 → 114 |
| ridge FPV / chase | 116 → 73 → 36 / 133 → 101 → 70 |

The setup screen's eight area previews render correctly with the batched terrain and on-demand shadows.

## Phase 4: rocks, grass and tree crowns

Changes:
- **Rocks.** `nature-visuals.mjs` replaces the 77 single-icosphere rock meshes with four faceted boulder shapes. Each shape has welded per-corner displacement, a flat bed and a softened top. Each rock gets one colour per face, a darker buried base and light lichen on its upward faces. The rocks are drawn as four instanced meshes with per-instance grey tint. Placement uses the same seeded random stream with the same number of draws, so later scenery is unaffected; shape and tint come from a separate hash.
- **Wind.** Grass blades and tree crowns bend in proportion to height squared. The phase travels across the world, driven by the existing scene clock. A reduced-motion preference holds both still, including when the preference changes during flight.
- **Grass fade.** Grass blades collapse to zero size between 45 m and 70 m from the camera, so distant blades produce no fragments.

Before Phase 4, static batching had already merged the rocks into a few cell batches, so the call counts barely change: airfield FPV is 67 calls (78 in Phase 3), ridge FPV stays at 36. The change is the boulder shapes and the motion.

## Phase 5: atmosphere and sky

Changes:
- **Height fog.** `atmosphere.mjs` replaces three's four fog chunks before any program compiles. The exp² fog is unchanged in colour (`#b8c7ca`) and in sea-level density (0.00019). Its density along each ray is now the exact average of an exponential profile with a 700 m scale height, taken between eye and sample height. At sea level it matches FogExp2 exactly, and at drone height it matches within 0.2%. Looking down from altitude or across at height, the air is clearer.
- **Sun-side scattering.** Looking toward the sun warms the fog colour (cos⁸, 55%). The sun never moves, so its direction and colour are GLSL constants: there are no new per-material uniforms. World position is reconstructed in the vertex shader as Rᵀ·view + camera, with no matrix inverse.
- **Sky.** Three octaves of drifting value-noise cumulus replace the sine "cloud" blobs. The clouds have brighter cores and a brighter sun side, and they thin toward the horizon. The horizon dissolves into the same haze colour as the scenery (in the sky's sRGB authoring space). The sun disk and glow now use the light's actual direction. The sky still draws last, so covered pixels skip its noise.

Against Phase 3, the lower (ground) half of each frame is within 0.1% in luminance. The upper half is 3.5–4% brighter, which is the clouds.

## Phase 6: sea surface and rotor downwash

Changes:
- **Sea surface.** `ocean-surface.mjs` replaces the old two-sine shader and its 100×100 vertex displacement. That displacement used 800 m vertex spacing for 63 m waves, so it aliased completely; the new plane is a flat two-triangle quad.
- **Wave cut-off.** The fragment shader sums up to 16 dispersive exp-sine swells (10 on coarse-pointer devices). A wave whose number k times the pixel footprint makes it sub-pixel fades out, and the loop stops there. The footprint is `distance × pixel angle / cos(view)`, using the feed's actual height and FOV. In the CPU model, footprints of 0.1 m, 0.5 m and 3 m leave 16, about 9 and at most 3 bands, so distant water is cheap and never aliases.
- **Shading.** Shading includes:
  - Schlick Fresnel reflection of the same sky gradient and haze as the dome
  - a sun glint that broadens and dims as the footprint grows
  - swell height lightening the crests
  - coastal shallows from a CPU-baked 384² R8 depth map (0–8 m; the open sea floor is 6.6 m)
  - calmer swell in shallow water
  - moving surf where the bed meets the beach
  - the shared height fog
- **Colour convention.** Colours are display-authored and decoded once, as before. Collision and ditching still use the mean sea level.
- **Rotor downwash.** Open Water's ripple solver runs on a 256² half-float pair over a 24 m domain centred on the aircraft. The domain scrolls in whole texels, at least four at a time, and the solver steps at a fixed 60 Hz whatever the frame rate, at most two steps per frame. It runs only while the aircraft is within 4 m of the water and has not crashed, then lingers 3 s while the rings fade. A ditch adds one splash. At all other times there are no GPU passes. Turbulent impulses of either sign under the rotors radiate rings; a steady source would only hold a dimple. The gradient uses two-texel differences and is capped at slope 0.5, so the texel grid never shows up as a hard glint. Devices without float colour buffers skip this.

| Pose | Calls (Phase 5 → Phase 6) | Triangles |
|---|---|---|
| harbor FPV / chase | 25 / 65 → 25 / 65 | 97k → 74k / 103k → 79k |
| offshore FPV / chase | 22 / 52 → 22 / 52 | 99k → 77k / 111k → 84k |

The 20k ocean triangles are gone. Startup cost in Node: the coast map takes 26 ms and the terrain build 92 ms.

## Phase 7: airframes

Changes:
- **Ducts.** Each guard is one `LatheGeometry` duct: a thin wall with rounded bead lips at both ends. It replaces a cylinder plus two torus rims and keeps the same radius, z span and outer extent. The exact bounding box of all five frames is pinned in `test-airframes.mjs` and is unchanged. The 17-slice rotor clearance check still passes.
- **Materials.** Carbon, shell, duct, motor and lens use `MeshPhysicalMaterial`:
  - resin clear coat on carbon
  - glossy painted shells
  - satin ducts
  - metallic motor bells
  - a glass-like lens

  The flight copies reflect the shared static sky environment. The inspector previews use the same geometry and materials without the environment.
- **Flight baking.** `bakeVehicle` merges the static parts per material, and each prop's blades into one mesh. The airframe goes from 28–46 meshes to 8–9 visible meshes, and the shadow pass benefits too.
- **Prop blur.** While armed, each prop shows a translucent radial blur disc with faint blade ghosts instead of separate blades. Paused or crashed props show blades again.

Airfield chase calls dropped from 102 to 81.

## Phase 8: adaptive quality

`render-quality.mjs` turns frame time into a cost:

> cost = smoothed frame interval / display refresh interval

The refresh interval comes from the fastest tenth of early frames, snapped to 30/60/75/90/120/144/165/240 Hz. Because the cost has no units, the same thresholds work at any refresh rate and resolution.

| Level | Chase feed scale | Chase MSAA | Swell bands | Shadow map |
|---|---:|---:|---:|---:|
| high | 1.00 | 4× | 16 | 2048 |
| balanced | 0.85 | – | 12 | 2048 |
| medium | 0.72 | – | 10 | 1024 |
| low | 0.60 | – | 6 | 1024 |

How the level moves:
- **One step down** when the cost stays above 1.2 for 1.5 s.
- **One step up** after 5 s with the cost below 1.05. Frames that arrive on time count as headroom, so a vsync-capped device can climb.
- **Failed probe.** If a step up pushes the cost back over budget, the controller reverts and doubles the wait before trying that level again.
- **Minimum dwell.** At least 3 s pass between changes.
- **Ignored frames.** Paused, hidden and stalled (>250 ms) frames are not counted.

Coarse-pointer devices start at `balanced` and never use MSAA or a 2048 shadow map. FPV keeps its 576-line analog feed and never multisamples. `?quality=high|balanced|medium|low` pins a level.

The chase MSAA renders into the same float-depth feed target and does not resolve depth (`resolveDepthBuffer=false`). Changing level reallocates the feed only when its size or sample count actually changes.

Live check in headless Chrome at 60 Hz, unpaused chase flight at the airfield: cost 1.00, level `high`, RAF P50/P95 16.7/16.7 ms, 75 scene calls.

## Summary: baseline → final

Desktop, 1280×720, DPR 1:

| Pose | FPV calls | FPV triangles | Chase calls | Chase triangles |
|---|---:|---:|---:|---:|
| airfield | 599 → 67 | 156k → 131k | 542 → 71 | 156k → 140k |
| hangar | 379 → 70 | 136k → 120k | 308 → 72 | 132k → 127k |
| harbor | 209 → 25 | 104k → 74k | 220 → 34 | 108k → 81k |
| offshore | 199 → 22 | 105k → 77k | 187 → 21 | 110k → 85k |
| aloft | 651 → 65 | 161k → 135k | 666 → 69 | 166k → 143k |
| ridge | 116 → 36 | 101k → 77k | 133 → 39 | 106k → 89k |

Phone emulation, 390×844 at DPR 3, coarse pointer (so the DPR is capped at 1.25):

| Pose | FPV calls | Chase calls |
|---|---:|---:|
| airfield | 366 → 50 | 218 → 49 |
| harbor | 144 → 25 | 118 → 28 |
| aloft | 576 → 60 | 566 → 62 |

On the GPU side, these structural changes do not show up in the counts:
- early depth rejection is back on reversed-depth devices
- sky and sea pixels hidden behind scenery skip shading
- shadow passes run once per event instead of once per frame
- canvas MSAA no longer allocates memory it never used
- Lambert replaces GGX on the large rough surfaces
- swell bands are cut off by pixel footprint
- grass collapses beyond 70 m

None of this was measured on a physical phone. All numbers come from a desktop GPU running headless Chrome through ANGLE Metal, with the same harness for baseline and final. Real-device frame rate and feel still need checking on an iPhone.

## Graphics upgrade 2: video pass for CHASE and FPV

Plan: [graphics-upgrade-2-plan.md](graphics-upgrade-2-plan.md).

New modules:
- `feed-post.mjs`: the single video pass (glow, sun flare, depth of field, motion blur, grading, signal breakup)
- `exposure.mjs`: exposure adaptation in a 1×1 pass
- `signal-model.mjs`: link quality from range and line-of-sight obstruction
- `camera-motion.mjs`: camera shake, chase FOV and bank follow
- `airframe-effects.mjs`: rotor dust and contact shade

Look changes:
- **Analog feed in both views.** CHASE now runs the FPV analog chain at about 60% strength, as a second analog camera. FPV keeps its approved constants and adds rolling-shutter skew.
- **Signal breakup.** Range, hills and hangar walls between the pilot and the aircraft degrade the picture. Mild loss only adds grain.
- **Exposure and glow.** Exposure adapts through the 1×1 pass. Emissive surfaces mark themselves in feed alpha (sun, water glints, hangar lights, gate flash, LED underglow), and a sun glare and flare are drawn with depth occlusion.
- **Depth and motion.** CHASE softens distant scenery with depth of field. Motion blur is depth-aware. CHASE FOV widens with speed (72→82°), and both views get subtle shake.
- **FPV ducts.** The FPV view now shows the front ducts and the spinning-prop blur at the bottom edge, using a 6 mm near plane in reversed-depth mode only.
- **Ground effects.** Rotor dust over land below 1.2 m, a contact shade under low hovers, and tapered grass blades.
- **Shadow fix.** The shadow light frame is kept within 30 m of the ground. Without this, reversed depth darkened ground beyond the light's far plane at altitude.

Measurements (headless Chrome, 1280×720, against `83eacee`):
- Scene draw calls rose by 2–3 at each pose; the new parts are the FPV ducts and props, the LED and the dust.
- Live 60 Hz flight stays at cost 1.00 on the `high` level, P95 16.7 ms in both views.
- No physical-device measurement.
