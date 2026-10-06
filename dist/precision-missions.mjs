import {GATES} from './flight.mjs';
import {groundHeight,REGIONS} from './world.mjs';
import {ERRAND_STAGES,errandStatus} from './errand-missions.mjs';

// An untimed task layer only. Flight dynamics, inputs and collision stay shared.
export const PRECISION_OBJECTIVES=Object.freeze([
 {id:'approach',title:'approachTitle',hint:'approachHint',target:[-18,30,3],checkpoint:[0,0,1.2]},
 {id:'inspect',title:'inspectTitle',hint:'inspectHint',target:[-40,30,3],checkpoint:[-18,30,3]},
 {id:'clear',title:'clearTitle',hint:'clearHint',target:[-18,30,3],checkpoint:[-40,30,3]},
 {id:'return',title:'returnTitle',hint:'returnHint',target:[0,0,.65],checkpoint:[-18,30,3]},
].map(o=>Object.freeze({...o,target:Object.freeze(o.target),checkpoint:Object.freeze(o.checkpoint)})));
export const HOLD_SECONDS=.8;
export const MISSION_STAGES=Object.freeze([
 {id:'intro',title:'stage1Title',description:'stage1Description',objectives:PRECISION_OBJECTIVES},
 {id:'tunnel',title:'stage2Title',description:'stage2Description',objectives:[
  {id:'align',title:'tunnelAlignTitle',hint:'tunnelAlignHint',target:[32,59,2],checkpoint:[32,49,2],radius:2,minAltitude:1.5,maxAltitude:2.5,horizontalLimit:1.5,verticalLimit:.7},
  {id:'lowPass',title:'tunnelLowTitle',hint:'tunnelLowHint',target:[32,71,1.5],checkpoint:[32,59,2],radius:1.8,minAltitude:1,maxAltitude:2,horizontalLimit:1.3,verticalLimit:.6},
  {id:'rise',title:'tunnelRiseTitle',hint:'tunnelRiseHint',target:[32,82,3.5],checkpoint:[32,71,1.5],radius:1.8,minAltitude:3,maxAltitude:4,horizontalLimit:1.3,verticalLimit:.6},
  {id:'exit',title:'tunnelExitTitle',hint:'tunnelExitHint',target:[32,96,1],checkpoint:[32,82,3.5],radius:2,minAltitude:.5,maxAltitude:1.5,horizontalLimit:1.2,verticalLimit:.6},
 ]},
 {id:'windows',title:'stage3Title',description:'stage3Description',objectives:[
  {id:'windowIn',title:'windowInTitle',hint:'windowInHint',target:[-40,15,3.5],checkpoint:[-40,0,3.5],radius:1.5,minAltitude:3,maxAltitude:4,horizontalLimit:1,verticalLimit:.5},
  {id:'highInspect',title:'highInspectTitle',hint:'highInspectHint',target:[-40,30,5.8],checkpoint:[-40,15,3.5],radius:1.5,minAltitude:5.4,maxAltitude:6.2,horizontalLimit:.8,verticalLimit:.4},
  {id:'windowAlign',title:'windowAlignTitle',hint:'windowAlignHint',target:[-40,45,3.5],checkpoint:[-40,30,5.8],radius:1.5,minAltitude:3,maxAltitude:4,horizontalLimit:1,verticalLimit:.5},
  {id:'windowOut',title:'windowOutTitle',hint:'windowOutHint',target:[-40,60,3.5],checkpoint:[-40,45,3.5],radius:1.5,minAltitude:3,maxAltitude:4,horizontalLimit:1,verticalLimit:.5},
  {id:'descent',title:'controlledDescentTitle',hint:'controlledDescentHint',target:[-40,60,.65],checkpoint:[-40,60,3.5],radius:1.5,minAltitude:.35,maxAltitude:.95,horizontalLimit:.7,verticalLimit:.35},
 ]},
...ERRAND_STAGES,
].map(stage=>Object.freeze({region:'airfield',...stage,objectives:Object.freeze(stage.objectives.map(o=>Object.freeze({...o,target:Object.freeze(o.target),checkpoint:Object.freeze(o.checkpoint)})))})));
export const normalizeStageIndex=value=>Number.isInteger(value)&&value>=0&&value<MISSION_STAGES.length?value:0;

// The HUD and completion use the same evaluator, so advice cannot drift from rules.
export function objectiveFeedback(state,objective){
 if(!objective)return {reason:'complete',qualifies:false};
 const landing=objective.id==='return',radius=objective.radius??(landing?5:4),minAltitude=objective.minAltitude??(landing?.075:1.2),maxAltitude=objective.maxAltitude??(landing?1.5:4.8);
 const horizontalLimit=objective.horizontalLimit??(landing?2.5:3),verticalLimit=objective.verticalLimit??(landing?1.5:2);
 const distance=Math.hypot(state.x-objective.target[0],state.y-objective.target[1]);
 const altitude=state.z-groundHeight(state.x,state.y),horizontalSpeed=Math.hypot(state.vx,state.vy),verticalSpeed=Math.abs(state.vz);
 const reason=state.crashed?'crashed':state.paused?'paused':distance>radius?'closer':altitude<minAltitude?'ascend':altitude>maxAltitude?'descend':horizontalSpeed>horizontalLimit?'brake':verticalSpeed>verticalLimit?'vertical':'hold';
 return {reason,qualifies:reason==='hold',distance,radius,remaining:Math.max(0,distance-radius),altitude,minAltitude,maxAltitude,horizontalSpeed,verticalSpeed,horizontalLimit,verticalLimit};
}
export function qualifiesForObjective(state,objective){return objectiveFeedback(state,objective).qualifies}
export class PrecisionMission {
 constructor(){this.completedStages=[];this.stageIndex=0;this.active=false;this.index=0;this.hold=0;this.done=false}
 get stage(){return MISSION_STAGES[this.stageIndex]}
 get objectives(){return this.stage.objectives}
 get taskStatus(){return errandStatus(this.stage,this.index)}
 get holdSeconds(){return HOLD_SECONDS}
 get allComplete(){return MISSION_STAGES.every((_,index)=>this.completedStages.includes(index))}
 get hasNext(){return this.stageIndex<MISSION_STAGES.length-1}
 get objective(){return this.active&&!this.done?this.objectives[this.index]:null}
 next(state){if(!this.active||!this.done||!this.hasNext)return false;this.start(state,this.stageIndex+1);return true}
 start(state,stageIndex=0){this.stageIndex=normalizeStageIndex(stageIndex);this.active=true;this.index=0;this.done=false;this.retry(state)}
 leave(){this.active=false;this.hold=0}
 retry(state){
  if(!this.active)return;
  if(this.done){this.index=0;this.done=false}
  const o=this.objective;state.reset();
  [state.x,state.y,state.z]=o.checkpoint;
  state.region=REGIONS.findIndex(region=>region.id===this.stage.region);
  state.heading=Math.atan2(-(o.target[0]-state.x),o.target[1]-state.y);
  // Disable legacy race bookkeeping while dispatches are active.
  state.practiceEnabled=false;state.complete=true;state.explore=true;state.gate=GATES.length;state.finishTime=null;
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
  if(this.index===this.objectives.length){this.done=true;if(!this.completedStages.includes(this.stageIndex))this.completedStages.push(this.stageIndex);state.paused=true;}
  return true;
 }
}
