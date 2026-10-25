import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from './dist/vendor/three.module.min.js';
import {createTerrain,patchError,projectedError,prefersNear,patchDistance,TERRAIN_LOD} from './dist/terrain-lod.mjs';
import {createTerrainGeometry,terrainPatchMaxHeight,applyTerrainShading,noiseMapMean} from './dist/terrain-visuals.mjs';
import {SEA_LEVEL,WORLD_HALF} from './dist/world.mjs';
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8'),selection=readFileSync(new URL('./dist/selection-integration.mjs',import.meta.url),'utf8');
const material=new T.MeshBasicMaterial(),terrain=createTerrain(material);
// Only emerged patches exist; each has both levels in the single BatchedMesh.
let emerged=0;for(let x=-WORLD_HALF+250;x<WORLD_HALF;x+=500)for(let y=-WORLD_HALF+250;y<WORLD_HALF;y+=500)emerged+=terrainPatchMaxHeight(x,y)>=SEA_LEVEL-TERRAIN_LOD.submergedMargin;
assert.equal(terrain.chunks.length,emerged);assert(emerged<80,'most of the 256 patches lie under the sea');
assert(terrain.mesh.isBatchedMesh);assert.equal(terrain.mesh.instanceCount,emerged*2);assert.equal(terrain.mesh.castShadow,false);assert.equal(terrain.mesh.receiveShadow,true);
// The error metric uses the far mesh's real triangles: compare with raycasts.
const ray=new T.Raycaster(),check=[[-250,250],[250,750],[-750,1250]];let compared=0;
for(const [cx,cy] of check){
 const far=new T.Mesh(createTerrainGeometry(cx,cy,TERRAIN_LOD.far),material);far.position.set(cx,cy,0);far.updateMatrixWorld();
 const near=createTerrainGeometry(cx,cy,TERRAIN_LOD.near),p=near.attributes.position;let worst=0;
 for(let i=0;i<p.count;i+=7){const x=p.getX(i)+cx,y=p.getY(i)+cy;ray.set(new T.Vector3(x,y,5000),new T.Vector3(0,0,-1));const hit=ray.intersectObject(far)[0];if(!hit)continue;worst=Math.max(worst,Math.abs(p.getZ(i)-hit.point.z));compared++}
 assert(patchError(cx,cy)>=worst-1e-3,'analytic error bounds the sampled raycast error');far.geometry.dispose();near.dispose();
}
assert(compared>200);
// Projected pixel error is scale-free: doubling size and distance changes nothing.
assert(Math.abs(projectedError(2,100,720,72)-projectedError(4,200,720,72))<1e-12);
assert(Math.abs(projectedError(3,500,576,105)-3*576/(2*Math.tan(105*Math.PI/360))/500)<1e-9);
// Rule: always near close by; rough patches stay near farther than flat ones; hysteresis.
const flat={x:0,y:0,minZ:0,maxZ:1,error:.4},rough={x:0,y:0,minZ:0,maxZ:200,error:20};
assert(prefersNear(flat,{x:0,y:400,z:5},720,72),'within the always-near band');
const far=d=>({x:0,y:250+d,z:5});
assert(!prefersNear(flat,far(400),720,72)&&prefersNear(rough,far(400),720,72));
let boundary=0;for(let d=200;d<6000;d+=10)if(prefersNear(rough,far(d),720,72))boundary=d;
assert(prefersNear(rough,far(boundary+200),720,72,true),'a near patch keeps its level slightly past the switch');
assert(!prefersNear(rough,far(boundary+200),720,72,false));
assert.equal(patchDistance(rough,{x:10,y:10,z:50}),0);
// Updates make each patch exclusive between its two levels.
const at={x:0,y:0,z:1.2};const nearCount=terrain.update(at,720,72);assert(nearCount>0&&nearCount<terrain.chunks.length);
for(const c of terrain.chunks)assert.notEqual(c.near.visible,c.far.visible);
const aloft=terrain.update({x:0,y:-900,z:300},576,105);assert(aloft<nearCount+5);
// Terrain shading compiles against the real Lambert chunks it replaces.
const shaded=applyTerrainShading(new T.MeshLambertMaterial({map:new T.Texture(),vertexColors:true,flatShading:true}),{detailMean:noiseMapMean()});
const shader={vertexShader:T.ShaderLib.lambert.vertexShader,fragmentShader:T.ShaderLib.lambert.fragmentShader};shaded.onBeforeCompile(shader);
assert(shader.vertexShader.includes('vTerrainWorld=(modelMatrix*terrainWorld).xyz;')&&shader.vertexShader.includes('#include <batching_vertex>'));
assert(!shader.fragmentShader.includes('#include <map_fragment>'),'grain fades to its mean instead');assert(shader.fragmentShader.includes('float rock=smoothstep('));
assert(Math.abs(noiseMapMean()-.7315)<5e-4,'grain mean matches the 210-234 sRGB neutral map');
// Wiring: one batched mesh in the scene, per-frame level choice, preview parity.
assert(main.includes('terrain.update(s,target.height,camera.fov)'));
assert(main.includes('applyTerrainShading(terrainMat,{detailMean:noiseMapMean()})'));
assert(selection.includes('c.prefersNear?c.prefersNear(camera.position,200,camera.fov):Math.hypot(c.x-r.x,c.y-r.y)<950'));
console.log('PASS: emerged patches only, one BatchedMesh with both levels, exact far-triangle error, scale-free pixel error with hysteresis, exclusive levels and shader injection',JSON.stringify({patches:terrain.chunks.length,nearAtSpawn:nearCount,nearAloft:aloft}));
console.log('CPU geometry and selection checks only; WebGL multi-draw and rendered appearance need browser verification.');
