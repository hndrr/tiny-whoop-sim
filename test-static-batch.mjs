import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from './dist/vendor/three.module.min.js';
import {createStaticBatcher,instanceMeshes,contactShade,STATIC_BATCH} from './dist/static-batch.mjs';
import {surfaceBoxGeometry} from './dist/surface-materials.mjs';
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
const red=new T.MeshStandardMaterial({color:'#ff0000'}),grey=new T.MeshLambertMaterial({color:'#888888'});red.userData.tileMeters=3;
const container=new T.Group(),unit=new T.BoxGeometry(1,1,1);
const add=(geometry,material,position,scale,cast=true)=>{const m=new T.Mesh(geometry,material);m.position.set(...position);m.scale.set(...scale);m.castShadow=cast;m.receiveShadow=true;container.add(m);return m};
// Three grounded walls and one beam in cell (0,0); one wall in the next cell;
// a ground slab that casts no shadow; a rotor group that must stay animated.
const walls=[[5,5,3],[15,5,3],[25,5,3]].map(p=>add(surfaceBoxGeometry([.3,8,6],3),red,p,[.3,8,6]));
const beam=add(unit,grey,[10,10,7],[12,.4,.4]);const far=add(surfaceBoxGeometry([.3,8,6],3),red,[130,5,3],[.3,8,6]);
const slab=add(unit,grey,[10,30,.01],[20,20,.02],false);const rotor=new T.Group();rotor.add(new T.Mesh(unit,grey));container.add(rotor);
const before=new T.Box3().setFromObject(container),uvBefore=walls[1].geometry.attributes.uv.array.slice();
const batcher=createStaticBatcher({groundHeight:()=>0});const created=batcher.batch(container);
// Groups by material, shadow flags and cell: red(0,0), red(1,0), grey beam, grey slab.
assert.equal(created.length,4);assert(container.children.includes(rotor),'animated groups are untouched');
assert.equal(container.children.filter(o=>o.isMesh).length,4,'original meshes are replaced');
const after=new T.Box3().setFromObject(container);for(const k of ['min','max'])assert(after[k].distanceTo(before[k])<1e-5,'world extent is unchanged');
const redBatch=created.find(m=>m.userData.batchedCount===3);assert(redBatch);
const uv=redBatch.geometry.attributes.uv.array;assert.deepEqual([...uv.slice(uv.length/3,uv.length/3*2)],[...uvBefore],'metre-scaled UVs are carried over');
assert.equal(redBatch.material.userData.batchSource,red);
// The clone composes the source's own hook (e.g. glow) with contact shading.
const injected=m=>{const shader={vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};m.onBeforeCompile(shader);return shader.vertexShader.includes('vBaseHeight=baseHeight;')};assert(injected(redBatch.material));assert(redBatch.material.customProgramCacheKey().endsWith('|contact'));assert.equal(redBatch.material.userData.tileMeters,3);
// Contact height: grounded walls carry height above base; beam and slab do not.
const heights=m=>[...m.geometry.attributes.baseHeight.array];
assert(heights(redBatch).every(h=>h>=0&&h<=6+1e-5));assert(Math.max(...heights(redBatch))>5.99&&Math.min(...heights(redBatch))<1e-5);
const beamBatch=created.find(m=>m.geometry.boundingBox.min.z>6),slabBatch=created.find(m=>!m.castShadow);
assert(heights(beamBatch).every(h=>h===STATIC_BATCH.noContact),'elevated beam keeps its albedo');assert(heights(slabBatch).every(h=>h===STATIC_BATCH.noContact),'thin ground slab is not darkened');
assert.equal(slabBatch.castShadow,false);assert.equal(slabBatch.receiveShadow,true);
// Shader injection uses chunks present in both lit material families.
for(const name of ['meshphysical','meshlambert']){const shader={vertexShader:T.ShaderLib[name==='meshphysical'?'standard':'lambert'].vertexShader,fragmentShader:T.ShaderLib[name==='meshphysical'?'standard':'lambert'].fragmentShader};contactShade(shader);assert(shader.vertexShader.includes('vBaseHeight=baseHeight;'));assert(shader.fragmentShader.includes('smoothstep(0.,1.00,vBaseHeight)'))}
// Late painted textures reach the clone, which keeps its contact shading.
const painted=new T.Texture();red.map=painted;batcher.syncMaterials();assert.equal(redBatch.material.map,painted);assert(injected(redBatch.material));assert.equal(redBatch.material.userData.batchSource,red);
// Repeated meshes become one InstancedMesh per geometry/material.
const parent=new T.Group(),holder=new T.Group();holder.position.set(3,4,5);holder.rotation.z=.4;const posts=[];
for(let i=0;i<6;i++){const m=new T.Mesh(unit,grey);m.position.set(i,0,1);m.scale.set(.1,.1,2);holder.add(m);posts.push(m)}
holder.updateMatrixWorld(true);const worlds=posts.map(m=>m.matrixWorld.clone());
const [instanced]=instanceMeshes(posts,parent);assert.equal(instanced.count,6);assert.equal(holder.children.length,0);
for(let i=0;i<6;i++){const m=new T.Matrix4();instanced.getMatrixAt(i,m);assert(m.elements.every((v,k)=>Math.abs(v-worlds[i].elements[k])<1e-6))}
// Main wiring: batching after shadow flags, gate fixtures instanced with shared geometry.
assert(main.indexOf('staticBatcher.batch(airfieldGroup)')>main.indexOf("o.position.z+o.scale.z/2<.08)o.castShadow=false"));
assert(main.includes('regionGroups.forEach(g=>staticBatcher.batch(g))'));assert(main.includes('staticBatcher.syncMaterials()'));
assert(main.includes('const ringGeo=new T.TorusGeometry(1.6,.065,8,64),bandGeo=new T.TorusGeometry(1.6,.069,6,5,.16)'));
assert(main.includes('gateFixtures.visible=!precision?.mission.active'),'mission mode still hides every gate part');
console.log('PASS: static batches per material/cell/shadow flags, unchanged extent and UVs, grounded contact height, late texture sync, instanced repeats and main wiring',JSON.stringify({batches:created.length}));
console.log('CPU geometry checks only; draw-call counts are measured in the browser profile.');
