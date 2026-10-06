import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FlightState,GATES} from './dist/flight.mjs';
import {PrecisionMission,MISSION_STAGES} from './dist/precision-missions.mjs';
import {REGIONAL_STAGES} from './dist/regional-missions.mjs';
import {groundHeight,isOverWater,REGIONS,REGION_ELEVATIONS,WORLD_OBJECTS} from './dist/world.mjs';
import {segmentHitsSolid,supportingSurfaceHeight} from './dist/stage.mjs';
import {VEHICLES} from './dist/vehicle-catalog.mjs';

// Regional missions use the unchanged flight engine. The pilots below emit
// ordinary normalized sticks only: no in-flight position, velocity, heading,
// mission-progress edits or retry calls are used to complete these routes.
const clamp=value=>Math.max(-1,Math.min(1,value));
const point=state=>[state.x,state.y,state.z];
const physicalState=state=>[state.x,state.y,state.z,state.vx,state.vy,state.vz,state.heading,state.pitch,state.roll];
const rightStick=(roll,pitch)=>{
 const length=Math.hypot(roll,pitch);
 return length>1?{roll:roll/length,pitch:pitch/length}:{roll,pitch};
};

function gentlePilot(state,mission,direction=1){
 const objective=mission.objective;
 let target=mission.navigationTarget;
 // Choose clockwise by flying clockwise. Once the mission observes that
 // direction, its own moving guidance target takes over without state edits.
 if(objective.mechanic==='orbit'&&direction===-1&&mission.task.phase==='tracking'&&mission.task.direction!==-1&&mission.task.resumeAngle===null){
  const angle=Math.atan2(state.y-objective.target[1],state.x-objective.target[0])-.45;
  target=[objective.target[0]+Math.cos(angle)*objective.radius,objective.target[1]+Math.sin(angle)*objective.radius,objective.target[2]];
 }
 const dx=target[0]-state.x,dy=target[1]-state.y,c=Math.cos(state.heading),s=Math.sin(state.heading);
 return {
  ...rightStick(clamp(((dx*c+dy*s)*.2-(state.vx*c+state.vy*s)*.9)/5),clamp(((-dx*s+dy*c)*.2-(-state.vx*s+state.vy*c)*.9)/5)),
  yaw:0,throttle:clamp((target[2]-state.z)*.3-state.vz*.1),
 };
}

// A quicker, skilled pilot flies a 7 m/s tangent with gentle radial correction,
// then steers toward the same displayed navigation target during transfers.
// The velocity controller accounts for the selected aircraft's public profile,
// but still actuates only ordinary roll/pitch/throttle, through FlightState.step.
function skilledPilot(state,mission,direction=1){
 const objective=mission.objective,target=mission.navigationTarget;
 const dx=state.x-objective.target[0],dy=state.y-objective.target[1],radius=Math.hypot(dx,dy),nx=dx/radius,ny=dy/radius;
 let vx,vy,feedX=0,feedY=0;
 if(mission.task.phase==='tracking'&&mission.task.resumeAngle===null){
  vx=-ny*7*direction+nx*(objective.radius-radius)*.7;
  vy=nx*7*direction+ny*(objective.radius-radius)*.7;
  feedX=-nx*49/radius;feedY=-ny*49/radius;
 }else{
  vx=(target[0]-state.x)*.7;vy=(target[1]-state.y)*.7;
  const speed=Math.hypot(vx,vy);
  if(speed>8){vx*=8/speed;vy*=8/speed}
 }
 const profile=state.profile,drag=.45*profile.acceleration/profile.topSpeed;
 const ax=(vx-state.vx)*1.4+vx*drag+feedX,ay=(vy-state.vy)*1.4+vy*drag+feedY,c=Math.cos(state.heading),s=Math.sin(state.heading);
 return {
  ...rightStick((ax*c+ay*s)/(5*profile.acceleration),(-ax*s+ay*c)/(5*profile.acceleration)),
  yaw:0,throttle:clamp((target[2]-state.z)*.3-state.vz*.1),
 };
}

