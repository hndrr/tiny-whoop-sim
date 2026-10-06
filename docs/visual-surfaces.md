# Airfield surface pass

Source baseline: main merge `986af821dd663e45fb709ac545d890bc47ab6e6c` (same tree as reviewed PR5 head `6350d9f`). This pass does not change flight physics, collisions, gate positions, missions, selector state, localization, or HTML/CSS.

## Initial procedural foundation

The later generated-image increment is documented in [painted-art.md](painted-art.md). It replaces the concrete albedo and adds hangar/forest images; the discussion below records the procedural foundation.

`dist/surface-patterns.mjs` is original deterministic procedural artwork, authored for this project. That initial foundation used no downloaded image assets, stock photos, Megascans/Fab assets, generated-image service outputs, new dependencies, or new asset-license acceptance. Its multiscale periodic noise creates gravel/aggregate, concrete pores and restrained broad variation. Generated texture pixels were inspected as PNGs in the preparation workspace; this is not a screenshot of the game.

Two surfaces each use one 256×256 RGBA albedo and one 256×256 grayscale detail texture. Albedo is sRGB; detail is linear/no-color-space. One detail texture is shared by roughness and bump inputs. These are deliberately correlated art-directed roughness/bump variations, not measured PBR scans or normals inferred as physical truth from a photograph. Bump is shading only: it never displaces a runway, wall or collision surface. Metre-based box UVs avoid stretching a small noise map over a whole runway. Asphalt repeats at 4 m, concrete at 3 m. The old global random sequence is advanced by its original 65,536 asphalt samples to preserve subsequent trees, vegetation and rocks.

The shared stage material palette applies these surfaces to matching regional floors/walls too. Geometry and collision placement remain unchanged. Existing box geometry is pooled by dimensions/UV scale; untextured boxes share one unit box. Existing trees and grass remain instanced, terrain near/far meshes and distance culling remain unchanged.

## Reflections and output

A 256×128 self-authored analytic sky produces a single static PMREM for roof, steel and tower glass only. Its +Y texture sky is rotated to the game's +Z world. No dynamic cube-camera, reflective render pass per frame, SSR, ray tracing, HDR image download or new light is added. `EXT_color_buffer_float` gates PMREM; unsupported devices retain their current direct-light material response. A generation failure restores renderer target, cube face, mip level, XR and autoClear state, and disposes captured temporary targets. The successful PMREM lives with the one-page scene.

The original r180 render-to-texture flight path bypassed material tone mapping and sent linear pixels to the display without an output transfer. After stage-specific reports of unreadable natural ground, the default path now performs one sRGB output conversion. It does not increase exposure or light intensities. The conversion occurs after feed sampling/chromatic blur and before display-space FPV vignette/noise/scanlines and the brightness gain, avoiding amplification of analog noise in dark pixels. The separately gated `?colorPipeline=1` experiment uses a HalfFloat scene target and applies ACES before that same single sRGB conversion; it is not the default. UI brightness never changes. Actual rendered validation remains necessary, especially because sky/ocean pixels also receive the output correction. No photographic/UE-level fidelity is promised.

## Mobile and memory budget

Initial surface commit source payload versus its baseline: +7,851 raw bytes, or +3,633 bytes when each changed/new runtime JS file is gzip-compressed at level 9. These are local encoding measurements; actual CDN headers/compression may differ.

For the initial procedural foundation, no image files needed network transfer: four RGBA maps are generated from the small JS module at startup. PNG reference encodings in preparation measured 69,213 + 34,295 + 73,109 + 57,862 = 234,479 bytes, but these files are not shipped. They are lossless preview encodings, not GPU-compressed textures.

Each 256 RGBA8 texture including its full mip chain is `4 × (256² + 128² + ... + 1) = 349,524 bytes`. Four maps use 1,398,096 bytes (1.333 MiB) of estimated texture storage; replacing the old one-map asphalt subtracts 349,524, for a net 1,048,572-byte increase. Grass retains its existing 256px allocation, UV scale and random-sample count, but now uses neutral light detail instead of a second dark green/brown tint. The CPU typed arrays total 1,048,576 bytes, retained by Three for context restoration. This excludes driver overhead and geometry.

Pinned r180 maps the 256-wide equirect image to cube size 64 and a 336×256 CubeUV RGBA16F atlas: `336 × 256 × 8 = 688,128 bytes` (0.656 MiB), no mip chain or depth buffer. A same-size temporary ping-pong atlas and a 131,072-byte source texture exist only during initialization and are disposed. Estimated net steady texture increase is therefore 1,736,700 bytes (~1.656 MiB), before driver overhead. The environment is not multiplied by the three materials that share it.

