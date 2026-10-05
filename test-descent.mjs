import assert from 'node:assert/strict';
import {stepVertical,verticalTarget,VERTICAL_FLIGHT} from './dist/vertical-flight.mjs';
import {supportingSurfaceHeight,segmentHitsSolid} from './dist/stage.mjs';
import {groundHeight,SEA_LEVEL,isOverWater,lowAltitudeWarning} from './dist/world.mjs';
import {FlightState} from './dist/flight.mjs';
import {FLIGHT_PROFILES} from './dist/flight-profiles.mjs';

const close=(actual,expected,tolerance=1e-9)=>assert(Math.abs(actual-expected)<=tolerance,`${actual} should be within ${tolerance} of ${expected}`);
const airborne=(z=100,x=0,y=0,vz=0)=>({x,y,z,vz});
function advance(state,lift,seconds,dt=1/60){
  for(let time=0;time<seconds-1e-10;time+=dt){
    const step=stepVertical(state,lift,Math.min(dt,seconds-time));
    state.vz=step.vz;state.z+=step.dz;
  }
  return state;
}

// Preserve the established ~5 m/s ascent, then reverse without a long float.
const climb=advance(airborne(),1,3);
assert(climb.vz>4.99&&climb.vz<=5);
assert(climb.z>113&&climb.z<114);
const reversalStart={...climb};
advance(climb,-1,.35);
assert(climb.vz<0,'held down must reverse a full-speed climb in less than 0.35 s');
assert(climb.z-reversalStart.z<.8,'climb reversal overshoot should remain below 0.8 m');
advance(climb,-1,1.65);
assert(climb.vz< -7.95&&climb.vz>=-8);
assert(climb.z<reversalStart.z-7);
console.log('PASS: 5 m/s climb, quick climb-to-descent reversal, bounded acceleration');

// A long descent should not inherit the former ~4.9 m/s vertical drag ceiling.
const high=advance(airborne(),-1,2);
assert(high.vz< -7.98);
let descentTime=0;
const highToLow=airborne();
while(highToLow.z>1&&descentTime<20){advance(highToLow,-1,1/60);descentTime+=1/60}
assert(descentTime>13&&descentTime<14,`100→1 m descent took ${descentTime}s`);
assert(highToLow.vz< -3.4&&highToLow.vz> -3.6);
console.log(`PASS: high-altitude descent reaches 8 m/s; 100→1 m in ${descentTime.toFixed(2)} s`);

// Release deliberately brakes to a hover; it does not recapture an old height.
for(const velocity of [-8,5]){
  const state=advance(airborne(100,0,0,velocity),0,1);
  assert(Math.abs(state.vz)<.04);
  assert(Math.sign(state.vz)===Math.sign(velocity),'release must not bounce');
  assert(Math.abs(state.z-100)<1.9);
  const stoppedHeight=state.z;
  advance(state,0,2);
  assert(Math.abs(state.vz)<1e-6);
  assert(Math.abs(state.z-stoppedHeight)<.007);
}
const hover=advance(airborne(),0,10);
close(hover.z,100);close(hover.vz,0);
console.log('PASS: release brakes in under one second without bounce or altitude recapture');

// Proportional stick inputs stay proportional at every clearance. Full down is
// reduced progressively near surfaces, but never commands an automatic stop.
for(const clearance of [0,.2,1,2,5,10,17,18,40]){
  const full=verticalTarget(-1,clearance);
  assert(full<=-3.4&&full>=-8);
  for(const lift of [-.001,-.1,-.2,-.5,-1])close(verticalTarget(lift,clearance),-lift*full);
  close(verticalTarget(1,clearance),5);
  close(verticalTarget(.2,clearance),1);
}
close(verticalTarget(-1,0),-3.4);close(verticalTarget(-1,18),-8);
assert(verticalTarget(-1,5)>verticalTarget(-1,10));
assert(verticalTarget(-1,10)>verticalTarget(-1,18));
for(const input of [-.001,-.2,-1]){
  const near=advance(airborne(.8),input,.1);
  assert(near.vz<0&&near.z<.8,'held down must not secretly hover or climb');
}
console.log('PASS: continuous low-clearance response and proportional, nonzero held-down commands');

// Use actual height under the aircraft, not absolute world altitude or a roof
// above an indoor flight. Thin strips and genuine skylight gaps stay distinct.
close(supportingSurfaceHeight(0,0,100),0);
close(supportingSurfaceHeight(5000,-5000,50),SEA_LEVEL);
close(supportingSurfaceHeight(-40,30,9),7.2);
close(supportingSurfaceHeight(-40,30,3),0);
close(supportingSurfaceHeight(-49,30,9),0);
close(supportingSurfaceHeight(-51,12,3),2);
close(supportingSurfaceHeight(32,76,6),5.21);
close(supportingSurfaceHeight(32,76,3),0);
close(supportingSurfaceHeight(1825,-120,8),4);
const hillHeight=groundHeight(0,2400);
assert(hillHeight>100);
close(supportingSurfaceHeight(0,2400,hillHeight+5),hillHeight);
const landResult=stepVertical(airborne(5),-1,.1);
for(const state of [airborne(SEA_LEVEL+5,5000,-5000),airborne(hillHeight+5,0,2400),airborne(7.2+5,-40,30)]){
  const result=stepVertical(state,-1,.1);
  close(result.vz,landResult.vz);close(result.dz,landResult.dz);
}
const insideResult=stepVertical(airborne(3,-40,30),-1,.1);
const openResult=stepVertical(airborne(3),-1,.1);
close(insideResult.vz,openResult.vz);close(insideResult.dz,openResult.dz);
console.log('PASS: terrain, water, roofs, cargo, pier, tunnel and indoor supporting-surface clearance');