const regionalIndices=MISSION_STAGES.map((stage,index)=>REGIONAL_STAGES.some(regional=>regional.id===stage.id)?index:-1).filter(index=>index>=0);
assert.deepEqual(regionalIndices,[5,6],'the two regional routes extend the existing five missions');
const [weave,circuit]=regionalIndices.map(index=>MISSION_STAGES[index]);
assert.equal(weave.region,'viaduct');assert.equal(circuit.region,'windfarm');
assert.equal(weave.objectives.length,6,'each of the six viaduct bays is used once');
assert.equal(circuit.objectives.length,3,'each physical wind turbine is circled once');

let volumeSamples=0,transitionSegments=0;
function clearPoint(p,context){
 assert(!segmentHitsSolid(p,p,.3),`${context}: accepted point ${p} clears solid geometry by 0.3 m`);
 assert(p[2]-groundHeight(p[0],p[1])>1,`${context}: accepted point clears terrain`);
 assert(!isOverWater(p[0],p[1]),`${context}: route stays over the real ridge`);
 assert.equal(supportingSurfaceHeight(...p),groundHeight(p[0],p[1]),`${context}: no raised landing surface intrudes into the route`);
 volumeSamples++;
}
function clearSegment(a,b,context){
 assert(!segmentHitsSolid(a,b,.3),`${context}: swept path clears solid geometry by 0.3 m`);
 const steps=Math.max(1,Math.ceil(Math.hypot(...b.map((value,index)=>value-a[index]))/2));
 for(let step=0;step<=steps;step++){
  const t=step/steps,p=a.map((value,index)=>value+(b[index]-value)*t);
  assert(p[2]-groundHeight(p[0],p[1])>1,`${context}: transition clears terrain`);
 }
 transitionSegments++;
}

for(const [index,objective] of weave.objectives.entries()){
 const context=`${weave.id}/${objective.id}`;
 assert.equal(objective.mechanic,'crossing');
 assert.equal(objective.direction,index%2?-1:1,'bay crossings alternate north/south');
 assert(objective.approachDistance>objective.crossingDepth,'guidance extends past the required crossing depth');
 const heights=[objective.minAltitude,(objective.minAltitude+objective.maxAltitude)/2,objective.maxAltitude];
 // Include both corridor boundaries, both altitude limits, and interior points.
 for(let lateral=-objective.radius;lateral<=objective.radius;lateral++)for(let along=-objective.approachDistance;along<=objective.approachDistance;along+=2)for(const altitude of heights){
  const x=objective.target[0]+lateral,y=objective.target[1]+objective.direction*along;
  clearPoint([x,y,groundHeight(x,y)+altitude],context);
 }
 clearPoint(objective.checkpoint,context);
 const approach=[objective.target[0],objective.target[1]-objective.direction*objective.approachDistance,objective.target[2]];
 clearSegment(objective.checkpoint,approach,`${context}: retry approach`);
 const deck=WORLD_OBJECTS.find(solid=>solid.region===REGIONS.findIndex(region=>region.id===weave.region)&&solid.material==='floor');
 assert(deck,'the mission uses the actual viaduct deck');
 assert(objective.target[2]<deck.position[2]-deck.size[2]/2,'bay target is below the actual deck');
 for(const lateral of [-objective.radius,0,objective.radius])for(const altitude of heights){
  const x=objective.target[0]+lateral,y=objective.target[1]-objective.direction*objective.crossingDepth;
  clearSegment([x,y,groundHeight(x,y)+altitude],[objective.target[0],objective.target[1]+objective.direction*objective.approachDistance,objective.target[2]],`${context}: accepted entrance to exit`);
 }
 if(index){
  const previous=weave.objectives[index-1];
  for(const lateral of [-previous.radius,0,previous.radius])for(const along of [previous.crossingDepth,previous.approachDistance])for(const altitude of heights){
   const x=previous.target[0]+lateral,y=previous.target[1]+previous.direction*along;
   clearSegment([x,y,groundHeight(x,y)+altitude],approach,`${context}: previous exit to next bay approach`);
  }
 }
}

