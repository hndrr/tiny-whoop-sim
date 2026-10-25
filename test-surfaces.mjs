import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from './dist/vendor/three.module.min.js';
import {SIZE,sample,pixels,meanLinearAlbedo} from './dist/surface-patterns.mjs';
import {createSurfaceMaterials,surfaceBoxGeometry,createSkyEnvironment} from './dist/surface-materials.mjs';
import {createRenderProfile} from './dist/render-profile.mjs';
assert.equal(SIZE,256);
for(const kind of ['asphalt','concrete']){
 for(const t of [0,.13,.43,.72,1]){assert.deepEqual(sample(kind,0,t),sample(kind,1,t));assert.deepEqual(sample(kind,t,0),sample(kind,t,1))}
 for(const data of [false,true]){const a=pixels(kind,data);assert.equal(a.length,256*256*4);assert.deepEqual(a,pixels(kind,data));for(let i=0;i<a.length;i+=4){assert.equal(a[i+3],255);if(data){assert.equal(a[i],a[i+1]);assert.equal(a[i],a[i+2])}}}
}
const renderer={capabilities:{getMaxAnisotropy:()=>16},extensions:{has:()=>false}};
// Cargo cladding and crate boards add two 128px map/detail pairs; their colour is
// divided by the map's mean albedo so authored average brightness is kept.
for(const kind of ['corrugated','planks']){for(const t of [0,.13,.43,.72,1]){assert.deepEqual(sample(kind,0,t),sample(kind,1,t));assert.deepEqual(sample(kind,t,0),sample(kind,t,1))}const a=pixels(kind,false,128);assert.equal(a.length,128*128*4);const mean=meanLinearAlbedo(a);assert(mean>.4&&mean<.9)}
const mobile=createSurfaceMaterials(renderer,{coarse:true});assert.equal(mobile.textures.length,8);
for(const [mat,kind,color] of [[mobile.container,'corrugated','#6b827b'],[mobile.crate,'planks','#8c704b']]){const expected=new T.Color(color).multiplyScalar(1/meanLinearAlbedo(pixels(kind,false,128)));assert(Math.abs(mat.color.r-expected.r)<1e-9&&Math.abs(mat.color.g-expected.g)<1e-9);assert.equal(mat.map.image.width,128);assert(mat.userData.tileMeters>0)}
for(const texture of mobile.textures){assert.equal(texture.anisotropy,2);assert.equal(texture.wrapS,T.RepeatWrapping);assert.equal(texture.minFilter,T.LinearMipmapLinearFilter);assert.equal(texture.generateMipmaps,true)}
for(const mat of [mobile.asphalt,mobile.concrete]){assert.equal(mat.map.colorSpace,T.SRGBColorSpace);assert.equal(mat.roughnessMap.colorSpace,T.NoColorSpace);assert.equal(mat.bumpMap,mat.roughnessMap);assert.equal(mat.metalness,0);assert(mat.bumpScale<=.025)}
assert.equal(createSkyEnvironment(renderer),null,'unsupported float environment is a safe no-op');
const desktop=createSurfaceMaterials(renderer);assert(desktop.textures.every(t=>t.anisotropy===4));
const geo=surfaceBoxGeometry([23,125,.05],4),uv=geo.attributes.uv,normals=geo.attributes.normal;
for(let face=0;face<6;face++){const i=face*4,nx=Math.abs(normals.getX(i)),ny=Math.abs(normals.getY(i)),us=[0,1,2,3].map(k=>uv.getX(i+k)),vs=[0,1,2,3].map(k=>uv.getY(i+k));assert(Math.abs(Math.max(...us)-(nx>.5?.05:23)/4)<1e-6);assert(Math.abs(Math.max(...vs)-(ny>.5?.05:125)/4)<1e-6)}
const profiler=createRenderProfile(3);assert.deepEqual(profiler.snapshot(),{samples:0});for(const frameMs of [16,20,30,40,50])profiler.record({frameMs,renderSubmitMs:2,sceneCalls:10,postCalls:1,triangles:100,textures:5,geometries:4});assert.equal(profiler.snapshot().samples,3);assert.equal(profiler.snapshot().frameMsP50,40);assert.equal(profiler.snapshot().latest.frameMs,50);profiler.record({frameMs:10000});assert.equal(profiler.snapshot().samples,3);assert.equal(profiler.snapshot().stallsOver250Ms,1);profiler.record({frameMs:NaN});assert.equal(profiler.snapshot().samples,3);profiler.reset();assert.equal(profiler.snapshot().samples,0);
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
assert(main.includes("get('colorPipeline')==='1'&&renderer.extensions.has('EXT_color_buffer_float')"));
assert(main.includes('createFlightRenderTarget({hdr:colorManaged,floatDepth:reversedDepth})'));
const feedSource=readFileSync(new URL('./dist/feed-post.mjs',import.meta.url),'utf8');
assert(feedSource.includes("${colorManaged?'\\n#include <tonemapping_fragment>\\n':''}\\n#include <colorspace_fragment>\\n"));
assert.equal((feedSource.match(/#include <tonemapping_fragment>/g)||[]).length,1);assert.equal((feedSource.match(/#include <colorspace_fragment>/g)||[]).length,1);
assert(feedSource.includes('col*=inside;col*=brightness;gl_FragColor=vec4(col,1.);'),'brightness remains feed-only and precedes opt-in output transform');
assert(main.includes('for(let i=0;i<256*256;i++)rand();'),'unchanged seeded scenery after replacing old asphalt texture');
assert(main.includes('material.envMapRotation.x=Math.PI/2'),'environment aligns with Z-up world');
assert(main.includes('Math.min(1,576/h)'));assert(main.includes('?1.25:1.75'));
for(const mat of [mobile.asphalt,mobile.concrete,desktop.asphalt,desktop.concrete])mat.dispose();for(const t of [...mobile.textures,...desktop.textures])t.dispose();geo.dispose();
console.log('PASS: periodic deterministic maps, data/albedo color spaces, metre UVs, mobile anisotropy, safe reflection fallback, bounded profiler, output opt-in and seeded scenery invariants');
