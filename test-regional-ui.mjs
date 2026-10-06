import assert from 'node:assert/strict';
import * as T from './dist/vendor/three.module.min.js';
import {setupPrecision} from './dist/precision-ui.mjs';
import {FlightState} from './dist/flight.mjs';
import {i18n} from './dist/i18n.mjs';

// Test the actual Three.js guides and localized HUD without a WebGL context.
const nodes=new Map();
class Node {
 constructor(){this.style={};this.attrs={};this.children=[];this.classList={toggle(){}}}
 set textContent(value){this.textWrites=(this.textWrites??0)+1;this._text=value}get textContent(){return this._text??''}
 set id(value){this._id=value;nodes.set(value,this)}get id(){return this._id}
 set innerHTML(html){
  this.children=[];
  for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/g)){
   const node=new Node();
   for(const attribute of match[2].matchAll(/([\w-]+)="([^"]*)"/g))node.setAttribute(attribute[1],attribute[2]);
   this.children.push(node);
  }
 }
 append(...children){this.children.push(...children)}prepend(...children){this.children.unshift(...children)}
 setAttribute(key,value){this.attrs[key]=value;if(key==='id')this.id=value}
 getAttribute(key){return this.attrs[key]}hasAttribute(key){return Object.hasOwn(this.attrs,key)}
 removeAttribute(key){delete this.attrs[key]}blur(){}
}
const help=new Node();help.id='helpPanel';
globalThis.document={body:new Node(),createElement:()=>new Node(),getElementById:id=>nodes.get(id)};
const state=new FlightState(),scene=new T.Scene();
const ui=setupPrecision({scene,state,start(){},leave(){},retry(){}}),mission=ui.mission;
const get=id=>nodes.get(id),marker=scene.children[0];
const near=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-4,message);

for(const stageIndex of [5,6]){
 mission.start(state,stageIndex);
 for(let index=0;index<mission.objectives.length;index++){
  mission.index=index;mission.retry(state);
  const objective=mission.objective;
  for(const language of ['ja','en']){
   i18n.setLanguage(language);
   const before=JSON.stringify({state,mission});ui.render();
   assert.equal(JSON.stringify({state,mission}),before,'render/language must not change flight or task progress');
   assert.equal(get('dispatchTitle').textContent,i18n.t(objective.title));
   assert.notEqual(get('dispatchTitle').textContent,objective.title,'every regional objective has authored copy');
   assert.notEqual(get('dispatchHint').textContent,objective.hint,'every regional objective has a localized hint');
   assert.equal(get('dispatchPayload').textContent,i18n.t(mission.taskStatus));
   assert.equal(get('dispatchProgress').getAttribute('aria-label'),i18n.t(stageIndex===5?'crossingProgress':'orbitProgress'));
   assert.equal(get('dispatchProgress').getAttribute('aria-valuetext'),i18n.t('missionProgressValue',{progress:0}));
   assert(marker.children.slice(0,3).every(child=>!child.visible),'regional mechanics replace the hover marker');
   const statusWrites=get('dispatchStatus').textWrites,payloadWrites=get('dispatchPayload').textWrites;
   ui.render();ui.render();
   assert.equal(get('dispatchStatus').textWrites,statusWrites,'unchanged flight frames do not rewrite the live status');
   assert.equal(get('dispatchPayload').textWrites,payloadWrites,'unchanged flight frames do not rewrite the live task label');
  }
  const crossing=marker.getObjectByName('crossing-guide'),orbit=marker.getObjectByName('orbit-guide');
  assert.equal(crossing.visible,stageIndex===5);assert.equal(orbit.visible,stageIndex===6);
  if(stageIndex===5){
   const entrance=crossing.getObjectByName('crossing-entrance'),exit=crossing.getObjectByName('crossing-exit');
   assert.equal(entrance.position.y,-objective.direction*objective.crossingDepth,'entrance marks the real crossing plane');
   assert.equal(exit.position.y,objective.direction*objective.crossingDepth,'exit marks actual completion, not the farther waypoint');
   assert.equal(entrance.children[0].position.x,-objective.radius);
   assert.equal(entrance.children[1].position.x,objective.radius);
   assert.equal(entrance.children[2].position.z,objective.minAltitude);
   assert.equal(entrance.children[3].position.z,objective.maxAltitude);
   for(const arrow of crossing.getObjectByName('crossing-arrows').children)assert.equal(arrow.rotation.z,objective.direction===1?0:Math.PI);
  }else{
   const lane=orbit.getObjectByName('orbit-flight-lane');
   assert.equal(lane.geometry.parameters.innerRadius,objective.radius-objective.orbitTolerance);
   assert.equal(lane.geometry.parameters.outerRadius,objective.radius+objective.orbitTolerance);
   near(lane.position.z+marker.position.z,objective.target[2],'flight lane has the intended world altitude');
  }
  const nav=mission.navigationTarget,beacon=marker.getObjectByName('path-waypoint');
  assert(beacon.visible);
  beacon.position.toArray().forEach((value,axis)=>near(value+marker.position.toArray()[axis],nav[axis],'beacon follows the safe navigation target'));
  if(stageIndex===6){
   if(index===0)near(Math.hypot(nav[0]-objective.target[0],nav[1]-objective.target[1]),objective.radius,'initial orbit waypoint is on the safe ring');
   for(const tower of mission.objectives)assert(Math.hypot(nav[0]-tower.target[0],nav[1]-tower.target[1])>=tower.radius-tower.orbitTolerance,'ring/departure waypoints remain clear of every tower');
  }
 }
}

