import assert from 'node:assert/strict';
import {FlightState} from './dist/flight.mjs';
import {FLIGHT_PROFILES} from './dist/flight-profiles.mjs';
import {FLIGHT_HALF} from './dist/world.mjs';
const empty=new Set();
function state(id){const s=new FlightState();s.setAircraft(id);s.paused=false;s.z=500;return s}
function advance(s,seconds,axes={},fps=60){for(let i=0;i<Math.round(seconds*fps);i++)for(let j=0;j<2;j++)s.step(1/fps/2,empty,axes,false);return s}
const results=[];
for(const [id,profile] of Object.entries(FLIGHT_PROFILES)){
 // Opposing damping must fade out with the stick, not jump at zero.
 const neutral=state(id),tinyReverse=state(id);neutral.vy=tinyReverse.vy=12;
 advance(neutral,1);advance(tinyReverse,1,{pitch:-1e-9});
 assert(Math.abs(neutral.vy-tinyReverse.vy)<1e-6,'neutral/reverse input is continuous');
 for(const threshold of [.12,.65]){
  const a=advance(state(id),2,{pitch:threshold-1e-8}),b=advance(state(id),2,{pitch:threshold+1e-8});
  assert(Math.abs(a.vy-b.vy)<1e-5,'damping threshold is continuous');
 }
 const edge=state(id);edge.x=FLIGHT_HALF;edge.vx=-16*profile.topSpeed;edge.roll=-.5;
 advance(edge,1/60,{roll:-1});assert(Math.hypot(edge.vx,edge.vy)<=16*profile.topSpeed+1e-10,'boundary spring also respects norm cap');
 const samples=[];const s=state(id);
 for(let t=0;t<=8;t++){if([0,1,2,4,8].includes(t))samples.push({seconds:t,speed:s.vy,distance:s.y});advance(s,1,{pitch:1})}
 assert(samples[3].speed>samples[2].speed+3,'real speed continues to build through 4 seconds');
 assert(samples[4].speed>samples[3].speed+2,'real speed continues to build through 8 seconds');
 const forward=advance(state(id),20,{pitch:1});
 assert(Math.abs(forward.vy-16*profile.topSpeed)<.1,'bounded sustained cruise');
 const start=forward.y,initialSpeed=forward.vy;
 advance(forward,2);
 assert(forward.vy<initialSpeed*.15,'release sheds at least 85% of cruise speed in two seconds');
 assert(forward.y-start<16,'release braking travel remains bounded for every airframe');
 const reverse=advance(state(id),20,{pitch:1}),reverseStart=reverse.y;
 let stoppingTime=0,maxY=reverse.y;
 while(reverse.vy>0&&stoppingTime<5){advance(reverse,1/60,{pitch:-1});stoppingTime+=1/60;maxY=Math.max(maxY,reverse.y)}
 assert(stoppingTime<2.5,'opposite stick arrests forward momentum promptly');
 assert(maxY-reverseStart<15,'reverse overshoot is bounded');
 advance(reverse,4,{pitch:-1});assert(reverse.vy<-5,'reverse input actually reverses travel');
 for(const fps of [30,60,144]){
  const a=advance(state(id),8,{pitch:1},fps),b=advance(state(id),8,{pitch:Math.SQRT1_2,roll:Math.SQRT1_2},fps),keyboard=state(id);
  for(let i=0;i<8*fps;i++)for(let j=0;j<2;j++)keyboard.step(1/fps/2,new Set(['ArrowUp','ArrowRight']),{},false);
  assert(Math.abs(Math.hypot(b.vx,b.vy)-a.vy)<1e-9,'diagonal has no thrust or speed boost');
  assert(Math.abs(Math.hypot(keyboard.vx,keyboard.vy)-a.vy)<1e-9,'keyboard diagonal matches circular analog envelope');
  const reference=advance(state(id),8,{pitch:1},144);
  assert(Math.abs(a.vy-reference.vy)<.03,'frame-rate speed invariance');
  assert(Math.abs(a.y-reference.y)<.22,'frame-rate distance tolerance');
  for(const axes of [{pitch:1,roll:1,throttle:1},{pitch:-1,roll:1,throttle:1}]){
   const limited=advance(state(id),10,axes,fps);assert(Math.hypot(limited.vx,limited.vy)<=16*profile.topSpeed+1e-10,'norm cap also bounds climbing diagonals');
  }
 }
 for(const amount of [.05,.1,.2,.4,.6]){
  const partial=advance(state(id),4,{pitch:amount});assert(partial.vy>0&&partial.vy<8,'partial-stick precision remains controllable');
 }
 results.push({id,samples,releaseSpeed:forward.vy,releaseDistance:forward.y-start,reverseStopSeconds:stoppingTime,reverseOvershoot:maxY-reverseStart});
}
console.log('PASS: real progressive acceleration, sustained cruise, release/reverse braking, partial input, no diagonal boost, throttle cap and 30/60/144 Hz invariance across all five aircraft');
console.log(JSON.stringify(results,null,2));
