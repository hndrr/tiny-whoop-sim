import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from './dist/vendor/three.module.min.js';
import {rockGeometry,createRockField,applyWind,NATURE} from './dist/nature-visuals.mjs';
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
// The rock loop must consume the seeded stream exactly as the old per-mesh loop
// did: two draws per candidate, a third for size, three for rotation if kept.
const loop=main.slice(main.indexOf('const rockRecords=[];'),main.indexOf('scene.add(createRockField(rockRecords));'));
let draws=0,seed=7;const rand=()=>{draws++;seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const records=new Function('rand','terrainHeight',loop+';return rockRecords')(rand,()=>0);
let expected=0;seed=7;const replay=()=>{expected++;seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
for(let i=0;i<95;i++){const x=(replay()-.5)*430,y=-100+replay()*540;if(x>-100&&x<120&&y<120)continue;replay();replay();replay();replay()}
assert.equal(draws,expected,'random stream consumption is unchanged');assert(records.length>40);
// Faceted variants: no cracks (every copy of a shared corner moves together),
// a flat bed, per-face colour and finite normals.
for(let v=0;v<NATURE.rockVariants;v++){
 const g=rockGeometry(v),p=g.attributes.position,source=new T.IcosahedronGeometry(1,1).attributes.position,byCorner=new Map();
 for(let i=0;i<p.count;i++){const key=[source.getX(i),source.getY(i),source.getZ(i)].map(n=>Math.round(n*1e4)).join(',');const now=[p.getX(i),p.getY(i),p.getZ(i)].join(',');if(byCorner.has(key))assert.equal(byCorner.get(key),now,'shared corner stays welded');else byCorner.set(key,now)}
 for(let i=0;i<p.count;i++)assert(p.getZ(i)>=-.55-1e-6,'flattened bed (float32 storage)');
 const c=g.attributes.color;for(let i=0;i<c.count;i+=3)for(let k=0;k<3;k++)assert.equal(c.getX(i+k),c.getX(i),'one colour per face');
 assert([...g.attributes.normal.array].every(Number.isFinite));
}
const field=createRockField(records);assert.equal(field.children.length,NATURE.rockVariants,'four instanced draws instead of one mesh per rock');
assert.equal(field.children.reduce((n,m)=>n+m.count,0),records.length);assert(field.children.every(m=>m.isInstancedMesh&&m.castShadow&&m.instanceColor));
// Wind injection targets real Lambert chunks under instancing; reduced motion
// holds still and grass collapses beyond its fade distance.
for(const kind of ['grass','crown']){
 const material=new T.MeshLambertMaterial(),clock={value:3},control=applyWind(material,{clock,kind,reducedMotion:true});
 const shader={uniforms:{},vertexShader:T.ShaderLib.lambert.vertexShader,fragmentShader:T.ShaderLib.lambert.fragmentShader};material.onBeforeCompile(shader);
 assert.equal(shader.uniforms.windClock,clock);assert.equal(shader.uniforms.windStrength.value,0);control.setReducedMotion(false);assert.equal(shader.uniforms.windStrength.value,NATURE.windStrength);
 assert(shader.vertexShader.includes('transformed+=transpose(basis)*wind/scale2;'));assert.equal(shader.vertexShader.includes('smoothstep(45.0,70.0'),kind==='grass');
}
assert(main.includes("applyWind(grassMat,{clock:oceanMat.uniforms.clock,kind:'grass',reducedMotion:signalMotion.matches})"));
assert(main.includes("signalMotion.addEventListener?.('change',()=>foliageWind.forEach(w=>w.setReducedMotion(signalMotion.matches)))"));
console.log('PASS: unchanged seeded rock stream, welded faceted variants with flat beds, four instanced rock draws, instanced wind with reduced-motion hold and grass distance collapse',JSON.stringify({rocks:records.length,draws}));
console.log('CPU geometry/source checks only; rendered motion and GPU savings need browser verification.');
