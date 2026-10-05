import assert from 'node:assert/strict';
import {FlightState,GATES} from './dist/flight.mjs';
import {PrecisionMission,MISSION_STAGES,objectiveFeedback} from './dist/precision-missions.mjs';
import {segmentHitsSolid,supportingSurfaceHeight} from './dist/stage.mjs';
import {groundHeight,isOverWater} from './dist/world.mjs';
import {VEHICLES} from './dist/vehicle-catalog.mjs';

// Ordinary proportional flight inputs only after launch. All routes run
// continuously: no position, heading or velocity edits and no retries in flight.
const clamp=value=>Math.max(-1,Math.min(1,value));
function pilot(state,objective){
 const dx=objective.target[0]-state.x,dy=objective.target[1]-state.y;
 const c=Math.cos(state.heading),s=Math.sin(state.heading);
 return {
  roll:clamp(((dx*c+dy*s)*.2-(state.vx*c+state.vy*s)*.9)/5),
  pitch:clamp(((-dx*s+dy*c)*.2-(-state.vx*s+state.vy*c)*.9)/5),
  yaw:0,
  throttle:clamp((objective.target[2]-state.z)*.3-state.vz*.1),
 };
}
function feedback(objective){return objectiveFeedback({x:objective.target[0],y:objective.target[1],z:objective.target[2],vx:0,vy:0,vz:0,paused:false,crashed:false},objective)}
function boundaryPoints(objective){
 const f=feedback(objective),points=[];
 for(const z of [f.minAltitude,objective.target[2],f.maxAltitude]){
  points.push([objective.target[0],objective.target[1],z]);
  for(let angle=0;angle<16;angle++)points.push([objective.target[0]+f.radius*Math.cos(angle*Math.PI/8),objective.target[1]+f.radius*Math.sin(angle*Math.PI/8),z]);
 }
 return points;
}

// Include exact cylindrical boundaries and a dense interior grid. The limits
// are AGL, and the chosen airfield routes must stay on its flat, dry ground.
let volumeSamples=0,adjacentSegments=0;
for(const stage of MISSION_STAGES){
 let previousPoints=null;
 for(const objective of stage.objectives){
  const f=feedback(objective),points=boundaryPoints(objective);
  assert(f.qualifies,`${stage.id}/${objective.id}: target qualifies`);
  assert(!segmentHitsSolid(objective.checkpoint,objective.target),`${stage.id}/${objective.id}: retry-to-target route is clear`);
  for(let x=-f.radius;x<=f.radius;x+=.25)for(let y=-f.radius;y<=f.radius;y+=.25){
   if(Math.hypot(x,y)>f.radius)continue;
   for(const z of [f.minAltitude,objective.target[2],f.maxAltitude])points.push([objective.target[0]+x,objective.target[1]+y,z]);
  }
  for(const p of points){
   assert(!segmentHitsSolid(p,p),`${stage.id}/${objective.id}: accepted point ${p} overlaps an obstacle`);
   assert.equal(groundHeight(p[0],p[1]),0,`${stage.id}/${objective.id}: flat airfield ground`);
   assert.equal(isOverWater(p[0],p[1]),false,`${stage.id}/${objective.id}: dry ground`);
   assert.equal(supportingSurfaceHeight(...p),0,`${stage.id}/${objective.id}: no hidden raised landing surface`);
   volumeSamples++;
  }
  const currentPoints=boundaryPoints(objective);
  // Preserve the legacy intro, whose large circles permit off-centre routes
  // near thin hangar columns. Exhaustive edge routes are a new-stage guarantee.
  if(previousPoints&&stage.id!=='intro')for(const a of previousPoints)for(const b of currentPoints){
   assert(!segmentHitsSolid(a,b),`${stage.id}/${objective.id}: transition from accepted boundary ${a} to ${b} crosses an obstacle`);
   adjacentSegments++;
  }
  previousPoints=currentPoints;
 }
}
console.log(`PASS: ${volumeSamples} target-volume samples and ${adjacentSegments} adjacent-boundary routes clear actual geometry`);