// The pure helper does not teleport, mutate state, or apply collision itself.
const original=airborne(20,0,0,-8),snapshot={...original};
const motion=stepVertical(original,-1,.03);
assert.deepEqual(original,snapshot);
assert(motion.dz<0);
assert.deepEqual(stepVertical(original,-1,0),{vz:-8,dz:0});
assert.throws(()=>stepVertical(original,-1,-.1),RangeError);
assert.throws(()=>stepVertical(original,-1,NaN),RangeError);
assert.throws(()=>stepVertical(original,-1,Infinity),RangeError);
assert.deepEqual(stepVertical(original,-99,.02),stepVertical(original,-1,.02));
assert.deepEqual(stepVertical(original,NaN,.02),stepVertical(original,0,.02));
for(const dt of [1/30,1/60,1/144,1/240,.2]){
  const state=advance(airborne(30),-1,4,dt);
  close(state.z,4.14,.01);close(state.vz,-4.19,.01);
  const fixed=advance(airborne(100,0,0,5),-1,2,dt);
  const reference=advance(airborne(100,0,0,5),-1,2,1/120);
  close(fixed.z,reference.z,1e-9);close(fixed.vz,reference.vz,1e-9);
}
console.log('PASS: pure update, zero/invalid timesteps, normalized controls and 30–240 Hz stability');

// End-to-end: the real FlightState must use the new path for keyboard and touch.
function flight(z=100,x=0,y=0){const state=new FlightState();state.paused=false;Object.assign(state,{x,y,z});return state}
const keyboard=flight(),touch=flight();
for(let i=0;i<120;i++){
  keyboard.step(1/60,new Set(['KeyS']));
  touch.step(1/60,new Set(),{throttle:-1});
}
assert(keyboard.vz< -7.98,'FlightState must use stepVertical');
close(keyboard.z,touch.z);close(keyboard.vz,touch.vz);
const tilted=flight();
for(let i=0;i<120;i++)tilted.step(1/60,new Set(['KeyS','ArrowUp','ArrowRight']));
close(tilted.z,keyboard.z,1e-8);close(tilted.vz,keyboard.vz,1e-8);
console.log('PASS: integrated keyboard/touch descent and full authority while banked');

const aircraft=Object.keys(FLIGHT_PROFILES).map(id=>{const state=flight(200);state.setAircraft(id);return state});
assert.equal(aircraft.length,5);
for(const [lift,seconds] of [[1,3],[-1,2],[0,1]]){
  for(let i=0;i<seconds*60;i++)for(const state of aircraft)state.step(1/60,new Set(),{throttle:lift,pitch:.8,roll:.6,yaw:.2});
  for(const state of aircraft){close(state.z,aircraft[0].z,1e-8);close(state.vz,aircraft[0].vz,1e-8)}
}
assert(Math.abs(aircraft[0].vz)<.04);
console.log('PASS: all five actual aircraft share climb, reversal, descent and release while banked');

const land=flight(4),sea=flight(SEA_LEVEL+4,5000,-5000);
let seaWarning=false;
for(let i=0;i<600&&!land.crashed;i++)land.step(1/120,new Set(['KeyS']));
assert(land.crashed&&!land.ditched,'full held down must still permit a hard land impact');
for(let i=0;i<1200&&!sea.crashed;i++){
  sea.step(1/120,new Set(),{throttle:-.2});
  if(lowAltitudeWarning(sea))seaWarning=true;
}
assert(isOverWater(sea.x,sea.y));
assert(sea.crashed&&sea.ditched,'held partial descent must still ditch at sea level');
assert(seaWarning,'slow water approach must still show the pre-impact altitude warning');
const roof=flight(10,-40,30);
let hitRoof=false;
for(let i=0;i<600&&!hitRoof;i++){
  const before=[roof.x,roof.y,roof.z];
  roof.step(1/120,new Set(['KeyS']));
  hitRoof=segmentHitsSolid(before,[roof.x,roof.y,roof.z]);
}
assert(hitRoof,'held descent must still intersect physical roofs');
assert(roof.z>7&&roof.z<7.3);
const indoors=flight(3,-40,30),outside=flight(3);
for(let i=0;i<60;i++){
  indoors.step(1/120,new Set(),{throttle:-.2});
  outside.step(1/120,new Set(),{throttle:-.2});
}
close(indoors.z,outside.z);close(indoors.vz,outside.vz);
assert(indoors.z<3&&!indoors.crashed);
console.log('PASS: held-input hard impact, low-stick ditching/warning, physical roof contact and indoor descent');

assert(VERTICAL_FLIGHT.nearSurfaceDescentSpeed>3,'ground collision threshold must remain reachable');
