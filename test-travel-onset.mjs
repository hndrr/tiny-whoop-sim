import assert from 'node:assert/strict';
import {FlightState} from './dist/flight.mjs';
import {FLIGHT_PROFILES} from './dist/flight-profiles.mjs';
import {HORIZONTAL_CRUISE} from './dist/horizontal-cruise.mjs';
const empty=new Set();
function start(id='whoop75',altitude=120){const s=new FlightState();s.setAircraft(id);Object.assign(s,{x:5000,y:-5000,z:altitude-2.4,paused:false});return s}
function trace(id,fps,seconds,input){
 const s=start(id),rows=[];let previousAcceleration=0,maxAcceleration=0,maxPositiveJerk=0;
 for(let n=0;n<Math.round(seconds*fps*2);n++){
  const dt=1/(fps*2),t=n*dt,before=Math.hypot(s.vx,s.vy),axes=input(t,s);
  s.step(dt,empty,axes,false);
  const speed=Math.hypot(s.vx,s.vy),acceleration=(speed-before)/dt,jerk=(acceleration-previousAcceleration)/dt;
  maxAcceleration=Math.max(maxAcceleration,acceleration);
  // Deliberately responsive braking is separate from positive acceleration take-up.
  if(acceleration>0&&previousAcceleration>=0)maxPositiveJerk=Math.max(maxPositiveJerk,jerk);
  rows.push({t:t+dt,speed,distance:s.y+5000,acceleration,jerk,blend:s.cruiseBlend,indicated:s.indicatedSpeed});previousAcceleration=acceleration;
 }
 return {s,rows,maxAcceleration,maxPositiveJerk};
}
const report=[];
for(const [id,p] of Object.entries(FLIGHT_PROFILES))for(const fps of [30,60,144]){
 for(const [scenario,input,seconds] of [
  ['keyboard',()=>({pitch:1}),8],
  ['gradualStick',t=>({pitch:Math.min(1,t/2)}),10],
  ['thresholdOscillation',t=>({pitch:.8+.025*Math.sin(t*8)}),8],
 ]){
  const r=trace(id,fps,seconds,input);
  assert(r.maxAcceleration<=HORIZONTAL_CRUISE.travelAcceleration*p.acceleration+.05,`${id}/${fps}/${scenario}: acceleration limit`);
  assert(r.maxPositiveJerk<=HORIZONTAL_CRUISE.travelJerk*p.acceleration+.5,`${id}/${fps}/${scenario}: positive take-up jerk`);
  if(scenario==='keyboard'){
   const early=r.rows[Math.round(.1*fps*2)-1];assert(early.blend>0&&early.speed>.3,'keyboard response starts immediately');
   assert(r.s.vy>16*p.topSpeed*19,'fast sustained world travel retained');
   const reference=trace(id,144,8,()=>({pitch:1}));assert(Math.abs(r.s.y-reference.s.y)<.15,'onset displacement frame invariance');
  }
  report.push({id,fps,scenario,speed:r.s.vy,distance:r.s.y+5000,maxAcceleration:r.maxAcceleration,maxPositiveJerk:r.maxPositiveJerk});
 }
 // Actual ascent crosses the clearance thresholds continuously, no position edits.
 const s=start(id,29);let previous=0,maxRiseJerk=0;
 for(let n=0;n<20*fps*2;n++){
  const v=Math.hypot(s.vx,s.vy),dt=1/(fps*2);s.step(dt,empty,{pitch:1,throttle:1},false);
  const a=(Math.hypot(s.vx,s.vy)-v)/dt;
  if(a>0&&previous>=0)maxRiseJerk=Math.max(maxRiseJerk,(a-previous)/dt);
  previous=a;assert(!s.crashed);
 }
 assert(maxRiseJerk<=HORIZONTAL_CRUISE.travelJerk*p.acceleration+.5,'altitude entry take-up is bounded');
 // Brief release/reapply cannot reuse an old stored positive acceleration.
 const r=trace(id,fps,5,()=>({pitch:1})).s;
 for(let n=0;n<Math.ceil(.1*fps*2);n++)r.step(1/(fps*2),empty,{},false);
 assert.equal(r.cruiseAcceleration,0);
 const v=Math.hypot(r.vx,r.vy);r.step(1/(fps*2),empty,{pitch:1},false);
 assert(Math.hypot(r.vx,r.vy)-v<=HORIZONTAL_CRUISE.travelJerk*p.acceleration/(fps*2)**2,'reapply ramps from cleared acceleration');
}
// Static stick response has no special discontinuity at the old80% threshold.
for(const amount of [.45,.65,.8,.9]){
 const a=trace('whoop75',120,5,()=>({pitch:amount-1e-6})),b=trace('whoop75',120,5,()=>({pitch:amount+1e-6}));
 assert(Math.abs(a.s.vy-b.s.vy)<.01,`continuous stick response at ${amount}`);
}
// Very small throttle/yaw input changes no longer toggle a held cruise timer.
for(const axis of ['throttle','yaw']){
 const a=trace('whoop75',120,5,()=>({pitch:1,[axis]:-1e-6})),b=trace('whoop75',120,5,()=>({pitch:1,[axis]:1e-6}));
 assert(Math.abs(a.s.vy-b.s.vy)<.02,`${axis}: no binary re-engagement`);
}
console.log('PASS: immediate keyboard take-up, bounded positive acceleration/jerk, gradual and oscillating stick, ascent clearance transitions, release/reapply, continuous old thresholds, all five aircraft at30/60/144Hz');
console.log(JSON.stringify(report,null,2));
