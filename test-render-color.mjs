import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from './dist/vendor/three.module.min.js';
import {createFlightRenderTarget} from './dist/render-color.mjs';
const sdr=createFlightRenderTarget(),hdr=createFlightRenderTarget({hdr:true});
assert.equal(sdr.texture.type,T.UnsignedByteType);assert.equal(sdr.texture.colorSpace,T.SRGBColorSpace);
assert.equal(hdr.texture.type,T.HalfFloatType);assert.equal(hdr.texture.colorSpace,T.LinearSRGBColorSpace);
sdr.setSize(320,576);assert.equal(sdr.width*sdr.height*4,737280,'default color storage remains four bytes per pixel, excluding depth/driver overhead');
const linear=x=>new T.Color().setRGB(x,x,x,T.SRGBColorSpace).r;
const display=x=>new T.Color().setRGB(x,x,x,T.LinearSRGBColorSpace).convertLinearToSRGB().r;
const quantize=x=>Math.round(Math.max(0,Math.min(1,x))*255)/255;
const oldValues=new Set(),newValues=new Set();
let oldError=0,newError=0;
for(let code=1;code<=64;code++){
 const desired=code/255,input=linear(desired);
 const old=display(quantize(input));
 // SRGB8 attachment encodes before quantization; sampling automatically decodes.
 const corrected=display(linear(quantize(display(input))));
 oldValues.add(Math.round(old*255));newValues.add(Math.round(corrected*255));
 oldError+=Math.abs(old-desired);newError+=Math.abs(corrected-desired);
 assert(Math.abs(corrected-desired)<.01/255);
}
assert.equal(newValues.size,64);assert(oldValues.size<20);assert(newError<oldError*.001);
// Legacy sky/ocean colors are display-authored: decode to scene-linear before
// the attachment and final output transfer, preserving their old SDR appearance.
for(const value of [.035,.17,.22,.25,.38,.53,.59,.66,.69,.74,.78,.79,.89,.9,.91,1,2.7]){
 const expected=Math.min(1,value),sceneLinear=linear(expected),stored=quantize(display(sceneLinear)),sampled=linear(stored),result=display(sampled);
 assert(Math.abs(result-expected)<=.51/255);
}
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
assert(main.includes('const target=createFlightRenderTarget({hdr:colorManaged})'));
assert(main.includes('gl_FragColor=sRGBTransferEOTF(vec4(clamp(col,0.,1.),1.));}`});const skyDome'));
assert(main.includes('gl_FragColor=sRGBTransferEOTF(vec4(clamp(color,0.,1.),1.));}`});mesh(new T.PlaneGeometry(80000'));
assert.equal((main.match(/#include <colorspace_fragment>/g)||[]).length,1);
assert(main.indexOf('#include <colorspace_fragment>')<main.indexOf('float noise='));
assert(T.ShaderChunk.colorspace_pars_fragment.includes('vec4 sRGBTransferEOTF'));
const vendor=readFileSync(new URL('./dist/vendor/three.module.min.js',import.meta.url),'utf8');
assert(vendor.includes('e.SRGB8_ALPHA8:e.RGBA8'),'pinned renderer distinguishes byte storage transfer formats');
assert(vendor.includes('LinearSRGBColorSpace as F')&&vendor.includes('outputColorSpace:null===O?e.outputColorSpace:!0===O.isXRRenderTarget?O.texture.colorSpace:F'),'ordinary offscreen programs remain linear');
assert(vendor.includes('Pn.colorspace_pars_fragment,Ti("linearToOutputTexel",n.outputColorSpace)'),'ShaderMaterial receives the pinned transfer helpers');
const post=main.slice(main.indexOf('const postMat='),main.indexOf('bindBrightness(document'));assert(!post.includes('sRGBTransferEOTF'),'feed samples are hardware decoded, never decoded twice manually');
sdr.dispose();hdr.dispose();
console.log('PASS: sRGB8 default target/HalfFloat opt-in, unchanged SDR byte budget, dark ramp precision and legacy sky/ocean decode round-trip',JSON.stringify({oldDistinctShadowCodes:oldValues.size,newDistinctShadowCodes:newValues.size,oldMeanCodeError:oldError/64*255,newMeanCodeError:newError/64*255}));
console.log('CPU storage/transfer model and pinned-source checks only; GPU rendering, real sky appearance and mobile performance remain unverified');
