# Airfield surface pass

Source baseline: main merge `986af821dd663e45fb709ac545d890bc47ab6e6c` (same tree as reviewed PR5 head `6350d9f`). This pass does not change flight physics, collisions, gate positions, missions, selector state, localization, or HTML/CSS.

## Authorship and material choice

`dist/surface-patterns.mjs` is original deterministic procedural artwork, authored for this project. There are no downloaded image assets, stock photos, Megascans/Fab assets, generated-image service outputs, new dependencies, or new asset-license acceptance. Its multiscale periodic noise creates gravel/aggregate, concrete pores and restrained broad variation. Generated texture pixels were inspected as PNGs in the preparation workspace; this is not a screenshot of the game.

Two surfaces each use one 256×256 RGBA albedo and one 256×256 grayscale detail texture. Albedo is sRGB; detail is linear/no-color-space. One detail texture is shared by roughness and bump inputs. These are deliberately correlated art-directed roughness/bump variations, not measured PBR scans or normals inferred as physical truth from a photograph. Bump is shading only: it never displaces a runway, wall or collision surface. Metre-based box UVs avoid stretching a small noise map over a whole runway. Asphalt repeats at 4 m, concrete at 3 m. The old global random sequence is advanced by its original 65,536 asphalt samples to preserve subsequent trees, vegetation and rocks.

The shared stage material palette applies these surfaces to matching regional floors/walls too. Geometry and collision placement remain unchanged. Existing box geometry is pooled by dimensions/UV scale; untextured boxes share one unit box. Existing trees and grass remain instanced, terrain near/far meshes and distance culling remain unchanged.

## Reflections and output

A 256×128 self-authored analytic sky produces a single static PMREM for roof, steel and tower glass only. Its +Y texture sky is rotated to the game's +Z world. No dynamic cube-camera, reflective render pass per frame, SSR, ray tracing, HDR image download or new light is added. `EXT_color_buffer_float` gates PMREM; unsupported devices retain their current direct-light material response. A generation failure restores renderer target, cube face, mip level, XR and autoClear state, and disposes captured temporary targets. The successful PMREM lives with the one-page scene.

The current r180 render-to-texture flight path bypasses material tone mapping; its custom final shader has no output transform. Changing that by default without actual rendered visual QA would be unsafe. Therefore this pass preserves the existing default ACES/exposure settings and feed/brightness behavior. The separately gated `?colorPipeline=1` experiment uses a HalfFloat linear scene target and applies `<tonemapping_fragment>` then `<colorspace_fragment>` once in the final output. It is enabled only when float color buffers are supported. It is not the default or a claim of visually verified improvement. UI brightness never changes. No photographic/UE-level fidelity is promised.

## Mobile and memory budget

Measured source payload versus the baseline: +7,851 raw bytes, or +3,633 bytes when each changed/new runtime JS file is gzip-compressed at level 9. These are local encoding measurements; actual CDN headers/compression may differ.

No image files need network transfer: four RGBA maps are generated from the small JS module at startup. PNG reference encodings in preparation measured 69,213 + 34,295 + 73,109 + 57,862 = 234,479 bytes, but these files are not shipped. They are lossless preview encodings, not GPU-compressed textures.

Each 256 RGBA8 texture including its full mip chain is `4 × (256² + 128² + ... + 1) = 349,524 bytes`. Four maps use 1,398,096 bytes (1.333 MiB) of estimated texture storage; replacing the old one-map asphalt subtracts 349,524, for a net 1,048,572-byte increase. Grass's existing map is unchanged. The CPU typed arrays total 1,048,576 bytes, retained by Three for context restoration. This excludes driver overhead and geometry.

Pinned r180 maps the 256-wide equirect image to cube size 64 and a 336×256 CubeUV RGBA16F atlas: `336 × 256 × 8 = 688,128 bytes` (0.656 MiB), no mip chain or depth buffer. A same-size temporary ping-pong atlas and a 131,072-byte source texture exist only during initialization and are disposed. Estimated net steady texture increase is therefore 1,736,700 bytes (~1.656 MiB), before driver overhead. The environment is not multiplied by the three materials that share it.

Coarse-pointer anisotropy is capped at 2 (desktop 4). Existing 1.25 mobile / 1.75 desktop pixel-ratio ceilings, 1024 / 2048 shadow map limits, and the FPV 576-pixel target-height ceiling are preserved. No extra recurring render pass is added. Bump adds shader work; the four maps and static reflection do have a cost. This is a budget, not a measured frame rate.

The opt-in HalfFloat color experiment adds `width × height × 4` bytes versus RGBA8 at the scene target's actual dimensions; default memory is unchanged. Shadow/depth/driver allocations are additional and device-dependent.

## Profiling and validation gate

Use `?profile=1` on an authorized WebGL-capable test device, fly a fixed outside→hangar→runway route in FPV and chase, then read `tinyWhoopProfile.snapshot()` in the console. Its bounded 300 active-flight samples report RAF P50/P95 intervals, visible-flight stalls over 250 ms, CPU render-submission duration, renderer-reported scene/post draw calls and triangles, and allocated texture/geometry counts. These are not GPU timings; draw counters do not promise full shadow-pass accounting. No data leaves the browser. `reset()` clears samples. There is no debug text in the game UI.

Compare baseline and this pass on the same device, route, viewport, brightness and thermal state after warming shader compilation. Record target dimensions, actual pixel ratio, 30-second samples, draw/texture counts, and opening/closing Setup repeatedly. Test iOS Safari and Android Chrome, portrait/landscape, FPV/chase, all eight area thumbnails, all five aircraft, seven missions, English/Japanese, pending choice Cancel/Escape and completion dialogs. Check shallow viewing angles for texture shimmer, hangar readability at 60/100/180% brightness, runway z-fighting, and reflective sky orientation.

The cloud browser's graphics policy disables the required GL capability. No bypass or user-computer browser is used. Node geometry/state tests and inspected texture pixels cannot establish rendered quality, shader driver compatibility, touch behavior or FPS. Default deployment should stay review-gated until real WebGL visual verification is possible.

If actual device measurements miss the acceptable frame budget, first lower texture anisotropy to 1 and remove bump maps on a tested low tier. Then reduce shadow map/update cost or chase target resolution. Dynamic adaptive quality is deferred until those thresholds are measured; no unmeasured timing heuristic changes visuals or gameplay in this pass.
