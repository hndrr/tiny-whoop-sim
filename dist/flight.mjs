import {HORIZONTAL_CRUISE,resetCruise,stepCruise,rememberCruisePosition} from './horizontal-cruise.mjs';
import {stepVertical} from './vertical-flight.mjs';
import {getFlightProfile} from './flight-profiles.mjs';
import {controlInput} from './controls.mjs';
import {boundaryAcceleration,groundHeight,isOverWater,REGIONS,regionSpawn} from './world.mjs';
export const GATES=[[0,12,2.4],[0,30,3.4],[-14,30,3],[-28,30,2.7],[-42,30,2.7],[-58,30,3],[-72,80,3.2],[-60,80,3.2],[-42,80,3.2],[-18,80,3.2],[10,95,5],[32,96,3],[32,86,2.5],[32,60,2.5],[66,65,4],[81,26,3],[44,2,3],[18,-5,2.6]];
export class FlightState {
 constructor(){this.setAircraft('whoop75');this.reset()}
 setAircraft(id){this.aircraft=getFlightProfile(id).id;resetCruise(this)}
 get profile(){return getFlightProfile(this.aircraft)}
 reset(){resetCruise(this);Object.assign(this,{x:0,y:0,z:1.2,vx:0,vy:0,vz:0,speed:0,throttle:.5,pitch:0,roll:0,heading:0,crashed:false,paused:true,gate:0,elapsed:0,complete:false,finishTime:null,explore:false,region:0,ditched:false,practiceEnabled:true,practiceCount:0,ringFlash:GATES.map(()=>0),ringLatched:GATES.map(()=>false),ringCooldown:GATES.map(()=>0)})}
 relocate(index){const r=REGIONS[index];if(!r)throw Error("Unknown area");this.reset();[this.x,this.y,this.z]=regionSpawn(index);this.region=index;this.explore=index!==0}
 // Forgiving, bidirectional practice: retain the original 1.6 m acceptance radius.
 // A swept segment prevents fast passes from skipping a ring between frames.
 updatePractice(before,dt,enabled=this.practiceEnabled){
  if(!enabled||!this.practiceEnabled||this.paused||this.crashed)return;
  const after=[this.x,this.y,this.z],delta=after.map((v,i)=>v-before[i]);
  const length2=delta.reduce((sum,v)=>sum+v*v,0);
  GATES.forEach((g,i)=>{
   this.ringFlash[i]=Math.max(0,this.ringFlash[i]-dt);
   this.ringCooldown[i]=Math.max(0,this.ringCooldown[i]-dt);
   const startDistance=Math.hypot(...before.map((v,j)=>v-g[j]));
   if(this.ringLatched[i]&&startDistance>2.2)this.ringLatched[i]=false;
   const t=length2?Math.max(0,Math.min(1,g.reduce((sum,v,j)=>sum+(v-before[j])*delta[j],0)/length2)):0;
   const distance=Math.hypot(...g.map((v,j)=>before[j]+t*delta[j]-v));
   if(distance<1.6&&!this.ringLatched[i]){
    this.ringLatched[i]=true;
    if(this.ringCooldown[i]===0){this.practiceCount++;this.ringFlash[i]=1.2;this.ringCooldown[i]=.65}
   }
  });
 }
 step(dt,keys,axes={},practice=true){
  if(this.paused||this.crashed)return;
  dt=Math.min(dt,.03);
  if(this.practiceEnabled)this.elapsed+=dt;
  const before=[this.x,this.y,this.z];
  const input=controlInput(keys,axes),profile=this.profile,mix=1-Math.exp(-dt*6*profile.response);
  // A round right-stick envelope gives keyboard diagonals the same thrust
  // as pointer sticks. Gentle inputs keep their original linear precision.
  const stickLength=Math.hypot(input.pitch,input.roll),stickScale=1/Math.max(1,stickLength);
  const halfMix=1-Math.exp(-dt*3*profile.response);
  const forcePitch=this.pitch+(-input.pitch*stickScale*.5-this.pitch)*halfMix;
  const forceRoll=this.roll+(input.roll*stickScale*.5-this.roll)*halfMix;
  const oldVx=this.vx,oldVy=this.vy;
  this.pitch+=(-input.pitch*stickScale*.5-this.pitch)*mix;
  this.roll+=(input.roll*stickScale*.5-this.roll)*mix;
  this.heading+=dt*1.35*profile.response*input.yaw;
  const lift=input.throttle;
  this.throttle=.5+lift*.35;
  const bank=Math.hypot(forceRoll,forcePitch),sin=Math.sin(this.heading),cos=Math.cos(this.heading);
  const directionX=bank?(cos*forceRoll+sin*forcePitch)/bank:0;
  const directionY=bank?(sin*forceRoll-cos*forcePitch)/bank:0;
  let force=Math.tan(bank)*(9.81+lift*8*Math.cos(bank))*profile.acceleration;
  const stick=Math.min(1,stickLength),speed=Math.hypot(this.vx,this.vy);
  // Arcade self-level assistance: release brakes promptly, while a sustained
  // large stick deflection reduces cruise damping and builds real velocity.
  // Small steering corrections retain the familiar drag and thrust response.
  const cruise=Math.max(0,(stick-.65)/.35);
  const neutral=Math.max(0,1-stick/.12);
  const requestedX=cos*input.roll+sin*-input.pitch,requestedY=sin*input.roll-cos*-input.pitch;
  const cruiseBlend=stepCruise(this,input,stick,stickLength?requestedX/stickLength:0,stickLength?requestedY/stickLength:0,dt);
  force*=1+(HORIZONTAL_CRUISE.speedMultiplier-1)*cruiseBlend;
  const opposition=speed&&stickLength?Math.max(0,-(this.vx*requestedX+this.vy*requestedY)/(speed*stickLength)):0;
  const damping=(.45-.115*cruise+.75*neutral+.5*opposition*Math.min(1,stick/.12))*profile.acceleration/profile.topSpeed;
  // Exact constant-force drag integration avoids frame-dependent damping.
  const drag=Math.exp(-dt*damping),impulse=(1-drag)/damping;
  this.vx=this.vx*drag+directionX*force*impulse;
  this.vy=this.vy*drag+directionY*force*impulse;
  const vertical=stepVertical(this,lift,dt);
  this.vz=vertical.vz;
  const edge=boundaryAcceleration(this.x,this.y);
  this.vx+=edge[0]*dt;this.vy+=edge[1]*dt;
  // One horizontal norm bound, including climb and boundary forces. When the
  // open-air envelope shrinks, shed existing travel speed over time rather
  // than snapping velocity back to the close-range cap in a single frame.
  const horizontalSpeed=Math.hypot(this.vx,this.vy);
  const targetLimit=16*profile.topSpeed*(1+(HORIZONTAL_CRUISE.speedMultiplier-1)*cruiseBlend);
  const limit=Math.max(targetLimit,speed-HORIZONTAL_CRUISE.recoveryDeceleration*profile.acceleration*dt);
  if(horizontalSpeed>limit){this.vx*=limit/horizontalSpeed;this.vy*=limit/horizontalSpeed}
  this.x+=(oldVx+this.vx)*.5*dt;this.y+=(oldVy+this.vy)*.5*dt;this.z+=vertical.dz;
  this.speed=Math.hypot(this.vx,this.vy,this.vz);
  const floor=groundHeight(this.x,this.y)+.08;
  if(this.z<floor){
   if(isOverWater(this.x,this.y)){this.crashed=true;this.ditched=true}
   if(Math.abs(this.vz)>3||this.speed>5)this.crashed=true;
   this.z=floor;this.vz=0;this.vx*=.9;this.vy*=.9;
  }
  rememberCruisePosition(this);
  if(practice)this.updatePractice(before,dt);
 }
}
