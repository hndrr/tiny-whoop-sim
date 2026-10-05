import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FlightState} from './dist/flight.mjs';
import {PrecisionMission,PRECISION_OBJECTIVES,qualifiesForObjective} from './dist/precision-missions.mjs';
import {segmentHitsSolid,supportingSurfaceHeight} from './dist/stage.mjs';
import {groundHeight,isOverWater} from './dist/world.mjs';
const state=new FlightState(),mission=new PrecisionMission();state.setAircraft('cine95');mission.start(state);
assert(state.paused);assert.equal(state.aircraft,'cine95');assert.equal(state.complete,true);
for(const [i,o] of PRECISION_OBJECTIVES.entries()){
 assert.equal(mission.index,i);assert.deepEqual([state.x,state.y,state.z],o.checkpoint);
 assert(!segmentHitsSolid(o.checkpoint,o.target));assert(!segmentHitsSolid(o.target,o.target));assert(!isOverWater(...o.target));assert.equal(groundHeight(...o.target),0);
 const radius=i===3?5:4;
 for(let dx=-radius;dx<=radius;dx++)for(let dy=-radius;dy<=radius;dy++)if(dx*dx+dy*dy<=radius*radius)for(const z of i===3?[.08,.65,1.5]:[1.2,3,4.8]){
  const point=[o.target[0]+dx,o.target[1]+dy,z];assert(!segmentHitsSolid(point,point));assert.equal(supportingSurfaceHeight(...point),0);
 }
 state.paused=false;[state.x,state.y,state.z]=o.target;state.vx=state.vy=state.vz=0;
 for(let tick=0;tick<10;tick++)mission.update(state,.05);
 assert.equal(mission.index,i);assert(mission.hold>.4);
 const held=mission.hold;state.paused=true;mission.update(state,.05);assert.equal(mission.hold,held);state.paused=false;
 state.crashed=true;mission.update(state,.05);assert.equal(mission.index,i);state.crashed=false;
 state.vx=10;mission.update(state,.05);assert(mission.hold<held);state.vx=0;
 for(let tick=0;tick<20&&!mission.done&&mission.index===i;tick++)mission.update(state,.05);
 assert.equal(mission.index,i+1);
 if(!mission.done){mission.retry(state);assert.equal(mission.index,i+1);assert(state.paused);assert.equal(state.vx,0);assert.equal(state.vy,0);assert.equal(state.vz,0)}
}
assert(mission.done);const donePosition=[state.x,state.y,state.z];mission.update(state,.05);assert.equal(mission.index,4);assert.deepEqual([state.x,state.y,state.z],donePosition);
mission.retry(state);assert.equal(mission.index,0);assert(!mission.done);assert(state.paused);assert.equal(state.aircraft,'cine95');
state.paused=false;[state.x,state.y,state.z]=PRECISION_OBJECTIVES[2].target;assert.equal(mission.index,0);
state.z=5;assert(!qualifiesForObjective(state,mission.objective));state.z=3;state.vz=3;assert(!qualifiesForObjective(state,mission.objective));
mission.leave();const snapshot=JSON.stringify(state);mission.update(state,.05);assert.equal(JSON.stringify(state),snapshot);assert(!mission.active);
// A nearly-finished hold cannot complete on the frame in which collision is found.
mission.start(state);state.paused=false;[state.x,state.y,state.z]=mission.objective.target;mission.hold=.79;state.crashed=true;mission.update(state,.05);assert.equal(mission.index,0);assert(!mission.done);
mission.retry(state);assert.equal(mission.hold,0);assert(!state.crashed);
// Integration invariant: whole frame collision handling precedes dispatch advancement.
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');assert(main.includes('s.crashed=true}precision.mission.update(s,dt);drone.position'));
assert(main.includes('onAreaChange:()=>precision.mission.leave()'));assert(main.includes('precision.mission.retry(s)'));
console.log('PASS: four untimed dispatches, real geometry/clearance, forgiving hold, crash gating, per-objective retry, profile preservation, free-flight exit');