// Real mission flight builds an arc in either direction; pause and rejoin keep it.
for(const direction of [1,-1]){
 mission.start(state,6);state.paused=false;
 const objective=mission.objective;
 for(let step=0;step<=96;step++){
  const angle=-Math.PI/2+direction*step/96*Math.PI;
  [state.x,state.y,state.z]=[objective.target[0]+Math.cos(angle)*objective.radius,objective.target[1]+Math.sin(angle)*objective.radius,objective.target[2]];
  mission.update(state,1/60);
 }
 ui.render();
 assert.equal(get('dispatchProgress').getAttribute('aria-valuenow'),'50');
 assert.match(get('dispatchStatus').textContent,/Circle/);
 assert.match(get('dispatchDistance').textContent,/24.0 m from tower/);
 const arc=marker.getObjectByName('orbit-progress-arc');assert(arc.visible);
 const feedback=mission.feedback(state),positions=arc.geometry.attributes.position;
 near(positions.getX(48),Math.cos(feedback.orbitStartAngle+feedback.orbitAngle/2)*objective.radius,'arc matches the actual direction and accumulated route');
 near(positions.getY(48),Math.sin(feedback.orbitStartAngle+feedback.orbitAngle/2)*objective.radius,'arc matches the actual direction and accumulated route');
 const arcData=Array.from(positions.array),progress=mission.progress;
 state.paused=true;mission.update(state,1/60);ui.render();
 assert.equal(mission.progress,progress);assert.match(get('dispatchStatus').textContent,/Progress kept/);
 assert.deepEqual(Array.from(positions.array),arcData,'pause must not change the arc');
 i18n.setLanguage('ja');ui.render();assert.match(get('dispatchStatus').textContent,/進行状況を保持/);i18n.setLanguage('en');
 state.paused=false;state.x+=objective.radius;mission.update(state,1/60);ui.render();
 assert.equal(mission.feedback(state).reason,'orbitReturn');assert.match(get('dispatchStatus').textContent,/Return to the beacon/);
 assert.equal(mission.progress,progress);assert.deepEqual(Array.from(positions.array),arcData,'leaving the lane preserves the earned arc');
 [state.x,state.y,state.z]=mission.navigationTarget;mission.update(state,1/60);ui.render();
 assert.equal(mission.progress,progress);
 state.crashed=true;ui.render();assert.match(get('dispatchStatus').textContent,/^CRASHED/);
 mission.retry(state);ui.render();assert.equal(get('dispatchProgress').getAttribute('aria-valuenow'),'0');assert(!arc.visible);
}

mission.done=true;mission.index=mission.objectives.length;ui.render();
assert.equal(get('dispatchProgress').getAttribute('aria-label'),i18n.t('orbitProgress'),'completion keeps the correct mechanic label');
assert.equal(get('dispatchProgress').getAttribute('aria-valuenow'),'100');assert(!marker.visible);
mission.start(state,0);ui.render();
assert(marker.children.slice(0,3).every(child=>child.visible),'returning to an original stage restores the original marker');
for(const name of ['crossing-guide','orbit-guide','path-waypoint'])assert(!marker.getObjectByName(name).visible);
mission.leave();ui.render();assert(!marker.visible);assert(get('dispatchPanel').hidden);
delete globalThis.document;
console.log('PASS: nine localized regional objectives, six directional portal/arrow guides, safe path waypoints, bidirectional orbit arc, pause/rejoin retention, crash/retry/completion and legacy marker restore');
