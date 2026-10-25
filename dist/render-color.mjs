import * as T from './vendor/three.module.min.js';
import {attachFloatDepth} from './render-depth.mjs';
// r180 allocates SRGB8_ALPHA8 for sRGB/UnsignedByte: framebuffer writes encode,
// texture sampling decodes to linear. Dark detail gets display-weighted precision
// without doubling the mobile target's bytes. The final shader still encodes once.
export function createFlightRenderTarget({hdr=false,floatDepth=false}={}){
 const target=new T.WebGLRenderTarget(1,1,{type:hdr?T.HalfFloatType:T.UnsignedByteType});
 target.texture.colorSpace=hdr?T.LinearSRGBColorSpace:T.SRGBColorSpace;
 // Only the colour feed is sampled; a multisampled depth never needs resolving.
 target.resolveDepthBuffer=false;
 return floatDepth?attachFloatDepth(target):target;
}
