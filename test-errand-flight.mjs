import assert from 'node:assert/strict';
import {FlightState} from './dist/flight.mjs';
import {PrecisionMission,MISSION_STAGES,objectiveFeedback} from './dist/precision-missions.mjs';
import {ERRAND_STAGES,errandStatus} from './dist/errand-missions.mjs';
import {groundHeight,REGIONS} from './dist/world.mjs';
import {segmentHitsSolid} from './dist/stage.mjs';
import {VEHICLES} from './dist/vehicle-catalog.mjs';
const clamp=value=>Math.max(-1,Math.min(1,value));
const pilot=(state,objective)=>{
 const dx=objective.target[0]-state.x,dy=objective.target[1]-state.y,c=Math.cos(state.heading),s=Math.sin(state.heading);
 return {roll:clamp(((dx*c+dy*s)*.2-(state.vx*c+state.vy*s)*.9)/5),pitch:clamp(((-dx*s+dy*c)*.2-(-state.vx*s+state.vy*c)*.9)/5),yaw:0,throttle:clamp((objective.target[2]-state.z)*.3-state.vz*.1)};
};
assert.equal(ERRAND_STAGES.length,2);assert.equal(MISSION_STAGES.length,5);
for(const stage of MISSION_STAGES.slice(3)){
 assert(REGIONS.some(region=>region.id===stage.region));
 const length=stage.objectives.reduce((sum,o,index)=>{const previous=index?stage.objectives[index-1].target:o.checkpoint;return sum+Math.hypot(o.target[0]-previous[0],o.target[1]-previous[1])},0);
 assert(length>=300&&length<=900,`${stage.id}: bounded wide-world route (${length} m)`);
 for(const o of stage.objectives){
  assert(o.radius>=15,'outdoor arrival zones are generous');
  for(let angle=0;angle<16;angle++)for(const radius of [0,o.radius/2,o.radius])for(const altitude of [o.minAltitude,(o.minAltitude+o.maxAltitude)/2,o.maxAltitude]){
   const x=o.target[0]+radius*Math.cos(angle*Math.PI/8),y=o.target[1]+radius*Math.sin(angle*Math.PI/8),z=groundHeight(x,y)+altitude;
   assert(!segmentHitsSolid([x,y,z],[x,y,z]),`${stage.id}/${o.id}: accepted volume avoids solids`);
  }
 }
 // From accepted lower-band boundary positions, the next objective does not
 // direct pilots through land or solids. Higher paths are covered by controls.
 let previousPoints=[stage.objectives[0].checkpoint];
 for(const o of stage.objectives){
  const points=Array.from({length:9},(_,i)=>{const angle=i*Math.PI/4,radius=i===8?0:o.radius,x=o.target[0]+radius*Math.cos(angle),y=o.target[1]+radius*Math.sin(angle);return [x,y,groundHeight(x,y)+o.minAltitude]});
  for(const a of previousPoints)for(const b of points){
   assert(!segmentHitsSolid(a,b,1),`${stage.id}/${o.id}: broad-zone transitions clear physical obstacles`);
   const steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2);
   for(let step=0;step<=steps;step++){const t=step/steps,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,z=a[2]+(b[2]-a[2])*t;assert(z-groundHeight(x,y)>1,`${stage.id}/${o.id}: broad-zone transitions clear terrain/water`)}
  }
  previousPoints=points;
 }
 console.log(`PASS: ${stage.id} route ${Math.round(length)} m, ${stage.region}, broad collision-free arrival volumes`);
}
const results=[];
for(const [index,stage] of MISSION_STAGES.entries()){
 if(!stage.kind)continue;
 for(const {id:aircraft} of VEHICLES)for(const fps of [30,60]){
  const state=new FlightState(),mission=new PrecisionMission();state.setAircraft(aircraft);mission.start(state,index);state.paused=false;
  const dt=1/fps,events=[];let frames=0;
  while(!mission.done&&!state.crashed&&frames<240*fps){
   const axes=pilot(state,mission.objective);
   for(let substep=0;substep<2;substep++){
    const before=[state.x,state.y,state.z];state.step(dt/2,new Set(),axes,false);
    if(!state.paused&&!state.crashed&&segmentHitsSolid(before,[state.x,state.y,state.z]))state.crashed=true;
   }
   if(mission.update(state,dt))events.push(mission.index);
   assert.equal(state.elapsed,0);assert.equal(state.finishTime,null);frames++;
  }
  assert(!state.crashed,`${stage.id}/${aircraft}/${fps}: real control path must not collide`);
  assert(mission.done,`${stage.id}/${aircraft}/${fps}: must complete continuous route`);
  assert(state.paused);assert.deepEqual(events,stage.objectives.map((_,i)=>i+1));
  assert.equal(state.region,REGIONS.findIndex(region=>region.id===stage.region));
  results.push({stage:stage.id,aircraft,fps,seconds:Math.round(frames/fps)});
 }
 const mission=new PrecisionMission(),state=new FlightState();mission.start(state,index);
 const initial=errandStatus(stage,0);assert.equal(mission.taskStatus,initial);
 for(let i=0;i<stage.objectives.length;i++){
  const o=mission.objective;state.paused=false;[state.x,state.y,state.z]=o.target;state.vx=state.vy=state.vz=0;
  assert(objectiveFeedback(state,o).qualifies);
  const before=[state.x,state.y,state.z];for(let n=0;n<16;n++)mission.update(state,.05);
  assert.equal(mission.index,i+1);assert.deepEqual([state.x,state.y,state.z],before,'objective advancement never teleports');
  assert.equal(mission.taskStatus,errandStatus(stage,i+1));
  if(!mission.done){const status=mission.taskStatus;mission.retry(state);assert.equal(mission.taskStatus,status,'retry preserves acquired parcel/inspection');assert.equal(mission.index,i+1)}
 }
 mission.start(state,index);assert.equal(mission.taskStatus,initial,'replay clears parcel/inspection');
}
console.log('PASS: 20 continuous outdoor flights × all five airframes × 30/60 Hz, normal controls, real terrain/water/solids, no mid-route teleport');
console.log(JSON.stringify(results,null,2));
