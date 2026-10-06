import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as T from './dist/vendor/three.module.min.js';
import {CHASE_CAMERA,createChaseCamera} from './dist/chase-camera.mjs';
import {FlightState} from './dist/flight.mjs';
import {VEHICLES,createVehicle,disposeVehicle} from './dist/vehicle-catalog.mjs';
const main=readFileSync(new URL('./dist/main.mjs',import.meta.url),'utf8');
const radius=Math.hypot(CHASE_CAMERA.back,CHASE_CAMERA.height),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function close(a,b,message,tolerance=1e-9){assert(Math.abs(a-b)<=tolerance,`${message}: ${a} vs ${b}`)}
function makeCamera(aspect=16/9){return new T.PerspectiveCamera(72,aspect,.025,20000)}
function inspect(camera,state){
 camera.updateMatrixWorld();
 const position=new T.Vector3(state.x,state.y,state.z),view=position.clone().applyMatrix4(camera.matrixWorldInverse),ndc=position.clone().project(camera);
 return {distance:camera.position.distanceTo(position),depth:-view.z,scale:1/(-view.z*Math.tan(camera.fov*Math.PI/360)),x:ndc.x,y:ndc.y,heading:Math.atan2(camera.position.x-state.x,state.y-camera.position.y)};
}
const origin={x:0,y:0,z:1.2,heading:0},baselineCamera=makeCamera();createChaseCamera().update(baselineCamera,origin,0);const base=inspect(baselineCamera,origin);
function stable(camera,state,message){
 const m=inspect(camera,state);close(m.distance,radius,`${message}: fixed radius`);close(m.depth,base.depth,`${message}: fixed projection depth`);close(m.scale,base.scale,`${message}: fixed optical scale`);close(m.x,0,`${message}: centered laterally`);close(m.y,base.y,`${message}: same forward framing`);assert(m.y<0,'aircraft stays below center, preserving space ahead');assert.equal(camera.fov,72);return m;
}
// Kinematic camera tests deliberately reach beyond all five boosted speed caps.
let samples=0;
for(const fps of [20,30,60,144])for(const aspect of [390/844,844/390,16/9])for(const speed of [0,5,16,18.88,43.2,48,52.8,56.64,80]){
 for(const direction of [[0,1,0],[0,-1,0],[1,0,0],[.6,.8,.12],[0,0,-1]]){
  const camera=makeCamera(aspect),chase=createChaseCamera(),state={...origin};chase.update(camera,state,0);
  for(let i=1;i<=fps*3;i++){
   state.x=12000+direction[0]*speed*i/fps;state.y=-12000+direction[1]*speed*i/fps;state.z=300+direction[2]*speed*i/fps;
   chase.update(camera,state,1/fps);stable(camera,state,`${fps} Hz / ${speed} m/s`);samples++;
  }
 }
}
// Accelerating, braking, reversing, climbing/descending and rolling do not zoom.
for(const fps of [30,60,144]){
 const camera=makeCamera(),chase=createChaseCamera(),state={...origin};chase.update(camera,state,0);
 for(let i=1;i<=fps*10;i++){
  const t=i/fps,speed=56.64*Math.sin(t*Math.PI/5);state.y+=speed/fps;state.z+=8*Math.sin(t)/fps;state.pitch=.5*Math.sin(t*2);state.roll=.5*Math.cos(t*2);
  chase.update(camera,state,1/fps);stable(camera,state,'accelerate/brake/reverse');
 }
}
// Smoothed heading keeps a circular boom, even through wrap and sharp reversals.
const steadyLags=[];
for(const fps of [20,30,60,144]){
 const camera=makeCamera(),chase=createChaseCamera(),state={...origin};chase.update(camera,state,0);let previousHeading=0;
 for(let i=1;i<=fps*8;i++){
  const t=i/fps;state.heading=1.593*(t<4?t:8-t);state.x+=-Math.sin(state.heading)*56.64/fps;state.y+=Math.cos(state.heading)*56.64/fps;
  chase.update(camera,state,1/fps);const m=stable(camera,state,'fast turn/reversal');
  assert(Math.abs(wrap(m.heading-previousHeading))<=1.593/fps+1e-9,'yaw is eased without a step or long-way turn');previousHeading=m.heading;
  if(i===fps*3)steadyLags.push(wrap(state.heading-m.heading));
 }
}
assert(Math.max(...steadyLags)-Math.min(...steadyLags)<.04,'20–144 Hz yaw-lag spread stays below 2.3 degrees');
assert(steadyLags.every(lag=>lag>0&&lag<.24),'turn easing remains close behind the aircraft heading');
{
 const camera=makeCamera(),chase=createChaseCamera(),state={...origin,heading:179*Math.PI/180};chase.update(camera,state,0);state.heading=-179*Math.PI/180;
 chase.update(camera,state,1/60);const m=stable(camera,state,'yaw wrap');assert(Math.abs(wrap(m.heading-179*Math.PI/180))<.01,'wrap takes the short two-degree arc');
 state.heading=0;const before=m.heading;chase.update(camera,state,.05);const after=stable(camera,state,'half-turn');assert(Math.abs(wrap(after.heading-before))<Math.PI*.3,'instant heading reversal is still eased');
}
// Exponential turn response composes exactly for a fixed target across frame rates.
const settled=[];
for(const fps of [20,30,60,144]){
 const camera=makeCamera(),chase=createChaseCamera(),state={...origin};chase.update(camera,state,0);state.heading=1.5;
 for(let i=0;i<fps;i++)chase.update(camera,state,1/fps);settled.push(inspect(camera,state).heading);
}
for(const h of settled)close(h,1.5*(1-Math.exp(-7)),'frame-rate-independent fixed-target easing');
// Irregular frames, background gaps, resets and direct teleports retain framing.
{
 const camera=makeCamera(),chase=createChaseCamera(),state={...origin};chase.update(camera,state,0);
 for(const dt of [1/144,1/30,.012,.041,0,-1,NaN,Infinity,30]){state.y+=.2;state.heading+=.01;chase.update(camera,state,dt);stable(camera,state,'irregular time step')}
 state.x=9000;state.y=-7000;state.z=900;state.heading=2;chase.update(camera,state,1/60);close(inspect(camera,state).heading,2,'teleport snaps yaw and anchors in one update');stable(camera,state,'teleport');
 state.x+=.1;state.heading=-1;chase.reset();chase.update(camera,state,0);close(inspect(camera,state).heading,-1,'nearby reset discards old yaw immediately');stable(camera,state,'nearby reset');
}
// Real flight model: all aircraft run through launch, turn, release and pause.
for(const {id} of VEHICLES)for(const fps of [30,60,144]){
 const state=new FlightState();state.setAircraft(id);state.z=400;state.paused=false;
 const camera=makeCamera(),chase=createChaseCamera(),model=createVehicle(id);assert.deepEqual(model.group.scale.toArray(),[1,1,1]);chase.update(camera,state,0);
 for(let i=0;i<fps*8;i++){
  const t=i/fps,axes={pitch:t<5?1:0,yaw:t>2&&t<4?.7:0};for(let sub=0;sub<2;sub++)state.step(1/fps/2,new Set(),axes,false);
  chase.update(camera,state,1/fps);stable(camera,state,`${id} actual flight`);
 }
 state.paused=true;for(let i=0;i<fps;i++){state.step(1/fps,new Set(),{},false);chase.update(camera,state,1/fps);stable(camera,state,'pause')}
 state.reset();chase.reset();chase.update(camera,state,0);stable(camera,state,'real reset');
 state.relocate(6);chase.reset();chase.update(camera,state,0);stable(camera,state,'real region relocation');disposeVehicle(model.group);
}
// Execute the actual main frame and switch/reset functions, with only rendering
// and scenery stubbed. Three.js camera/mesh transforms are real, not GPU pixels.
const between=(start,end)=>{const from=main.indexOf(start),to=main.indexOf(end,from);assert(from>=0&&to>from);return main.slice(from,to)};
{
 const camera=makeCamera(),state=new FlightState(),drone=new T.Group(),chase=createChaseCamera();state.paused=true;
 const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id)};
 const mission={active:false,update:()=>false,retry(s){s.reset();s.heading=2;s.z=40}};
 const context={T,camera,s:state,drone,chaseCamera:chase,fpv:false,previous:0,time:0,flightStarted:false,$,
  document:{body:{classList:{toggle(){}}}},resize(){},keys:new Set(),axes:{},clearSticks(){},updateHUD(){},
  precision:{mission},flightSelection:{reset(){state.reset()}},skyDome:new T.Group(),airfieldGroup:new T.Group(),terrainChunks:[],regionGroups:[],turbines:[],sun:new T.DirectionalLight(),
  propellers:[],vehiclePreset:VEHICLES[0],aim:new T.Vector3(),local:new T.Vector3(),up:new T.Vector3(),forward:new T.Vector3(),
  forest:{update(){}},segmentHitsSolid:()=>false,oceanMat:{uniforms:{clock:{value:0}}},postMat:{uniforms:{clock:{value:0},fpv:{value:0}}},
  renderer:{setRenderTarget(){},render(){}},target:{},scene:{},postScene:{},postCam:{},renderProfile:null,requestAnimationFrame(){},
 };
 const controller=runInNewContext(between('function reset(){','document.body.classList.add(\'fpv\')')+between('function frame(now){','// Inspectable')+';({frame,reset,switchCamera})',context);
 let now=0;
 for(let i=0;i<24;i++){
  controller.switchCamera();now+=16;controller.frame(now);
  if(context.fpv){
   assert.equal(camera.fov,105);assert.equal(drone.visible,false);
   const expected=drone.position.clone().add(new T.Vector3(...VEHICLES[0].camera).applyQuaternion(drone.quaternion));close(camera.position.distanceTo(expected),0,'actual FPV mount remains unchanged');
  }else{assert.equal(drone.visible,true);stable(camera,state,'repeated camera switch')}
  state.x+=.5;state.heading+=.13;
 }
 assert.equal(context.fpv,false);
 for(const active of [false,true]){mission.active=active;controller.reset();now+=16;controller.frame(now);stable(camera,state,'actual reset callback');close(inspect(camera,state).heading,state.heading,'actual reset clears old yaw')}
}
for(const snippet of ["$('relocate').onclick=()=>{chaseCamera.reset();",'function reset(){chaseCamera.reset();','function switchCamera(){chaseCamera.reset();','if(precision.mission.next(s)){chaseCamera.reset();','function replayMissionStage(){chaseCamera.reset();','function startSelectedFlight(mode,stageIndex=0){chaseCamera.reset();'])assert(main.includes(snippet),`reposition/switch lifecycle reset: ${snippet}`);
assert(!main.includes('camera.position.lerp('),'world-space camera translation lag is removed');
assert(main.includes('camera.fov=fpv?105:72'),'both FOVs stay unchanged');
// Quantify the old mechanism using its original exact discrete update.
const oldDistances=[];
for(const speed of [0,16,48,56.64]){
 const camera=makeCamera(),state={...origin};camera.position.set(0,-.8,1.6);
 for(let i=0;i<600;i++){state.y+=speed/60;camera.position.lerp(new T.Vector3(0,state.y-.8,state.z+.4),1-Math.exp(-7/60))}
 oldDistances.push({speed,oldDistance:camera.position.distanceTo(new T.Vector3(state.x,state.y,state.z)),newDistance:radius});
}
console.log('PASS: chase optical scale/framing, '+samples+' constant-speed samples, all aircraft actual flight, 20–144 Hz, turns/wrap/reversal, jitter, reset/teleport, and actual repeated FPV/CHASE switches');
console.log('Distance comparison at 60 Hz:',JSON.stringify(oldDistances));
console.log('CPU projection/transform checks only; actual WebGL appearance and physical-device smoothness remain unverified');
