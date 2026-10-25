import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from './dist/vendor/three.module.min.js';
import {createShadowScheduler,SHADOW_SCHEDULE} from './dist/shadow-scheduler.mjs';
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
// The scheduler owns shadow-map updates; the renderer clears needsUpdate after
// each shadow pass, which the harness models by consuming the flag per frame.
const renderer={shadowMap:{autoUpdate:true,needsUpdate:false}};
const sun=new T.DirectionalLight();sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-72,right:72,top:72,bottom:-72});
const shadows=createShadowScheduler(renderer,sun);
assert.equal(renderer.shadowMap.autoUpdate,false,'no per-frame shadow pass');
let passes=0;const frame=(position,options)=>{shadows.update(position,options);if(renderer.shadowMap.needsUpdate){passes++;renderer.shadowMap.needsUpdate=false}};
const drone=new T.Object3D();
// First frame places the light frame and renders once.
frame(new T.Vector3(0,0,1.2),{caster:drone,clearance:1.2});assert.equal(passes,1);
const offset=sun.position.clone().sub(sun.target.position);assert.deepEqual(offset.toArray().map(v=>Math.round(v*1e6)/1e6),SHADOW_SCHEDULE.offset,'sun keeps its original direction');
// A parked visible airframe or a hidden one does not re-render the static map.
for(let i=0;i<10;i++)frame(new T.Vector3(0,0,1.2),{caster:drone,clearance:1.2});assert.equal(passes,1);
// Moving the visible chase airframe near the ground updates every frame.
for(let i=1;i<=5;i++){drone.position.set(i*.1,0,1.2);frame(drone.position,{caster:drone,clearance:1.2})}assert.equal(passes,6);
// High above the ground its shadow cannot read; only re-centring updates.
for(let i=1;i<=5;i++){drone.position.set(.5+i*.1,0,80);frame(new T.Vector3(.5,0,1.2),{caster:drone,clearance:80})}assert.equal(passes,6);
// Hiding the airframe (FPV) removes its shadow once, then FPV flight is static.
drone.visible=false;frame(new T.Vector3(.5,0,1.2),{caster:drone,clearance:1.2});assert.equal(passes,7);
for(let i=0;i<10;i++)frame(new T.Vector3(.5+i,0,1.2),{caster:drone,clearance:1.2});assert.equal(passes,7,'FPV flight within the inner radius needs no shadow pass');
// Leaving the inner radius re-centres on a whole-texel light-space grid.
const texel=144/2048,before=sun.target.position.clone();frame(new T.Vector3(40,30,2),{caster:drone,clearance:2});assert.equal(passes,8);
const delta=sun.target.position.clone().sub(before);
sun.shadow.camera.position.copy(sun.position);sun.shadow.camera.lookAt(sun.target.position);sun.shadow.camera.updateMatrixWorld();
const right=new T.Vector3().setFromMatrixColumn(sun.shadow.camera.matrixWorld,0),up=new T.Vector3().setFromMatrixColumn(sun.shadow.camera.matrixWorld,1);
for(const axis of [right,up]){const steps=delta.dot(axis)/texel;assert(Math.abs(steps-Math.round(steps))<1e-6,'light frame moves by whole texels')}
assert(sun.target.position.distanceTo(new T.Vector3(40,30,2))<texel,'snapped frame stays within one texel of the airframe');
// Preview renders and resets can force one refresh.
shadows.invalidate();frame(new T.Vector3(40,30,2),{caster:drone,clearance:2});assert.equal(passes,9);
// Main loop wiring: the old per-frame sun follow is replaced by the scheduler.
assert(!main.includes('sun.position.set(s.x-80,s.y-95,s.z+140)'));
assert(main.includes('shadowSchedule.update(drone.position,{caster:drone,clearance:surfaceClearance(s.x,s.y,s.z)})'));
assert(main.includes('ocean.castShadow=false'));
console.log('PASS: on-demand shadow map, texel-snapped re-centring, dynamic caster near ground, FPV visibility change and preview invalidation',JSON.stringify({passes}));
console.log('CPU scheduling checks only; rendered shadow appearance and GPU savings need browser verification.');
