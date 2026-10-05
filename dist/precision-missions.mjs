import {GATES} from './flight.mjs';
import {groundHeight} from './world.mjs';

// An untimed task layer only. Flight dynamics, inputs and collision stay shared.
export const PRECISION_OBJECTIVES=Object.freeze([
 {id:'approach',title:'approachTitle',hint:'approachHint',target:[-18,30,3],checkpoint:[0,0,1.2]},
 {id:'inspect',title:'inspectTitle',hint:'inspectHint',target:[-40,30,3],checkpoint:[-18,30,3]},
 {id:'clear',title:'clearTitle',hint:'clearHint',target:[-18,30,3],checkpoint:[-40,30,3]},
 {id:'return',title:'returnTitle',hint:'returnHint',target:[0,0,.65],checkpoint:[-18,30,3]},
].map(o=>Object.freeze({...o,target:Object.freeze(o.target),checkpoint:Object.freeze(o.checkpoint)})));
export const HOLD_SECONDS=.8;
// The HUD and completion use the same evaluator, so advice cannot drift from rules.
export function objectiveFeedback(state,objective){
 if(!objective)return {reason:'complete',qualifies:false};
 const landing=objective.id==='return',radius=landing?5:4,minAltitude=landing?.075:1.2,maxAltitude=landing?1.5:4.8;
 const horizontalLimit=landing?2.5:3,verticalLimit=landing?1.5:2;
 const distance=Math.hypot(state.x-objective.target[0],state.y-objective.target[1]);
 const altitude=state.z-groundHeight(state.x,state.y),horizontalSpeed=Math.hypot(state.vx,state.vy),verticalSpeed=Math.abs(state.vz);
 const reason=state.crashed?'crashed':state.paused?'paused':distance>radius?'closer':altitude<minAltitude?'ascend':altitude>maxAltitude?'descend':horizontalSpeed>horizontalLimit?'brake':verticalSpeed>verticalLimit?'vertical':'hold';
 return {reason,qualifies:reason==='hold',distance,radius,remaining:Math.max(0,distance-radius),altitude,minAltitude,maxAltitude,horizontalSpeed,verticalSpeed,horizontalLimit,verticalLimit};
}
export function qualifiesForObjective(state,objective){return objectiveFeedback(state,objective).qualifies}
export class PrecisionMission {
 constructor(){this.active=false;this.index=0;this.hold=0;this.done=false}
 get objective(){return this.active&&!this.done?PRECISION_OBJECTIVES[this.index]:null}
 start(state){this.active=true;this.index=0;this.done=false;this.retry(state)}
 leave(){this.active=false;this.hold=0}
 retry(state){
  if(!this.active)return;
  if(this.done){this.index=0;this.done=false}
  const o=this.objective;state.reset();
  [state.x,state.y,state.z]=o.checkpoint;
  state.heading=Math.atan2(-(o.target[0]-state.x),o.target[1]-state.y);
  // Disable legacy race bookkeeping while dispatches are active.
  state.complete=true;state.explore=true;state.gate=GATES.length;state.finishTime=null;
  this.hold=0;
 }
 update(state,dt){
  if(!this.objective||state.paused||state.crashed)return false;
  if(!Number.isFinite(dt)||dt<=0)return false;
  // Called once after the full frame's collision checks, never before them.
  const step=Math.min(dt,.05);
  this.hold=Math.max(0,Math.min(HOLD_SECONDS,this.hold+(qualifiesForObjective(state,this.objective)?step:-step*.6)));
  if(this.hold+1e-9<HOLD_SECONDS)return false;
  this.hold=0;this.index++;
  if(this.index===PRECISION_OBJECTIVES.length)this.done=true;
  return true;
 }
}
