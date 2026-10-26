import assert from 'node:assert/strict';
import * as T from './dist/vendor/three.module.min.js';
import {createForestVisuals,forestRecords,FOREST_BUDGET} from './dist/forest-visuals.mjs';
import {terrainHeight,nearestRegion} from './dist/world.mjs';
function rng(seed=13){let calls=0;return {next(){calls++;seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;},get calls(){return calls;},get seed(){return seed;}};}
const a=rng(),b=rng();
// Baseline generated two 256x256 procedural textures before the forest.
for(let i=0;i<131072;i++){a.next();b.next();}
const expected=[];
for(let i=0;i<700;i++){let x=(a.next()-.5)*3500,y=200+a.next()*2900;const region=nearestRegion(x,y);if(region.distance<region.radius+30)x+=300;const z=terrainHeight(x,y),scale=.7+a.next()*.7;expected.push({x,y,z,scale});}
const actual=forestRecords(()=>b.next(),terrainHeight,nearestRegion);
assert.deepEqual(actual.map(({x,y,z,scale})=>({x,y,z,scale})),expected);
assert.equal(a.calls,b.calls);assert.equal(a.seed,b.seed);assert.equal(a.next(),b.next());
const c=rng();const forest=createForestVisuals({random:()=>c.next(),terrainHeight,nearestRegion});assert.equal(c.calls,2100);assert.equal(forest.group.children.length,FOREST_BUDGET.maxDrawCalls);
assert.equal(forest.batches.reduce((n,b)=>n+b.crowns.count,0),700);
const species=new Set(forest.records.map(r=>r.species));assert.equal(species.size,3);
const matrix=new T.Matrix4(),point=new T.Vector3();let maxTriangles=0,gpuBytes=0;
const geometries=new Set();
for(const batch of forest.batches){
 const crown=batch.crowns.geometry,trunk=batch.trunks.geometry;
 const triangles=crown.attributes.position.count/3+trunk.index.count/3;maxTriangles=Math.max(maxTriangles,triangles);
 assert(triangles<=FOREST_BUDGET.maxTrianglesPerTree,`${triangles} triangles exceed budget`);
 assert.equal(batch.crowns.material.transparent,false);assert.equal(batch.crowns.material.alphaTest,0);assert.equal(batch.crowns.material.map,null);
 assert.equal(batch.crowns.count,batch.trunks.count);
 for(const geo of [crown,trunk]){if(!geometries.has(geo)){geometries.add(geo);for(const attr of Object.values(geo.attributes))gpuBytes+=attr.array.byteLength;if(geo.index)gpuBytes+=geo.index.array.byteLength;}}
 for(const mesh of [batch.crowns,batch.trunks]){gpuBytes+=mesh.instanceMatrix.array.byteLength;if(mesh.instanceColor)gpuBytes+=mesh.instanceColor.array.byteLength;}
 for(let i=0;i<batch.trunks.count;i++){
  batch.trunks.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);const scale=new T.Vector3().setFromMatrixScale(matrix).z;
  assert(Math.abs(point.z-4*scale-terrainHeight(point.x,point.y))<.001,'trunk must be grounded');
 }
 for(const attr of [crown.attributes.position,crown.attributes.normal,crown.attributes.color])assert([...attr.array].every(Number.isFinite));
}
assert(gpuBytes<500000,`GPU buffers ${gpuBytes} exceed 500 KB`);
const versions=forest.batches.map(b=>b.crowns.instanceMatrix.version);
forest.update({x:1,y:2,z:1});assert.deepEqual(forest.batches.map(b=>b.crowns.instanceMatrix.version),versions,'stationary camera must not upload matrices');
// Exact LOD transition, including hysteresis and near/far packing uniqueness.
const r=forest.records[0],at=d=>({x:r.x+d,y:r.y,z:r.z+13});
function contains(batch,r){for(let i=0;i<batch.crowns.count;i++){batch.crowns.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);if(Math.abs(point.x-r.x)<.001&&Math.abs(point.y-r.y)<.001)return true;}return false;}
function level(){return forest.batches.find(b=>contains(b,r)).detail;}
forest.update(at(500),true);assert.equal(level(),1);
forest.update(at(700),true);assert.equal(level(),1);
forest.update(at(730),true);assert.equal(level(),0);
forest.update(at(620),true);assert.equal(level(),0);
forest.update(at(570),true);assert.equal(level(),1);
forest.update({x:12000,y:-12000,z:100},true);assert.equal(forest.batches.filter(b=>b.detail===1).reduce((n,b)=>n+b.crowns.count,0),0);
assert.equal(forest.batches.reduce((n,b)=>n+b.crowns.count,0),700);
let disposals=0;for(const geo of geometries)geo.addEventListener('dispose',()=>disposals++);forest.dispose();forest.dispose();assert.equal(disposals,7);assert.equal(forest.group.children.length,0);
console.log(`Forest geometry tests passed: ${maxTriangles} max triangles/tree, ${gpuBytes} estimated geometry+instance buffer bytes, 12 maximum draw batches; no FPS measurement`);