const results=[];
for(const [stageIndex,stage] of MISSION_STAGES.entries())for(const {id:aircraft} of VEHICLES)for(const fps of [30,60,120]){
 const state=new FlightState(),mission=new PrecisionMission(),keys=new Set();
 state.setAircraft(aircraft);mission.start(state,stageIndex);state.paused=false;
 const dt=1/fps,events=[];
 let frames=0;
 while(!mission.done&&!state.crashed&&frames<180*fps){
  const axes=pilot(state,mission.objective);
  // Match the application: two physics substeps, swept collision, mission tick.
  for(let substep=0;substep<2;substep++){
   const before=[state.x,state.y,state.z];
   state.step(dt/2,keys,axes,false);
   if(!state.crashed&&!state.paused&&segmentHitsSolid(before,[state.x,state.y,state.z]))state.crashed=true;
  }
  if(mission.update(state,dt))events.push(mission.index);
  assert.equal(state.gate,GATES.length,'Mission flight must never advance legacy gates');
  assert.equal(state.elapsed,0,'Mission flight must remain untimed');
  assert.equal(state.finishTime,null,'Mission flight must not set a race finish time');
  frames++;
 }
 const context=`${stage.id}, ${aircraft} at ${fps} Hz`;
 assert.equal(state.crashed,false,`${context}: collision-free continuous route`);
 assert.equal(mission.done,true,`${context}: all objectives completed before test timeout`);
 assert.deepEqual(events,stage.objectives.map((_,index)=>index+1),`${context}: every objective advances once, in order`);
 assert.equal(state.aircraft,aircraft,`${context}: selected aircraft retained`);
 assert.equal(state.paused,true,`${context}: stage completion pauses safely`);
 const before=[state.x,state.y,state.z];mission.update(state,dt);
 assert.deepEqual([state.x,state.y,state.z],before,`${context}: completion does not teleport`);
 results.push({stage:stage.id,aircraft,fps,seconds:Number((frames/fps).toFixed(2))});
}
console.log('PASS: 45 continuous flights, all 3 stages × all 5 airframes × 30/60/120 Hz, normal controls, real collisions, no retry teleport');
console.log(JSON.stringify(results,null,2));

// A light initial drift represents releasing the controls during a stable hold.
for(const [stageIndex,stage] of MISSION_STAGES.entries())for(const {id:aircraft} of VEHICLES)for(const [index,objective] of stage.objectives.entries()){
 const state=new FlightState(),mission=new PrecisionMission();state.setAircraft(aircraft);mission.start(state,stageIndex);mission.index=index;state.paused=false;
 [state.x,state.y,state.z]=objective.target;state.vx=.3;state.vy=.2;state.vz=.1;
 for(let tick=0;tick<90&&mission.index===index;tick++){
  for(let substep=0;substep<2;substep++){
   const before=[state.x,state.y,state.z];state.step(1/120,new Set(),{roll:0,pitch:0,yaw:0,throttle:0},false);
   assert(!segmentHitsSolid(before,[state.x,state.y,state.z]),`${stage.id}/${objective.id} ${aircraft}: neutral hold geometry`);
  }
  mission.update(state,1/60);
 }
 assert.equal(mission.index,index+1,`${stage.id}/${objective.id} ${aircraft}: released controls complete hold`);
 assert(!state.crashed);
}
console.log('PASS: released neutral controls complete every stage objective on every airframe');

// Choosing the last stage directly does not claim earlier stages were completed.
{const mission=new PrecisionMission(),state=new FlightState();mission.start(state,2);mission.index=mission.objectives.length-1;[state.x,state.y,state.z]=mission.objective.target;state.paused=false;for(let tick=0;tick<16;tick++)mission.update(state,.05);assert(mission.done);assert.equal(mission.allComplete,false);assert.deepEqual(mission.completedStages,[2]);mission.start(state,0);assert.deepEqual(mission.completedStages,[2]);}