// Turbine blades are rendered outside WORLD_OBJECTS, so collision-only checks
// would miss their moving envelope. Read the actual renderer's hub height,
// blade dimensions and radial offset rather than inventing test-only geometry.
const rendererSource=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
const rotorHeightMatch=rendererSource.match(/rotor\.position\.set\(r\.x\+x,r\.y\+y\+([\d.]+),REGION_ELEVATIONS\[6\]\+([\d.]+)\)/);
const bladeSizeMatch=rendererSource.match(/const blade=box\(\[[^\]]+\],\[([\d.]+),([\d.]+),([\d.]+)\],white,rotor\)/);
const bladeOffsetMatch=rendererSource.match(/blade\.position\.set\(Math\.sin\(i\*Math\.PI\*2\/3\)\*([\d.]+),0,Math\.cos\(i\*Math\.PI\*2\/3\)\*([\d.]+)\)/);
assert(rotorHeightMatch&&bladeSizeMatch&&bladeOffsetMatch,'derive the blade envelope from the current rendered turbine geometry');
assert.equal(Number(bladeOffsetMatch[1]),Number(bladeOffsetMatch[2]),'rendered blade offsets have equal radial extent');
assert.match(rendererSource,/turbines\.forEach\(r=>r\.rotation\.y\+=/,'the blades sweep around the rendered horizontal y axis');
const bladeTipRadius=Math.hypot(Number(bladeOffsetMatch[1])+Number(bladeSizeMatch[3])/2,Number(bladeSizeMatch[1])/2);
const rotorFloor=REGION_ELEVATIONS[6]+Number(rotorHeightMatch[2])-bladeTipRadius;
let minimumBladeClearance=Infinity;
for(const objective of circuit.objectives){
 const context=`${circuit.id}/${objective.id}`;
 assert.equal(objective.mechanic,'orbit');
 assert.equal(objective.requiredAngle,Math.PI*2,'each turbine requires a full signed revolution');
 const tower=WORLD_OBJECTS.find(solid=>solid.region===REGIONS.findIndex(region=>region.id===circuit.region)&&solid.shape==='cylinder'&&solid.position[0]===objective.target[0]&&solid.position[1]===objective.target[1]);
 assert(tower,`${context}: orbit is centred on a real physical turbine`);
 assert(segmentHitsSolid(objective.target,objective.target),`${context}: tower centre is an obstacle, never an arrival zone`);
 for(let radius=objective.radius-objective.orbitTolerance;radius<=objective.radius+objective.orbitTolerance;radius+=.5)for(let angle=0;angle<360;angle+=2)for(const altitude of [objective.minAltitude,(objective.minAltitude+objective.maxAltitude)/2,objective.maxAltitude]){
  const x=objective.target[0]+Math.cos(angle*Math.PI/180)*radius,y=objective.target[1]+Math.sin(angle*Math.PI/180)*radius;
  clearPoint([x,y,groundHeight(x,y)+altitude],context);
  const bladeClearance=rotorFloor-(groundHeight(x,y)+objective.maxAltitude);
  assert(bladeClearance>.3,`${context}: entire accepted altitude band stays below the actual rotating blade envelope`);
  minimumBladeClearance=Math.min(minimumBladeClearance,bladeClearance);
 }
 clearPoint(objective.checkpoint,context);
 const angle=Math.atan2(objective.checkpoint[1]-objective.target[1],objective.checkpoint[0]-objective.target[0]);
 clearSegment(objective.checkpoint,[objective.target[0]+Math.cos(angle)*objective.radius,objective.target[1]+Math.sin(angle)*objective.radius,objective.target[2]],`${context}: retry approach`);
}
console.log(`PASS: ${volumeSamples} regional corridor/annulus samples and ${transitionSegments} approach/transition paths clear terrain and real solids`);
console.log(`PASS: actual rendered rotor envelope stays at least ${minimumBladeClearance.toFixed(2)} m above every accepted orbit altitude`);

const results=[];
function fly(stageIndex,aircraft,fps,{direction=1,skilled=false}={}){
 const state=new FlightState(),mission=new PrecisionMission(),keys=new Set();
 state.setAircraft(aircraft);
 let resets=0;
 const reset=state.reset.bind(state);state.reset=()=>{resets++;return reset()};
 mission.start(state,stageIndex);state.paused=false;
 const stage=mission.stage,context=`${stage.id}/${aircraft}/${fps} Hz/${skilled?'skilled':'gentle'}/${direction}`;
 const events=[],sweeps=[],dt=1/fps;
 let frames=0,distance=0,minClearance=Infinity,maxHorizontalSpeed=0;
 while(!mission.done&&!state.crashed&&frames<600*fps){
  const axes=(skilled?skilledPilot:gentlePilot)(state,mission,direction);
  for(const value of Object.values(axes))assert(Number.isFinite(value)&&Math.abs(value)<=1,`${context}: finite normalized control input`);
  assert(Math.hypot(axes.roll,axes.pitch)<=1+1e-12,`${context}: right stick stays inside real circular travel`);
  for(let substep=0;substep<2;substep++){
   const before=point(state);state.step(dt/2,keys,axes,false);
   assert(!segmentHitsSolid(before,point(state),.3),`${context}: collision-free swept flight at ${point(state)}`);
   assert(!state.crashed,`${context}: ground/water contact never crashes the aircraft`);
   const clearance=state.z-groundHeight(state.x,state.y);
   assert(clearance>1,`${context}: continuous flight clears real terrain`);
   minClearance=Math.min(minClearance,clearance);maxHorizontalSpeed=Math.max(maxHorizontalSpeed,Math.hypot(state.vx,state.vy));
   distance+=Math.hypot(state.x-before[0],state.y-before[1]);
  }
  const beforeUpdate=physicalState(state),task=mission.task,objective=mission.objective;
  if(mission.update(state,dt)){
   events.push(mission.index);
   if(objective.mechanic==='orbit'){
    assert(task.sweep*direction>=objective.requiredAngle-1e-9,`${context}: correct complete signed circle`);
    sweeps.push(task.sweep);
   }
  }
  assert.deepEqual(physicalState(state),beforeUpdate,`${context}: objective advancement never moves the aircraft`);
  assert.equal(state.elapsed,0,`${context}: remains untimed`);
  assert.equal(state.gate,GATES.length,`${context}: never advances legacy race gates`);
  assert.equal(state.practiceCount,0,`${context}: regional missions never count practice rings`);
  assert.equal(state.finishTime,null,`${context}: no race finish time`);
  assert.equal(resets,1,`${context}: no retry or mid-route reset`);
  assert(Number.isFinite(mission.progress)&&mission.progress>=0&&mission.progress<=1,`${context}: progress remains normalized`);
  frames++;
 }
 assert(mission.done,`${context}: continuous flight completes before timeout (objective ${mission.index}, progress ${mission.progress})`);
 assert.deepEqual(events,stage.objectives.map((_,index)=>index+1),`${context}: every objective advances once in order`);
 assert.equal(state.aircraft,aircraft,`${context}: selected aircraft is preserved`);
 assert.equal(state.region,REGIONS.findIndex(region=>region.id===stage.region),`${context}: selected world region is preserved`);
 assert(state.paused,`${context}: final completion pauses safely`);
 assert.equal(mission.progress,1,`${context}: completion displays full progress`);
 assert.deepEqual(mission.completedStages,[stageIndex],`${context}: choosing this stage does not claim earlier stages`);
 const complete=physicalState(state);assert.equal(mission.update(state,dt),false);assert.deepEqual(physicalState(state),complete);
 if(skilled)assert(frames/fps<=120,`${context}: a controlled 7 m/s circuit is achievable within two minutes`);
 const result={stage:stage.id,aircraft,fps,pilot:skilled?'skilled':'gentle',direction,seconds:frames/fps,metres:distance,minClearance,maxHorizontalSpeed,circles:sweeps.length};
 results.push(result);return result;
}

for(const stageIndex of regionalIndices)for(const {id:aircraft} of VEHICLES)for(const fps of [30,60,144])fly(stageIndex,aircraft,fps);
for(const {id:aircraft} of VEHICLES)for(const fps of [30,60,144])fly(regionalIndices[1],aircraft,fps,{direction:-1});
for(const {id:aircraft} of VEHICLES)for(const fps of [30,60,144])for(const direction of [1,-1])fly(regionalIndices[1],aircraft,fps,{skilled:true,direction});

// Changing render rate must not materially change the same control policy.
for(const result of results.filter(result=>result.fps===30)){
 const family=results.filter(other=>other.stage===result.stage&&other.aircraft===result.aircraft&&other.pilot===result.pilot&&other.direction===result.direction);
 assert.equal(family.length,3);
 assert(Math.max(...family.map(row=>row.seconds))-Math.min(...family.map(row=>row.seconds))<result.seconds*.02,`${result.stage}/${result.aircraft}: frame-rate-independent completion`);
 assert(Math.max(...family.map(row=>row.metres))-Math.min(...family.map(row=>row.metres))<result.metres*.01,`${result.stage}/${result.aircraft}: frame-rate-independent route`);
}
for(const [stage,pilot,direction] of [[weave.id,'gentle',1],[circuit.id,'gentle',1],[circuit.id,'gentle',-1],[circuit.id,'skilled',1],[circuit.id,'skilled',-1]]){
 const rows=results.filter(result=>result.stage===stage&&result.pilot===pilot&&result.direction===direction);
 const range=key=>`${Math.min(...rows.map(row=>row[key])).toFixed(1)}–${Math.max(...rows.map(row=>row[key])).toFixed(1)}`;
 console.log(`PASS: ${rows.length} ${stage} ${pilot} direction ${direction}: ${range('seconds')} s, ${range('metres')} m, ${range('minClearance')} m minimum AGL`);
}
console.log(`PASS: ${results.length} complete regional flights; all five airframes at 30/60/144 Hz; clockwise and counter-clockwise circuits; normal circular-travel sticks; real terrain and swept collisions; no in-flight resets or teleportation`);

// Independently initialize valid end-of-circle boundary states, including
// substantial tangent momentum in either direction. Setup is the only place
// these positions/velocities are assigned; each transfer then flies normally.
// This catches guidance that cuts through the turbine just circled instead of
// first following the safe southern departure corridor.
let boundaryTransfers=0,longestTransfer=0;
for(const {id:aircraft} of VEHICLES)for(const fps of [30,144])for(let octant=0;octant<8;octant++)for(const radialEdge of [-1,1])for(const altitudeEdge of ['minAltitude','maxAltitude'])for(const direction of [1,-1]){
 const state=new FlightState(),mission=new PrecisionMission();
 state.setAircraft(aircraft);mission.start(state,regionalIndices[1]);mission.index=1;mission.retry(state);
 const previous=mission.objectives[0],angle=octant*Math.PI/4,radius=previous.radius+radialEdge*previous.orbitTolerance;
 state.x=previous.target[0]+radius*Math.cos(angle);state.y=previous.target[1]+radius*Math.sin(angle);
 state.z=groundHeight(state.x,state.y)+previous[altitudeEdge];
 state.vx=-Math.sin(angle)*7*direction;state.vy=Math.cos(angle)*7*direction;state.vz=0;state.speed=7;state.paused=false;
 const context=`departure/${aircraft}/${fps} Hz/octant ${octant}/radial edge ${radialEdge}/${altitudeEdge}/direction ${direction}`;
 const dt=1/fps,keys=new Set();
 let frames=0;
 assert(mission.task.departCenter,`${context}: next tower starts with safe departure guidance`);
 while((mission.task.departCenter||mission.task.phase!=='tracking')&&frames<120*fps){
  const axes=skilledPilot(state,mission,direction);
  assert(Math.hypot(axes.roll,axes.pitch)<=1+1e-12,`${context}: normalized circular stick travel`);
  for(let substep=0;substep<2;substep++){
   const before=point(state);state.step(dt/2,keys,axes,false);
   assert(!segmentHitsSolid(before,point(state),.3),`${context}: departing and transferring never hit a turbine`);
   assert(!state.crashed,`${context}: continuous transfer never crashes`);
   assert(state.z-groundHeight(state.x,state.y)>1,`${context}: continuous transfer clears terrain`);
  }
  const beforeUpdate=physicalState(state);mission.update(state,dt);
  assert.deepEqual(physicalState(state),beforeUpdate,`${context}: departure guidance never moves the aircraft`);
  frames++;
 }
 assert.equal(mission.index,1,`${context}: transfer only enters the next circle`);
 assert.equal(mission.task.departCenter,null,`${context}: safe departure finishes`);
 assert.equal(mission.task.phase,'tracking',`${context}: continuous control reaches the next tower's annulus`);
 longestTransfer=Math.max(longestTransfer,frames/fps);boundaryTransfers++;
}
console.log(`PASS: ${boundaryTransfers} continuous turbine transfers from angular/radial/altitude boundaries, both 7 m/s tangent directions, all five aircraft at 30/144 Hz; longest ${longestTransfer.toFixed(1)} s`);
