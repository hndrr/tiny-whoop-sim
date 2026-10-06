import {groundHeight,WORLD_OBJECTS,FLIGHT_HALF} from './world.mjs';
import {SOLIDS} from './stage.mjs';

// Deliberate open-air travel assistance, in metres and seconds. The original
// close-range flight model remains exact below 30 m of usable clearance.
export const HORIZONTAL_CRUISE=Object.freeze({
  startClearance:30,
  fullClearance:90,
  speedMultiplier:20,
  responseMultiplier:2.4,
  recoveryDamping:1.8,
  startStick:.8,
  intentDelay:.4,
  intentRamp:1.2,
  lookAheadSeconds:.25,
  lookAheadMinimum:20,
  corridorPadding:8,
  terrainSampleSpacing:8,
  terrainLookAheadMargin:4,
  recoveryDeceleration:240,
});
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t)};
const obstacles=[...SOLIDS,...WORLD_OBJECTS].map(o=>({
  minX:o.position[0]-o.size[0]/2-HORIZONTAL_CRUISE.corridorPadding,
  maxX:o.position[0]+o.size[0]/2+HORIZONTAL_CRUISE.corridorPadding,
  minY:o.position[1]-o.size[1]/2-HORIZONTAL_CRUISE.corridorPadding,
  maxY:o.position[1]+o.size[1]/2+HORIZONTAL_CRUISE.corridorPadding,
  top:o.position[2]+o.size[2]/2,
}));

// Exact swept XY corridor for solids: even a thin crane/bridge deck between
// terrain samples inhibits assistance. An overhead deck is not open air.
function crosses(a,b,min,max,start,end){
  const delta=b-a;
  if(Math.abs(delta)<1e-9)return a<min||a>max?null:[start,end];
  const u=(min-a)/delta,v=(max-a)/delta;
  start=Math.max(start,Math.min(u,v));end=Math.min(end,Math.max(u,v));
  return start<=end?[start,end]:null;
}
export function cruiseClearance(state,directionX,directionY){
  let surface=groundHeight(state.x,state.y);
  if(state.z-surface<=HORIZONTAL_CRUISE.startClearance)return state.z-surface;
  const speed=Math.hypot(state.vx,state.vy);
  const deceleration=HORIZONTAL_CRUISE.recoveryDeceleration*(state.profile?.acceleration??1);
  const distance=HORIZONTAL_CRUISE.lookAheadMinimum+speed*HORIZONTAL_CRUISE.lookAheadSeconds+speed*speed/(2*deceleration);
  const paths=[[directionX,directionY]];
  // Also inspect momentum's path while steering across it.
  if(speed>1&&(state.vx*directionX+state.vy*directionY)/speed<.999)paths.push([state.vx/speed,state.vy/speed]);
  for(const [dx,dy] of paths){
    const endX=state.x+dx*distance,endY=state.y+dy*distance;
    // Shed outward travel speed before the original soft boundary spring.
    const edge=FLIGHT_HALF-300;
    if((dx>0&&endX>edge)||(dx<0&&endX< -edge)||(dy>0&&endY>edge)||(dy<0&&endY< -edge))return 0;
    const samples=Math.ceil(distance/HORIZONTAL_CRUISE.terrainSampleSpacing);
    for(let i=1;i<=samples;i++)surface=Math.max(surface,groundHeight(state.x+dx*distance*i/samples,state.y+dy*distance*i/samples)+HORIZONTAL_CRUISE.terrainLookAheadMargin);
    for(const o of obstacles){
      if(o.top<=surface)continue;
      const x=crosses(state.x,endX,o.minX,o.maxX,0,1);
      if(x&&crosses(state.y,endY,o.minY,o.maxY,x[0],x[1]))surface=Math.max(surface,o.top);
    }
  }
  return state.z-surface;
}
export function resetCruise(state){
  state.cruiseHold=0;state.cruiseBlend=0;
  state.cruiseDirectionX=0;state.cruiseDirectionY=0;
  state.cruisePosition=null;
}
export function stepCruise(state,input,stick,directionX,directionY,dt){
  // Resets and mission retries clear this explicitly. Position discontinuities
  // also discard intent, so a future direct teleport cannot carry cruise over.
  if(state.cruisePosition&&Math.hypot(state.x-state.cruisePosition[0],state.y-state.cruisePosition[1],state.z-state.cruisePosition[2])>1e-6)resetCruise(state);
  const speed=Math.hypot(state.vx,state.vy);
  const alignment=speed>1?(state.vx*directionX+state.vy*directionY)/speed:1;
  const directionChange=state.cruiseDirectionX*directionX+state.cruiseDirectionY*directionY;
  const descending=input.throttle<0||state.vz<-.5;
  if(stick<=HORIZONTAL_CRUISE.startStick||descending||Math.abs(input.yaw)>.25||alignment<.8||directionChange<.9)state.cruiseHold=0;
  const canBuild=stick>HORIZONTAL_CRUISE.startStick&&!descending&&Math.abs(input.yaw)<=.25&&alignment>=.8;
  const clearance=canBuild?cruiseClearance(state,directionX,directionY):0;
  if(canBuild&&clearance>HORIZONTAL_CRUISE.startClearance)state.cruiseHold=Math.min(HORIZONTAL_CRUISE.intentDelay+HORIZONTAL_CRUISE.intentRamp+1,state.cruiseHold+dt);
  else state.cruiseHold=0;
  state.cruiseDirectionX=directionX;state.cruiseDirectionY=directionY;
  const height=smooth((clearance-HORIZONTAL_CRUISE.startClearance)/(HORIZONTAL_CRUISE.fullClearance-HORIZONTAL_CRUISE.startClearance));
  const intent=smooth((state.cruiseHold-dt/2-HORIZONTAL_CRUISE.intentDelay)/HORIZONTAL_CRUISE.intentRamp);
  state.cruiseBlend=height*intent*smooth((stick-HORIZONTAL_CRUISE.startStick)/(1-HORIZONTAL_CRUISE.startStick))*smooth((alignment-.8)/.2);
  return state.cruiseBlend;
}
export function rememberCruisePosition(state){state.cruisePosition=[state.x,state.y,state.z]}
