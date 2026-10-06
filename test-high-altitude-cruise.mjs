import assert from 'node:assert/strict';
import {FlightState} from './dist/flight.mjs';
import {FLIGHT_PROFILES} from './dist/flight-profiles.mjs';
import {HORIZONTAL_CRUISE,cruiseClearance} from './dist/horizontal-cruise.mjs';
import {groundHeight,REGIONS,REGION_ELEVATIONS,FLIGHT_HALF} from './dist/world.mjs';
import {PrecisionMission} from './dist/precision-missions.mjs';
import {segmentHitsSolid} from './dist/stage.mjs';
const empty=new Set(),profiles=Object.entries(FLIGHT_PROFILES);
function start(id='whoop75',altitude=120){const s=new FlightState();s.setAircraft(id);Object.assign(s,{paused:false,x:5000,y:-5000,z:groundHeight(5000,-5000)+altitude});return s}
function advance(s,seconds,axes={},fps=60,keys=empty){for(let i=0;i<Math.round(seconds*fps);i++)for(let j=0;j<2;j++)s.step(1/fps/2,keys,axes,false);return s}
const horizontal=s=>Math.hypot(s.vx,s.vy),rows=[];
for(const [id,p] of profiles){
 const lowReference=advance(start(id,5),8,{pitch:1},144);
 const highReference=advance(start(id),8,{pitch:1},144);
 for(const fps of [30,60,144])for(const altitude of [5,120]){
  const s=advance(start(id,altitude),8,{pitch:1},fps),reference=altitude===5?lowReference:highReference;
  assert(Math.abs(s.vy-reference.vy)<.025,`${id}/${fps}/${altitude}: speed invariance`);
  assert(Math.abs(s.y-reference.y)<.15,`${id}/${fps}/${altitude}: distance invariance`);
  assert.equal(s.cruiseBlend,altitude===5?0:1);
  const diagonal=advance(start(id,altitude),8,{pitch:Math.SQRT1_2,roll:Math.SQRT1_2},fps);
  const keyboard=advance(start(id,altitude),8,{},fps,new Set(['ArrowUp','ArrowRight']));
  assert(Math.abs(horizontal(diagonal)-s.vy)<1e-8,'analog diagonal norm');
  assert(Math.abs(horizontal(keyboard)-s.vy)<1e-8,'keyboard diagonal norm');
  rows.push({id,fps,altitude,speed:s.vy,distance:s.y+5000});
  const releaseY=s.y,releaseSpeed=s.vy;advance(s,2,{},fps);
  assert.equal(s.cruiseBlend,0);assert(s.vy<releaseSpeed*.18,'frame-rate release braking');
  assert(s.y-releaseY<(altitude===5?16:135),'frame-rate release distance');
  const descent=advance(start(id,altitude),8,{pitch:1},fps),descentSpeed=descent.vy;
  advance(descent,1/fps,{pitch:1,throttle:-1},fps);assert.equal(descent.cruiseBlend,0);
  assert(descent.vy>descentSpeed-40,'frame-rate descent has no velocity snap');
 }
 assert(highReference.vy>19*lowReference.vy,'substantially faster actual high flight');
 const top=advance(start(id),30,{pitch:1}),limit=16*p.topSpeed;
 assert(top.vy<=20*limit+1e-9&&top.vy>19.99*limit,'bounded actual high cruise');
 const y=top.y,v=top.vy;advance(top,2);
 assert.equal(top.cruiseBlend,0);assert.equal(top.cruiseHold,0);
 assert(top.vy<v*.15,'release removes at least 85% of speed in 2 seconds');
 assert(top.y-y<135,'release travel under135m for every aircraft at full high cruise');
 const reverse=advance(start(id),30,{pitch:1}),reverseY=reverse.y;
 let time=0,maxY=reverseY;
 while(reverse.vy>0&&time<5){advance(reverse,1/60,{pitch:-1});time+=1/60;maxY=Math.max(maxY,reverse.y);assert.equal(reverse.cruiseBlend,0,'reverse brakes without travel assist')}
 assert(time<3.2,'reverse stops under3.2s');assert(maxY-reverseY<150,'reverse overshoot under150m');
 advance(reverse,4,{pitch:-1});assert(reverse.vy<-10,'reverse remains pilot controlled');
 const down=advance(start(id),30,{pitch:1}),before=down.vy;
 advance(down,1/60,{pitch:1,throttle:-1});
 assert.equal(down.cruiseBlend,0,'descent immediately disables boost');
 assert(down.vy<before&&down.vy>before-20,'no one-frame cruise-to-low cap snap');
 advance(down,3,{pitch:1,throttle:-1});assert(down.vy<=limit+1e-8,'descend sheds excess horizontal speed');
 advance(down,.2,{pitch:1});assert.equal(down.cruiseBlend,0,'releasing descent does not latch old cruise intent');
 const small=advance(start(id),30,{pitch:1});advance(small,3,{pitch:.4});assert.equal(small.cruiseBlend,0);assert(horizontal(small)<16,'small input returns toward precision flight');
 const quick=advance(start(id),.3,{pitch:1});assert.equal(quick.cruiseBlend,0,'brief push does not engage');
 const climb=advance(start(id),30,{pitch:1,roll:1,throttle:1});assert(horizontal(climb)<=20*limit+1e-9,'climbing diagonal norm cap');
 const edge=advance(start(id),30,{pitch:1});edge.x=FLIGHT_HALF;edge.vx=-20*limit;edge.vy=0;edge.roll=-.5;
 advance(edge,1/60,{roll:-1});assert(horizontal(edge)<=20*limit+1e-9,'boundary cannot bypass maximum envelope');
 rows.push({id,releaseSpeed:top.vy,releaseDistance:top.y-y,reverseStopSeconds:time,reverseDistance:maxY-reverseY});
}
// Rounded golden close-range values measured before high-altitude assistance.
const lowGolden={whoop75:[14.831,80.845],micro65:[13.783,78.712],scout85:[15.706,82.335],racer90:[17.376,94.077],cine95:[13.791,73.854]};
for(const [id,[speed,distance]] of Object.entries(lowGolden)){
 const s=advance(start(id,5),8,{pitch:1});assert(Math.abs(s.vy-speed)<.002);assert(Math.abs(s.y+5000-distance)<.002);
}
for(const index of [0,2,3,4,6]){
 const r=REGIONS[index],s=start();s.x=r.x;s.y=r.y;s.z=groundHeight(s.x,s.y)+20;
 advance(s,.5,{pitch:1});assert.equal(s.cruiseBlend,0,`${r.id}: local terrain clearance`);
}
const under=start();Object.assign(under,{x:-920,y:1090,z:REGION_ELEVATIONS[2]+29,vx:0,vy:40});
assert(cruiseClearance(under,0,1)<30,'under-viaduct high-world-Z is precision flight');
const overhead=start();Object.assign(overhead,{x:-1550,y:1830,z:REGION_ELEVATIONS[6]+65,vx:0,vy:40});
assert(cruiseClearance(overhead,0,1)<0,'overhead turbine nacelle inhibits open-air cruise');
const roof=start();Object.assign(roof,{x:-40,y:-25,z:37,vx:0,vy:40});
assert(cruiseClearance(roof,0,1)<HORIZONTAL_CRUISE.startClearance,'roof ahead reduces clearance before crossing its edge');
const crane=start();Object.assign(crane,{x:1807.5,y:-270,z:65,vx:0,vy:250});
assert(cruiseClearance(crane,0,1)<30,'thin crane ahead inhibits cruise');
const side=start();Object.assign(side,crane);assert(cruiseClearance(side,1,0)<30,'existing forward momentum is checked while steering sideways');
const ridge=start();Object.assign(ridge,{x:-900,y:650,z:groundHeight(-900,650)+65,vx:0,vy:250});
assert(cruiseClearance(ridge,0,1)<ridge.z-groundHeight(ridge.x,ridge.y)-5,'rising terrain ahead reduces usable clearance');
assert(segmentHitsSolid([1807.5,-200,REGION_ELEVATIONS[1]+37],[1807.5,-100,REGION_ELEVATIONS[1]+37]),'existing swept solid collision remains active');
for(const action of ['reset','relocate','retry','teleport','aircraft']){
 const s=advance(start(),15,{pitch:1});assert.equal(s.cruiseBlend,1);
 if(action==='reset')s.reset();
 if(action==='relocate')s.relocate(2);
 if(action==='retry'){const m=new PrecisionMission();m.start(s,5);m.retry(s)}
 if(action==='teleport'){s.x+=1000;advance(s,1/60,{pitch:1})}
 if(action==='aircraft')s.setAircraft('micro65');
 assert.equal(s.cruiseBlend,0,`${action}: boost reset`);assert(s.cruiseHold<.02,`${action}: intent reset`);
}
const paused=advance(start(),5,{pitch:1});paused.paused=true;const saved=JSON.stringify(paused);advance(paused,1,{pitch:1});assert.equal(JSON.stringify(paused),saved,'pause freezes all dynamics');paused.paused=false;advance(paused,1/60);assert.equal(paused.cruiseBlend,0,'cleared input exits cruise on resume');
console.log('PASS: 5 aircraft × low/high AGL ×30/60/144Hz; real travel, diagonal normalization, climb/boundary bounds, release/reverse/descent, precision, terrain/solids/bridge foresight, reset/retry/relocation/teleport and pause');
console.log(JSON.stringify(rows,null,2));
