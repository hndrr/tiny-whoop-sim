import assert from 'node:assert/strict';import {FlightState,GATES} from './dist/flight.mjs';const f=new FlightState();f.step(.01,new Set(['ArrowUp']));assert.equal(f.y,0);f.paused=false;for(let i=0;i<120;i++)f.step(1/60,new Set());assert.equal(f.z,1.2);for(let i=0;i<120;i++)f.step(1/60,new Set(['ArrowUp']));assert(f.y>4);assert(f.pitch<0);let z=f.z;for(let i=0;i<60;i++)f.step(1/60,new Set(['KeyW']));assert(f.z>z);let heading=f.heading;f.step(.02,new Set(['KeyA']));assert(f.heading>heading);f.reset();f.paused=false;for(let g of GATES){[f.x,f.y,f.z]=g;f.step(.001,new Set())}assert.equal(f.practiceCount,GATES.length);assert(!f.complete);assert.equal(f.finishTime,null);f.reset();f.paused=false;f.z=.081;f.vz=-8;f.step(.02,new Set());assert(f.crashed);f.reset();assert(f.paused&&!f.crashed&&f.gate===0);console.log('PASS: pause, hover, pitch/forward, climb, yaw, all course gates, crash, reset');

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

import {WORLD_SIZE,WORLD_HALF,REGIONS,regionSpawn,terrainHeight,groundHeight,boundaryAcceleration,WORLD_OBJECTS} from './dist/world.mjs';
assert.equal(WORLD_SIZE,8000);assert.equal(REGIONS.length,8);assert(WORLD_OBJECTS.length>50);
for(let i=0;i<REGIONS.length;i++){const p=regionSpawn(i);assert(!segmentHitsSolid(p,p),REGIONS[i].label+' blocked spawn');assert(p[2]>groundHeight(p[0],p[1])+5);const f=new FlightState();f.relocate(i);assert(f.paused);f.paused=false;f.step(.02,new Set(),{pitch:.3});assert(!f.crashed)}
const free=new FlightState();free.complete=true;free.finishTime=90;free.paused=false;free.vy=3;free.step(.02,new Set());assert(free.y>0);assert.equal(free.finishTime,90);
const edge=new FlightState();edge.x=12000-50;edge.z=20;edge.paused=false;edge.step(.02,new Set());assert(!edge.crashed);assert(edge.vx<0);assert(boundaryAcceleration(-11900,11900)[0]>0&&boundaryAcceleration(-11900,11900)[1]<0);
assert(terrainHeight(0,2400)>100);assert(terrainHeight(3500,-2000)<0);assert.equal(groundHeight(0,0),0);
console.log('PASS: 8km world, eight unobstructed region spawns, continuous post-course flight, soft map edge, hills/ocean terrain');

import {SEA_LEVEL,FLIGHT_HALF,isOverWater,homeNavigation} from './dist/world.mjs';
assert.equal(FLIGHT_HALF,12000);assert(isOverWater(0,-1400));assert.equal(groundHeight(0,-1400),SEA_LEVEL);
const sea=new FlightState();sea.relocate(7);sea.paused=false;assert(sea.z>SEA_LEVEL+5);sea.x=5000;sea.y=-5000;sea.z=SEA_LEVEL+3;sea.vy=-8;for(let i=0;i<240;i++)sea.step(1/60,new Set());assert(!sea.crashed);assert(sea.y<-5000);assert(Math.abs(sea.z-(SEA_LEVEL+3))<.001);
const crossing=new FlightState();crossing.paused=false;crossing.z=60;for(let y=20;y>=-1600;y-=5){crossing.y=y;crossing.step(.01,new Set());assert(!crossing.crashed)}for(let y=-1600;y<=20;y+=5){crossing.y=y;crossing.step(.01,new Set());assert(!crossing.crashed)}
const ditch=new FlightState();ditch.relocate(7);ditch.paused=false;ditch.z=SEA_LEVEL+.081;ditch.vz=-1;ditch.step(.03,new Set());assert(ditch.crashed&&ditch.ditched);
assert.equal(homeNavigation(0,-1000).bearing,0);assert.equal(homeNavigation(1000,0).bearing,270);assert.equal(homeNavigation(0,-1000).distance,1000);
console.log('PASS: offshore spawn, sea-level hover beyond former map bounds, coastal crossing/return, ditching, HOME bearing');

// Review regression: quarry columns reach sloped excavation ground without moving their tops.
const quarryColumns=WORLD_OBJECTS.filter(o=>o.region===4&&o.material==='steel');assert.equal(quarryColumns.length,2);
const quarryRoof=WORLD_OBJECTS.find(o=>o.region===4&&o.material==='roof');
for(const column of quarryColumns){const [x,y,z]=column.position,[w,d,h]=column.size,top=z+h/2,bottom=z-h/2;assert(Math.abs(top-(quarryRoof.position[2]+quarryRoof.size[2]/2))<1e-9);for(const dx of [-w/2,w/2])for(const dy of [-d/2,d/2])assert(bottom<terrainHeight(x+dx,y+dy));const oldBottom=quarryRoof.position[2]-25,underOldBase=(terrainHeight(x,y)+oldBottom)/2;assert(segmentHitsSolid([x,y,underOldBase],[x,y,underOldBase]),'missing collision below old support base')}
assert.equal(quarryRoof.size[2],2);
console.log('PASS: grounded quarry supports, filled collision gaps, unchanged column tops/roof');

import {surfaceClearance,lowAltitudeWarning} from './dist/world.mjs';
const lowSea=new FlightState();lowSea.relocate(7);lowSea.paused=false;lowSea.z=SEA_LEVEL+.6;lowSea.vz=-.4;let warnedBeforeDitch=false;
for(let i=0;i<600&&!lowSea.crashed;i++){lowSea.step(1/120,new Set(),{throttle:-.2});if(lowAltitudeWarning(lowSea)){assert(!lowSea.ditched);assert(surfaceClearance(lowSea.x,lowSea.y,lowSea.z)<.35);warnedBeforeDitch=true}}
assert(warnedBeforeDitch&&lowSea.ditched);assert(!lowAltitudeWarning(lowSea));
const lowLand=new FlightState();lowLand.paused=false;lowLand.z=.2;assert(lowAltitudeWarning(lowLand));lowLand.paused=true;assert(!lowAltitudeWarning(lowLand));
assert(Math.abs(surfaceClearance(0,-1400,SEA_LEVEL+.2)-.2)<1e-9);assert(!lowAltitudeWarning({x:0,y:-1400,z:SEA_LEVEL+.35,paused:false,crashed:false}));
console.log('PASS: shared land/sea clearance, LOW ALTITUDE before DITCHED, warning suppressed while paused/crashed');
