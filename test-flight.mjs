import assert from 'node:assert/strict';import {FlightState,GATES} from './dist/flight.mjs';const f=new FlightState();f.step(.01,new Set(['KeyW']));assert.equal(f.y,0);f.paused=false;for(let i=0;i<120;i++)f.step(1/60,new Set());assert.equal(f.z,1.2);for(let i=0;i<120;i++)f.step(1/60,new Set(['KeyW']));assert(f.y>4);assert(f.pitch<0);let z=f.z;for(let i=0;i<60;i++)f.step(1/60,new Set(['ArrowUp']));assert(f.z>z);let heading=f.heading;f.step(.02,new Set(['ArrowLeft']));assert(f.heading>heading);f.reset();f.paused=false;for(let g of GATES){[f.x,f.y,f.z]=g;f.step(.001,new Set())}assert.equal(f.gate,GATES.length);assert(f.complete);f.reset();f.paused=false;f.z=.081;f.vz=-8;f.step(.02,new Set());assert(f.crashed);f.reset();assert(f.paused&&!f.crashed&&f.gate===0);console.log('PASS: pause, hover, pitch/forward, climb, yaw, all course gates, crash, reset');

const a=new FlightState();a.paused=false;for(let i=0;i<60;i++)a.step(1/60,new Set(),{pitch:.5,roll:.25,yaw:.3,throttle:.2});assert(a.y>0&&a.z>1.2&&a.heading>0);assert(a.roll>0);assert(Math.abs(a.pitch)<.3);console.log('PASS: proportional dual-stick axes');

import {segmentHitsSolid} from './dist/stage.mjs';
assert(!segmentHitsSolid([-20,30,2.7],[-60,30,2.7]));
assert(!segmentHitsSolid([-70,80,3.2],[-15,80,3.2]));
assert(!segmentHitsSolid([32,92,2.5],[32,62,2.5]));
assert(segmentHitsSolid([-20,10,3],[-60,10,3]));
assert(segmentHitsSolid([-40,30,6],[-40,30,9]));
assert(!segmentHitsSolid([-40,3,3.2],[-40,12,3.2]));
for(const gate of GATES)assert(!segmentHitsSolid(gate,gate),JSON.stringify(gate));
const descend=new FlightState();descend.paused=false;descend.z=10;for(let i=0;i<60;i++)descend.step(1/60,new Set(),{throttle:-.7});assert(descend.z<9);assert(descend.vz<0);
console.log('PASS: both hangar doorways, service tunnel, open window, solid walls/roof, clear gates, touch descent');

let previous=[0,0,1.2];for(const gate of GATES){assert(!segmentHitsSolid(previous,gate),'blocked course segment '+JSON.stringify(gate));previous=gate}console.log('PASS: every straight gate-to-gate route clears building collision volumes');
