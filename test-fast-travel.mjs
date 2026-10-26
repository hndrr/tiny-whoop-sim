import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FlightState} from './dist/flight.mjs';
import {FLIGHT_PROFILES} from './dist/flight-profiles.mjs';
import {groundHeight,FLIGHT_HALF,REGIONS,WORLD_OBJECTS} from './dist/world.mjs';
import {SOLIDS,segmentHitsSolid} from './dist/stage.mjs';
import {fastTerrainContact} from './dist/fast-terrain-contact.mjs';
import {objectiveFeedback} from './dist/precision-missions.mjs';
const empty=new Set();
const start=(id='whoop75',altitude=120)=>{const s=new FlightState();s.setAircraft(id);Object.assign(s,{paused:false,x:5000,y:-5000,z:groundHeight(5000,-5000)+altitude});return s};
function step(s,axes={},fps=60){for(let sub=0;sub<2;sub++){const before=[s.x,s.y,s.z];s.step(1/fps/2,empty,axes,false);if(!s.crashed&&segmentHitsSolid(before,[s.x,s.y,s.z]))s.crashed=true}}
function advance(s,seconds,axes={},fps=60){for(let n=0;n<Math.round(seconds*fps);n++)step(s,axes,fps);return s}
// Nominal telemetry follows controls, never altitude or exaggerated world speed.
for(const [id,p] of Object.entries(FLIGHT_PROFILES))for(const fps of [30,60,144]){
 const low=start(id,5),high=start(id),middle=start(id,55);
 for(let frame=0;frame<12*fps;frame++){
  const t=frame/fps,axes=t<8?{pitch:1}:t<10?{pitch:-1}:{};
  for(const s of [low,middle,high])step(s,axes,fps);
  for(const s of [middle,high]){
   assert(Math.abs(s.indicatedVx-low.vx)<1e-10);assert(Math.abs(s.indicatedVy-low.vy)<1e-10,'nominal model is independent of travel');
   assert(s.indicatedSpeed<=16*p.topSpeed+1e-9,'no world speed leaks into the indication');
  }
  if(frame===8*fps-1)assert(high.speed>low.speed*19,'visible motion is genuinely exaggerated');
 }
 const s=advance(start(id),8,{pitch:1},fps),indicated=s.indicatedSpeed;
 s.z+=300;step(s,{pitch:1},fps);assert(Math.abs(s.indicatedSpeed-indicated)<.1,'altitude change has no telemetry jump');
 s.crashed=true;assert.equal(s.indicatedSpeed,0,'solid crash immediately zeroes indication');s.reset();assert.equal(s.indicatedSpeed,0);
 s.relocate(6);assert.equal(s.indicatedSpeed,0,'relocation clears old nominal velocity');
 const change=advance(start(id),8,{pitch:1},fps);change.setAircraft('micro65');step(change,{},fps);assert(change.indicatedSpeed<=14.4+1e-9,'new aircraft nominal bound');
}
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
assert(main.includes('Math.round(s.indicatedSpeed*3.6)'));assert(!main.includes('Math.round(s.speed*3.6)'));
const fast=advance(start(),8,{pitch:1});
assert(!objectiveFeedback(fast,{target:[fast.x,fast.y,fast.z],radius:18,minAltitude:100,maxAltitude:140,horizontalLimit:6,verticalLimit:3}).qualifies,'arrival tolerance uses actual world velocity');
// Ordinary travel into each edge and corner slows before the original spring.
for(const id of Object.keys(FLIGHT_PROFILES))for(const direction of [[1,0],[-1,0],[0,1],[0,-1],[Math.SQRT1_2,Math.SQRT1_2]]){
 const s=start(id);s.x=direction[0]*(FLIGHT_HALF-1500);s.y=direction[1]*(FLIGHT_HALF-1500);s.z=800;
 for(let n=0;n<60*60;n++){step(s,{roll:direction[0],pitch:direction[1]});assert(Math.abs(s.x)<FLIGHT_HALF&&Math.abs(s.y)<FLIGHT_HALF,'high travel cannot overpower the soft boundary');assert(!s.crashed)}
}
// Fast solid crossing uses the same swept segment as the actual frame, even
// when both endpoints lie outside a thin beam. It is not an endpoint test.
{
 const s=start('racer90');Object.assign(s,{x:1807.5,y:-161,z:39,vx:0,vy:377.6});const before=[s.x,s.y,s.z];s.step(.03,empty,{pitch:1},false);
 assert(!segmentHitsSolid(before,before));assert(!segmentHitsSolid([s.x,s.y,s.z],[s.x,s.y,s.z]));
 assert(segmentHitsSolid(before,[s.x,s.y,s.z]),'thin harbor beam crossed between endpoints');s.crashed=true;assert.equal(s.indicatedSpeed,0);
}
// Swept terrain catches an intervening crest even when both endpoints clear.
{
 const a=[290,0,0],b=[300,0,0];
 const z=Math.max(groundHeight(...a),groundHeight(...b))+.085;a[2]=b[2]=z;
 const contact=fastTerrainContact(a,b);assert(contact,'interior crest is detected');assert(contact[0]>a[0]&&contact[0]<b[0]);
 const s=start('racer90');Object.assign(s,{x:a[0],y:a[1],z:a[2],vx:377.6,vy:0});s.step(.03,empty,{roll:1},false);assert(s.crashed&&s.x<b[0],'actual fast flight stops at intervening terrain contact');
 assert.equal(fastTerrainContact([0,0,5],[.5,0,5]),null,'ordinary small steps retain original ground handling');
}
const routes=[];
for(const [from,to] of [[0,1],[1,5]]){
 const a=REGIONS[from],b=REGIONS[to],distance=Math.hypot(b.x-a.x,b.y-a.y),dx=(b.x-a.x)/distance,dy=(b.y-a.y)/distance;
 let surface=0;for(let m=0;m<=distance;m+=2)surface=Math.max(surface,groundHeight(a.x+dx*m,a.y+dy*m));
 for(const o of [...SOLIDS,...WORLD_OBJECTS]){const t=(o.position[0]-a.x)*dx+(o.position[1]-a.y)*dy;if(t>=0&&t<=distance&&Math.abs((o.position[0]-a.x)*dy-(o.position[1]-a.y)*dx)<Math.hypot(o.size[0],o.size[1])/2+10)surface=Math.max(surface,o.position[2]+o.size[2]/2)}
 const s=start();Object.assign(s,{x:a.x,y:a.y,z:surface+110});let seconds=0;
 while((s.x-a.x)*dx+(s.y-a.y)*dy<distance&&seconds<30){step(s,{roll:dx,pitch:dy});seconds+=1/60;assert(!s.crashed)}
 assert(seconds<(distance<2000?10:16),'dramatically shorter actual cross-region travel');
 routes.push({from:a.id,to:b.id,distance,seconds,actualSpeed:s.speed,indicatedSpeed:s.indicatedSpeed});
}
console.log('PASS: nominal telemetry, no altitude jumps, crash/reset/relocation/aircraft lifecycle, actual-speed arrival limits, all edges/corner, swept thin solids and terrain, fast real cross-region trips');
console.log(JSON.stringify(routes,null,2));
