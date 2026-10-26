# Original painted environment textures

Four original albedos were generated for this project with OpenAI's built-in image generator on 2026-10-06: worn warm concrete, muted blue-gray hangar metal, opaque olive foliage and umber bark. The brief uses economical, hand-painted late-1990s console-RPG environmental texture craft as a broad aesthetic. No reference images, downloaded stock scans or copied game assets were used. This is provenance, not a guarantee of exclusive copyright; no separate third-party asset license was accepted.

The original square production image was divided into its four exact quadrants, reduced to 256×256 with Lanczos filtering, and encoded at WebP quality86. No normal or roughness map was derived from the painting. Scalar roughness and the small existing procedural concrete bump remain artistic approximations, not measured PBR response. Exact source-image and runtime-file hashes, dimensions, bytes and processing notes are in `dist/assets/painted-manifest.json`.

## Tiling and color

These images did not have exactly matching opposite edges. They use mirrored repeat, never ordinary repeat: adjacent mirrored border pixels match, but bilateral motifs are visible, especially in the concrete cracks. The actual decoded 2×2 swatches were inspected. These are texture-pixel checks, not rendered game screenshots.

Concrete uses a 6m image span, white base tint and restrained .008 bump. Hangar roofing uses a 6m metre-scaled UV span, white base, .85 roughness and .15 metalness for weathered paint. Lighthouse and turbine cylinders use metre-scaled vertical UVs and even mirrored spans around their closed circumference; caps use planar UVs. The blue-gray/ochre surface color is in the image, not multiplied by a second dark colored material. Asphalt and natural terrain keep their separate materials. Natural terrain's earlier visibility correction remains in place.

Foliage remains opaque and instanced. Continuous crown-mass UVs and mostly neutral vertex brightness let the image supply its olive color once. Bark follows cylinder UVs along the trunk axis with a near-white material tint. Closed crown/trunk U coordinates span 0–2, so the nonperiodic image returns to the same mirrored edge around the seam. Tests cover 108 matching seam pairs. Geometry/instance buffers now total an estimated 266,904 bytes, excluding driver overhead and fallback-color CPU arrays. Species/instance variation is restrained; no alpha cards or new collision surfaces are introduced.

Each albedo is tagged sRGB and gets a mip pyramid, linear filtering, and anisotropy capped at2 on coarse-pointer devices /4 otherwise. Decode/load errors preserve the corresponding procedural or flat material. Images load asynchronously without blocking flight. Successful loads invalidate only the scenery-thumbnail cache; pending area/aircraft/mission choices and live state remain intact. Failed images do not leave unhandled rejections.

## Budget and verification

The four WebP files are 16,852 +9,412 +16,310 +20,194 =62,768 bytes in total. HTTP overhead and JS changes are additional. Compression reduces transfer, not decoded GPU storage. Conservative RGBA8 with all mip levels is349,524 bytes per image, or1,398,096 bytes for all four. Concrete replaces and disposes the old procedural albedo; therefore the net steady texture increase over the preceding surface/forest build is three maps,1,048,572 bytes (~1MiB), excluding driver/decoder overhead. The existing reflection atlas is shared and unchanged.

Tests verify file hashes/headers/dimensions, one sRGB color role per albedo, mirrored wrapping/filter caps, neutral material multipliers, old-map disposal, partial/full failure fallback, bounded geometry/UV behavior and thumbnail invalidation while pending choices remain uncommitted. Full gameplay and language regressions remain required. No calibrated rendered brightness, real-device FPS, touch behavior or GPU-driver compatibility can be established in the cloud's restricted WebGL environment. Private-test evaluation remains a gate before merge or production publication.