Coarse-pointer anisotropy is capped at 2 (desktop 4). Existing 1.25 mobile / 1.75 desktop pixel-ratio ceilings, 1024 / 2048 shadow map limits, and the FPV 576-pixel target-height ceiling are preserved. No extra recurring render pass is added. Bump adds shader work; the four maps and static reflection do have a cost. This is a budget, not a measured frame rate.

The opt-in HalfFloat color experiment adds `width × height × 4` bytes versus RGBA8 at the scene target's actual dimensions; default memory is unchanged. Shadow/depth/driver allocations are additional and device-dependent.

## Profiling and validation gate

Use `?profile=1` on an authorized WebGL-capable test device, fly a fixed outside→hangar→runway route in FPV and chase, then read `tinyWhoopProfile.snapshot()` in the console. Its bounded 300 active-flight samples report RAF P50/P95 intervals, visible-flight stalls over 250 ms, CPU render-submission duration, renderer-reported scene/post draw calls and triangles, and allocated texture/geometry counts. These are not GPU timings; draw counters do not promise full shadow-pass accounting. No data leaves the browser. `reset()` clears samples. There is no debug text in the game UI.

Compare baseline and this pass on the same device, route, viewport, brightness and thermal state after warming shader compilation. Record target dimensions, actual pixel ratio, 30-second samples, draw/texture counts, and opening/closing Setup repeatedly. Test iOS Safari and Android Chrome, portrait/landscape, FPV/chase, all eight area thumbnails, all five aircraft, seven missions, English/Japanese, pending choice Cancel/Escape and completion dialogs. Check shallow viewing angles for texture shimmer, hangar readability at 60/100/180% brightness, runway z-fighting, and reflective sky orientation.

The cloud browser's graphics policy disables the required GL capability. No bypass or user-computer browser is used. Node geometry/state tests and inspected texture pixels cannot establish rendered quality, shader driver compatibility, touch behavior or FPS. Default deployment should stay review-gated until real WebGL visual verification is possible.

If actual device measurements miss the acceptable frame budget, first lower texture anisotropy to 1 and remove bump maps on a tested low tier. Then reduce shadow map/update cost or chase target resolution. Dynamic adaptive quality is deferred until those thresholds are measured; no unmeasured timing heuristic changes visuals or gameplay in this pass.

## Natural-ground visibility correction

Concrete has a white material multiplier, while the original natural ground combined dark sRGB vertex hues with another dark sRGB grass map. This made region-specific terrain far darker than the readable concrete paths. The grass detail now ranges from neutral 210–234 RGB; terrain vertex hues supply color once. Terrain geometry/normals, lighting, fog and exposure remain unchanged. The common sRGB output fix is a separate correction, not the sole explanation of the stage-specific contrast.

`test-ground-output.mjs` runs the actual grass generator and checks all eight region spawn locations and neighboring underlying terrain/water paths. These are material-path and transfer-function tests, not visibility ray casts or screenshots: built surfaces can cover underlying terrain. Offshore uses the ocean shader; natural harbor/lighthouse/windfarm ground uses the darker meadow vertex hue; elevated viaduct/village/quarry terrain uses the ridge hue. Concrete's albedo and white multiplier are unchanged.

At an explicitly representative diffuse factor of 0.45, the old meadow hue × grass albedo produces display codes [3,5,1] at 100%, or [5,9,1] even at 180%. Neutral detail plus correct display transfer produces [59,70,41] at 100%. These numeric examples explain loss of detail; they are not measured scene pixels or a promise that every lit/shadowed surface has that luminance. Global lights/exposure were not increased.

## FPV signal after the ground correction

User feedback on the private build found the brighter corrected scene too clean. The painted images were not deployed at that point. The prior ground fix kept the old analog effect constants, but the same absolute noise is less prominent over a brighter scene. This increment tunes only the FPV signal, independently from any low-resolution painted texture style:

- Chromatic sample offset: .0013 → .0022 UV
- Horizontal softening blend: .16 → .22, still only in FPV
- Display-space grain amplitude: .026 → .065 (approximately ±8.3 display code levels before scan modulation at100% gain)
- Scan modulation: previously0…−1.5%; now±3% around a mean of1, avoiding a new global darkening

Barrel distortion .095, vignette .16, the576-pixel FPV target-height cap, and chase resolution remain unchanged. The scene still receives one correct sRGB display conversion before the analog signal. Brightness remains after that signal. Chase does not receive noise, chroma shifts, softening, scanlines or vignette. No PS-style full-screen pixel filter is introduced.

`test-fpv-signal.mjs` reads the actual shader constants and checks FPV guards, clean chase, centered modulation and preserved output order. These numerical/source checks do not establish that the user will prefer the new analog feel; private-device feedback remains necessary. Terrain's neutral-detail fix and global lights/exposure are unchanged.
