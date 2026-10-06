import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from './dist/vendor/three.module.min.js';
import {loadPaintedTextures,applyPaintedArchitecture,PAINTED_ASSETS} from './dist/painted-materials.mjs';
import {WORLD_OBJECTS} from './dist/world.mjs';
import {createSurfaceMaterials,scaleCylinderSurfaceUV} from './dist/surface-materials.mjs';
const manifest=JSON.parse(readFileSync(new URL('./dist/assets/painted-manifest.json',import.meta.url),'utf8'));
let bytes=0;
for(const item of manifest.files){const data=readFileSync(new URL(`./dist/assets/${item.file}`,import.meta.url));bytes+=data.length;assert.equal(data.length,item.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),item.sha256);assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');const header=data.indexOf(Buffer.from([0x9d,0x01,0x2a]));assert(header>=0);assert.equal(data.readUInt16LE(header+3)&0x3fff,256);assert.equal(data.readUInt16LE(header+5)&0x3fff,256);assert.equal(item.width,256);assert.equal(item.height,256)}
assert.equal(bytes,62768);assert.equal(Object.keys(PAINTED_ASSETS).length,4);
const renderer={capabilities:{getMaxAnisotropy:()=>16}};
const loaded=await loadPaintedTextures(renderer,{coarse:true,load:async url=>{assert(url.endsWith('.webp'));return new T.Texture()}});
for(const texture of Object.values(loaded)){assert.equal(texture.colorSpace,T.SRGBColorSpace);assert.equal(texture.wrapS,T.MirroredRepeatWrapping);assert.equal(texture.wrapT,T.MirroredRepeatWrapping);assert.equal(texture.anisotropy,2);assert.equal(texture.minFilter,T.LinearMipmapLinearFilter)}
const surfaces=createSurfaceMaterials(renderer),roof=new T.MeshStandardMaterial({color:'#637578',roughness:.65,metalness:.45}),old=surfaces.concrete.map;let disposed=0;old.addEventListener('dispose',()=>disposed++);
applyPaintedArchitecture(surfaces,roof,loaded);assert.equal(surfaces.concrete.map,loaded.concrete);assert.equal(roof.map,loaded.hangar);assert.equal(surfaces.concrete.color.getHex(),0xffffff);assert.equal(roof.color.getHex(),0xffffff);assert.equal(loaded.concrete.repeat.x,.5);assert.equal(surfaces.concrete.bumpScale,.008);assert.equal(surfaces.textures.length,4);assert(!surfaces.textures.includes(old));assert.equal(disposed,1);assert.equal(roof.roughness,.85);assert.equal(roof.metalness,.15);applyPaintedArchitecture(surfaces,roof,loaded);assert.equal(disposed,1);assert.equal(surfaces.textures.length,4);
const failed=await loadPaintedTextures(renderer,{load:async()=>{throw Error('Synthetic decode/network failure')}});assert(Object.values(failed).every(v=>v===null));const concreteMap=surfaces.concrete.map,roofMap=roof.map;applyPaintedArchitecture(surfaces,roof,failed);assert.equal(surfaces.concrete.map,concreteMap);assert.equal(roof.map,roofMap);
const partial=await loadPaintedTextures(renderer,{load:async url=>{if(url.includes('foliage'))throw Error('Unavailable');return new T.Texture()}});assert.equal(partial.foliage,null);assert(partial.concrete&&partial.hangar&&partial.bark);
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8'),selector=readFileSync(new URL('./dist/flight-selector.mjs',import.meta.url),'utf8');assert(main.includes('roofMat.userData.tileMeters=6'));assert(main.includes('forest.applyPaintedTextures(textures)'));assert(main.includes('refreshStagePreviews?.()'));assert(selector.includes('refreshStagePreviews(){stageCache.clear();if(dialog.open)prepareStages(++generation)}'));
for(const t of [...surfaces.textures,loaded.hangar,loaded.foliage,loaded.bark,...Object.values(partial).filter(Boolean)])t.dispose();surfaces.asphalt.dispose();surfaces.concrete.dispose();roof.dispose();
let cylinders=0;
for(const o of WORLD_OBJECTS.filter(o=>o.shape==='cylinder'&&['wall','roof'].includes(o.material))){
 const concrete=o.material==='wall',tileMeters=concrete?3:6,repeat=concrete?.5:1;
 const geometry=new T.CylinderGeometry(o.size[0]/2,o.size[0]/2,o.size[2],16).rotateX(Math.PI/2);
 scaleCylinderSurfaceUV(geometry,{diameter:o.size[0],height:o.size[2],tileMeters,repeat});
 const uv=geometry.attributes.uv,normals=geometry.attributes.normal,side=[];
 for(let i=0;i<uv.count;i++)if(Math.abs(normals.getZ(i))<.5)side.push([uv.getX(i)*repeat,uv.getY(i)*repeat]);
 const maxU=Math.max(...side.map(v=>v[0])),maxV=Math.max(...side.map(v=>v[1]));
 assert.equal(maxU%2,0,'closed side uses even mirrored spans');assert(maxU>=2);assert(Math.abs(maxV-o.size[2]*repeat/tileMeters)<1e-5,'tall cylinders keep metre-scaled height');
 geometry.dispose();cylinders++;
}
assert.equal(cylinders,5,'lighthouse wall/roof and three turbine towers');
console.log('PASS: exact generated WebP bytes/hashes/dimensions, sRGB mirrored tiles, mobile filtering, neutral architectural tint, replaced-map disposal, partial/full load fallback, stage-preview invalidation wiring');
