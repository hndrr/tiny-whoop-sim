import {REGION_ELEVATIONS,groundHeight} from './world.mjs';
const bridgeZ=REGION_ELEVATIONS[2]+17,windZ=REGION_ELEVATIONS[6]+22;
const bayXs=[-992,-956,-920,-884,-848,-812];
const bayIds=['viaductWest1','viaductWest2','viaductMiddle1','viaductMiddle2','viaductEast1','viaductEast2'];
const towers=[[-1640,1790],[-1550,1850],[-1455,1910]];
const towerIds=['windWest','windCentre','windEast'];
export const REGIONAL_STAGES=[
 {id:'viaductRoute',region:'viaduct',kind:'weave',title:'stage6Title',description:'stage6Description',objectives:bayXs.map((x,i)=>({
  id:bayIds[i],title:bayIds[i]+'Title',hint:bayIds[i]+'Hint',mechanic:'crossing',
  target:[x,1100,bridgeZ],checkpoint:i?[bayXs[i-1],1100+(i%2?24:-24),bridgeZ]:[x,1034,bridgeZ],
  direction:i%2?-1:1,radius:11,crossingDepth:18,approachDistance:24,minAltitude:10,maxAltitude:24,horizontalLimit:50,verticalLimit:15,
 }))},
 {id:'windfarmCircuit',region:'windfarm',kind:'circuit',title:'stage7Title',description:'stage7Description',objectives:towers.map(([x,y],i)=>({
  id:towerIds[i],title:towerIds[i]+'Title',hint:towerIds[i]+'Hint',mechanic:'orbit',
  target:[x,y,windZ],checkpoint:i?[towers[i-1][0],towers[i-1][1]-24,windZ]:[x-24,y-55,windZ],
  radius:24,orbitTolerance:8,...(i?{entryAngle:-Math.PI/2}:{}),requiredAngle:Math.PI*2,minAltitude:14,maxAltitude:30,horizontalLimit:50,verticalLimit:15,
 }))},
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
export const regionalState=()=>({phase:'approach',previous:null,startAngle:null,lastAngle:null,resumeAngle:null,sweep:0,direction:1,progress:0,departCenter:null,departPhase:'around'});
function band(state,o){const altitude=state.z-groundHeight(state.x,state.y);return altitude>=o.minAltitude&&altitude<=o.maxAltitude}
export function regionalNavigation(o,task,state){
 if(o.mechanic==='crossing')return [o.target[0],o.target[1]+o.direction*(task.phase==='approach'?-o.approachDistance:o.approachDistance),o.target[2]];
 if(task.departCenter){
  const [x,y,z]=task.departCenter;
  if(task.departPhase==='outward')return [x,y-42,z];
  const angle=state?Math.atan2(state.y-y,state.x-x):-Math.PI/2;
  const turn=wrap(-Math.PI/2-angle);
  const next=angle+clamp(turn,-.45,.45);
  return [x+Math.cos(next)*28,y+Math.sin(next)*28,z];
 }
 let angle=task.resumeAngle;
 if(angle===null){
  angle=state?Math.atan2(state.y-o.target[1],state.x-o.target[0]):-Math.PI/2;
  if(task.phase==='approach'&&o.entryAngle!==undefined)angle=o.entryAngle;
  if(task.phase==='tracking')angle+=task.direction*.45;
 }
 return [o.target[0]+Math.cos(angle)*o.radius,o.target[1]+Math.sin(angle)*o.radius,o.target[2]];
}
export function regionalFeedback(state,o,task){
 const nav=regionalNavigation(o,task,state),distance=Math.hypot(nav[0]-state.x,nav[1]-state.y),altitude=state.z-groundHeight(state.x,state.y);
 const radial=Math.hypot(state.x-o.target[0],state.y-o.target[1]);
 const reason=state.crashed?'crashed':state.paused?'paused':altitude<o.minAltitude?'ascend':altitude>o.maxAltitude?'descend':o.mechanic==='crossing'?(task.phase==='approach'?'crossingApproach':'crossingPass'):task.departCenter?'orbitTransfer':task.resumeAngle!==null?'orbitReturn':task.phase==='tracking'&&Math.abs(radial-o.radius)<=o.orbitTolerance?'orbitTrack':'orbitApproach';
 return {reason,qualifies:false,distance,radius:o.radius,remaining:distance,altitude,minAltitude:o.minAltitude,maxAltitude:o.maxAltitude,horizontalSpeed:Math.hypot(state.vx,state.vy),verticalSpeed:Math.abs(state.vz),horizontalLimit:o.horizontalLimit,verticalLimit:o.verticalLimit,progress:task.progress,orbitStartAngle:task.startAngle??0,orbitAngle:task.sweep,orbitDirection:task.direction};
}
// Progress comes from a continuous flight path, never from elapsed hover time.
export function advanceRegional(state,o,task,dt){
 const point=[state.x,state.y,state.z];
 if(!point.every(Number.isFinite))return false;
 const previous=task.previous;task.previous=point;
 const continuous=!previous||Math.hypot(...point.map((v,i)=>v-previous[i]))<=Math.max(4,(state.speed||0)*dt*2+1);
 if(o.mechanic==='crossing'){
  const along=o.direction*(state.y-o.target[1]),inside=Math.abs(state.x-o.target[0])<=o.radius&&band(state,o);
  if(!inside||!continuous){task.phase='approach';task.progress=0;return false}
  if(task.phase==='approach'&&along<=-o.crossingDepth)task.phase='crossing';
  if(task.phase==='crossing'){
   task.progress=clamp((along+o.crossingDepth)/(2*o.crossingDepth),0,1);
   if(along>=o.crossingDepth)return true;
  }
  return false;
 }
 if(task.departCenter){
  const [x,y]=task.departCenter,angle=Math.atan2(state.y-y,state.x-x);
  if(Math.abs(wrap(-Math.PI/2-angle))<.18)task.departPhase='outward';
  if(task.departPhase==='outward'&&state.y<y-34&&Math.abs(state.x-x)<10){task.departCenter=null;task.previous=null}
  return false;
 }
 const radial=Math.hypot(state.x-o.target[0],state.y-o.target[1]),angle=Math.atan2(state.y-o.target[1],state.x-o.target[0]);
 if(!continuous||!band(state,o)||Math.abs(radial-o.radius)>o.orbitTolerance){
  if(task.lastAngle!==null)task.resumeAngle=task.lastAngle;
  task.lastAngle=null;return false;
 }
 if(task.resumeAngle!==null){
  if(Math.abs(wrap(angle-task.resumeAngle))>.18)return false;
  const rejoinDelta=wrap(angle-task.resumeAngle);
  // Backward re-entry must undo covered distance; otherwise a tiny sector can
  // be farmed by repeatedly stepping outside the band. Forward gaps earn zero.
  if(rejoinDelta*task.sweep<0)task.sweep-=Math.sign(task.sweep)*Math.min(Math.abs(task.sweep),Math.abs(rejoinDelta));
  task.progress=clamp(Math.abs(task.sweep)/o.requiredAngle,0,1);
  task.resumeAngle=null;task.lastAngle=angle;return false;
 }
 if(task.lastAngle===null){task.startAngle=angle;task.lastAngle=angle;task.phase='tracking';return false}
 const delta=wrap(angle-task.lastAngle);
 if(Math.abs(delta)>.35){task.resumeAngle=task.lastAngle;task.lastAngle=null;return false}
 task.lastAngle=angle;task.sweep+=delta;
 if(Math.abs(task.sweep)>.04)task.direction=Math.sign(task.sweep);
 task.progress=clamp(Math.abs(task.sweep)/o.requiredAngle,0,1);
 return task.progress>=1-1e-9;
}
