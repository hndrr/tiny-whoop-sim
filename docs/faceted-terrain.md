# Faceted terrain

The existing island is the mountain scenery. This change does not add backdrop
mountains, displace terrain, or change the physical height function. Its two main
ridges retain their original silhouette and navigable region plateaus.

## Visual design

- Flat lighting follows the existing triangle planes instead of interpolating
  smooth normals across them. The actual sun lights the faces; lighting is not
  painted into vertex colors.
- The existing 6-segment distant LOD has 83.3 m cells. Face-coherent colors make
  those large planes read together, without random triangle tints.
- A warm shore, muted olive meadow, and grey-earth upland blend continuously in
  linear color. A low-amplitude spatial wash has kilometre-scale variation.
  There are no hard altitude contour bands or new texture assets.
- Existing atmospheric fog, sky, sun, exposure, neutral grass detail, FPV signal
  effects, buildings, forest artwork, and all other materials are unchanged.

## Geometry and cost

All 512 existing near/far meshes retain exactly the prior triangle positions,
UVs and stitched edge heights. Their combined stored triangle count remains
313,344. This is not the visible per-frame triangle count. Near geometry remains
indexed and uses Three.js flat-shading derivative normals. Only the small distant
meshes are de-indexed for per-face colors and normals. Across the full world,
attribute/index storage increases by 1,770,496 bytes (1.69 MiB), excluding driver
allocation overhead. No new meshes, material groups, lights, shadows, texture
allocations, per-frame JavaScript work, or draw calls are introduced. Far stored
vertices increase from 12,544 to 55,296 (4.41×), and flat shading adds derivative/
cross-normal fragment computation. GPU work can increase; unchanged triangles
and draw calls do not establish unchanged frame time.

## Checks and limits

`test-terrain-visuals.mjs` checks every mesh against the previous height/UV
construction; exact near indices; finite, coherent distant normals/colors;
continuous altitude transitions; the numeric neutral-texture shadow floor; and
unchanged fog/light settings. `test-ground-output.mjs` samples the actual exported
palette rather than the previous hardcoded colors. Existing collision, missions,
spawn, water, input, and flight tests remain applicable.

Numeric color checks are not rendered pixels. A CPU geometry illustration may
help inspect the faceting, but is not an in-game screenshot. Browser/WebGL visual
approval, LOD transition appearance in motion, and mobile frame-time measurements
remain unverified in this environment. The existing coarse LOD's physical/rendered
height approximation is preserved, not repaired or claimed to be exact between
mesh vertices.
