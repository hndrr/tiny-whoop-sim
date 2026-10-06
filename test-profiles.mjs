import assert from 'node:assert/strict';
import {FlightState} from './dist/flight.mjs';
import {FLIGHT_PROFILES,getFlightProfile,profileMetrics} from './dist/flight-profiles.mjs';
import {VEHICLES} from './dist/vehicle-catalog.mjs';
import {bindSticks} from './dist/controls.mjs';
assert.deepEqual(VEHICLES.map(v=>v.id),Object.keys(FLIGHT_PROFILES));
for(const id of ['invalid','__proto__','toString',null,undefined])assert.equal(getFlightProfile(id),FLIGHT_PROFILES.whoop75);
function fly(id,seconds,dt=1/120,keys=new Set(),axes={pitch:1}){
 const s=new FlightState();s.setAircraft(id);s.paused=false;s.z=500;
 for(let i=0;i<Math.round(seconds/dt);i++)s.step(dt,keys,axes);
 return s;
}
const results={};
for(const [id,p] of Object.entries(FLIGHT_PROFILES)){
 for(const value of [p.acceleration,p.response,p.topSpeed])assert(value>=.75&&value<=1.2);
 const launch=fly(id,.3),cruise=fly(id,20),turn=fly(id,.15,1/120,new Set(),{yaw:1,roll:1});
 results[id]={launch:launch.vy,speed:cruise.vy,turn:turn.heading,bank:turn.roll};
 assert(Math.abs(cruise.vy-16*p.topSpeed)<.1);assert(profileMetrics(id).includes(String(Math.round(p.topSpeed*100))));
 const a=fly(id,2,1/120,new Set(['ArrowUp','KeyA','KeyW']),{}),b=fly(id,2,1/120,new Set(),{pitch:1,yaw:1,throttle:1});assert.deepEqual(a,b,'keyboard and analog profile: '+id);
 const stable=fly(id,3,1/120),coarse=fly(id,3,1/40);assert(Math.abs(stable.y-coarse.y)<.25,'frame-rate position tolerance: '+id);assert(Math.abs(stable.vy-coarse.vy)<.1);
 const reset=new FlightState();reset.setAircraft(id);reset.reset();assert.equal(reset.aircraft,id);reset.relocate(1);assert.equal(reset.aircraft,id);
 const neutral=fly(id,2,1/120,new Set(),{});assert.equal(neutral.z,500);assert.equal(neutral.speed,0);
}
const base=results.whoop75;
for(const [id,p] of Object.entries(FLIGHT_PROFILES)){
 assert(Math.abs(results[id].speed/base.speed-p.topSpeed)<.012,'actual terminal speed ratio: '+id);
 assert(Math.abs(results[id].turn/base.turn-p.response)<1e-10,'actual turn ratio: '+id);
}
assert(results.micro65.launch>base.launch&&results.micro65.bank>base.bank&&results.micro65.speed<base.speed);
assert(results.scout85.launch<base.launch&&results.scout85.turn<base.turn&&results.scout85.speed>base.speed);
assert(results.racer90.launch>base.launch&&results.racer90.speed>results.scout85.speed);
assert(results.cine95.launch<results.scout85.launch&&results.cine95.turn<results.scout85.turn);
// Actual pointer handlers feed exactly the same profile as keyboard input.
class Stick extends EventTarget{
 constructor(){super();this.knob={style:{}};this.classList={toggle(){}};this.captured=new Set()}
 getBoundingClientRect(){return {left:0,top:0,width:100,height:100}}
 querySelector(){return this.knob}setPointerCapture(id){this.captured.add(id)}hasPointerCapture(id){return this.captured.has(id)}releasePointerCapture(id){this.captured.delete(id)}
 fire(type,pointerType,id,x,y){const e=new Event(type,{cancelable:true});Object.assign(e,{pointerType,pointerId:id,clientX:x,clientY:y,button:0});this.dispatchEvent(e)}
}
for(const id of Object.keys(FLIGHT_PROFILES))for(const type of ['mouse','touch']){
 const left=new Stick(),right=new Stick(),axes={};const sticks=bindSticks({getElementById:id=>id==='leftStick'?left:right,querySelectorAll:()=>[]},new Set(),axes);
 right.fire('pointerdown',type,1,50,17);assert.deepEqual(fly(id,1,1/120,new Set(),axes),fly(id,1,1/120,new Set(['ArrowUp']),{}));sticks.clear();assert.equal(axes.pitch,0);
 right.fire('pointerdown',type,3,83,17);assert.deepEqual(fly(id,1,1/120,new Set(),axes),fly(id,1,1/120,new Set(['ArrowUp','ArrowRight']),{}),'diagonal keyboard/pointer parity: '+id+'/'+type);sticks.clear();
 left.fire('pointerdown',type,2,50,83);assert.deepEqual(fly(id,1,1/120,new Set(),axes),fly(id,1,1/120,new Set(['KeyS']),{}));sticks.clear();
}
console.log('PASS: five restrained real physics profiles, terminal speed/response/launch differences, hover, reset/relocation retention, frame-rate tolerance, keyboard/mouse/touch parity');
console.log(JSON.stringify(results,null,2));
