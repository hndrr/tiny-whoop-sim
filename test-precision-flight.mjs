import assert from 'node:assert/strict';
import {FlightState,GATES} from './dist/flight.mjs';
import {PrecisionMission,PRECISION_OBJECTIVES} from './dist/precision-missions.mjs';
import {segmentHitsSolid} from './dist/stage.mjs';
import {VEHICLES} from './dist/vehicle-catalog.mjs';

// Test-only pilot: normal proportional sticks, no position/velocity/heading
// mutation after launch. It flies the complete route without checkpoint retries.
const clamp=value=>Math.max(-1,Math.min(1,value));
function pilot(state,objective){
 const dx=objective.target[0]-state.x,dy=objective.target[1]-state.y;
 const cosine=Math.cos(state.heading),sine=Math.sin(state.heading);
 const rollError=dx*cosine+dy*sine,rollSpeed=state.vx*cosine+state.vy*sine;
 const pitchError=-dx*sine+dy*cosine,pitchSpeed=-state.vx*sine+state.vy*cosine;
 return {
  roll:clamp((rollError*.2-rollSpeed*.9)/5),
  pitch:clamp((pitchError*.2-pitchSpeed*.9)/5),
  yaw:0,
  throttle:clamp((objective.target[2]-state.z)*.3-state.vz*.1),
 };
}

const results=[];
for(const {id:aircraft} of VEHICLES)for(const fps of [30,60,120]){
 const state=new FlightState(),mission=new PrecisionMission(),keys=new Set();
 state.setAircraft(aircraft);mission.start(state);state.paused=false;
 const dt=1/fps,events=[];
 let frames=0;
 while(!mission.done&&!state.crashed&&frames<180*fps){
  const axes=pilot(state,mission.objective);
  // Match main.mjs: two physics substeps, swept collisions, then one mission tick.
  for(let substep=0;substep<2;substep++){
   const before=[state.x,state.y,state.z];
   state.step(dt/2,keys,axes);
   if(!state.crashed&&!state.paused&&segmentHitsSolid(before,[state.x,state.y,state.z]))state.crashed=true;
  }
  if(mission.update(state,dt))events.push(mission.index);
  assert.equal(state.gate,GATES.length,'Mission flight must never advance legacy gates');
  assert.equal(state.elapsed,0,'Mission flight must remain untimed');
  assert.equal(state.finishTime,null,'Mission flight must not set a race finish time');
  frames++;
 }
 const context=`${aircraft} at ${fps} Hz`;
 assert.equal(state.crashed,false,`${context}: collision-free continuous route`);
 assert.equal(mission.done,true,`${context}: all dispatches completed before test timeout`);
 assert.deepEqual(events,PRECISION_OBJECTIVES.map((_,index)=>index+1),`${context}: every objective advances once in order`);
 assert.equal(state.aircraft,aircraft,`${context}: selected aircraft retained`);
 assert.equal(state.paused,false,`${context}: completion preserves free flight`);
 const before=[state.x,state.y,state.z];mission.update(state,dt);
 assert.deepEqual([state.x,state.y,state.z],before,`${context}: completion does not teleport`);
 results.push({aircraft,fps,seconds:Number((frames/fps).toFixed(2))});
}
console.log('PASS: all five aircraft continuously fly four dispatches with real controls/collisions at 30, 60 and 120 Hz, no checkpoint teleport, no race time or score');
console.log(JSON.stringify(results,null,2));
