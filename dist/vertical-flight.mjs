import {supportingSurfaceHeight} from './stage.mjs';

// Shared stabilized vertical controls, in metres and seconds. Full down remains
// fast enough to crash on land: proximity assistance never lands or hovers for
// the pilot, and every nonzero stick input still commands vertical movement.
export const VERTICAL_FLIGHT=Object.freeze({
  climbSpeed:5,
  descentSpeed:8,
  nearSurfaceDescentSpeed:3.4,
  precisionClearance:1,
  fullDescentClearance:18,
  commandResponse:3.6,
  releaseResponse:6,
  commandAcceleration:16,
  releaseAcceleration:20,
  contactOffset:.08,
  maxSubstep:1/120,
  // High air: above fastClearance the climb/descent limits grow with height
  // so returning from a high-altitude transit takes seconds, not a minute.
  // Descent follows a braking curve (descentBrake) back to the low-air limit,
  // so a held full descent slows by itself before the near-surface zone.
  fastClearance:30,
  maxDescentSpeed:36,
  descentBrake:5,
  maxClimbSpeed:25,
  climbGain:4,
  maxAcceleration:40,
});

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function verticalTarget(lift,clearance){
  const c=VERTICAL_FLIGHT;lift=clamp(lift,-1,1);
  const high=Math.max(0,clearance-c.fastClearance);
  // v² = v0² + 2·a·h: a constant-deceleration curve back to the low-air limit,
  // so following it never needs more than descentBrake (no kink at 30 m).
  if(lift>=0)return lift*Math.min(c.maxClimbSpeed,Math.sqrt(c.climbSpeed**2+2*c.climbGain*high));
  if(high>0)return lift*Math.min(c.maxDescentSpeed,Math.sqrt(c.descentSpeed**2+2*c.descentBrake*high));
  const blend=clamp((clearance-c.precisionClearance)/(c.fullDescentClearance-c.precisionClearance),0,1);
  const smooth=blend*blend*(3-2*blend);
  return lift*(c.nearSurfaceDescentSpeed+(c.descentSpeed-c.nearSurfaceDescentSpeed)*smooth);
}

// Integrate a first-order velocity controller exactly, including its bounded
// acceleration phase. This makes reversal and release independent of fps and
// avoids an instant velocity change near a roof or when the stick is released.
function advance(vz,target,dt,response,acceleration){
  const error=target-vz,direction=Math.sign(error),linearError=acceleration/response;
  const linearTime=Math.min(dt,Math.max(0,(Math.abs(error)-linearError)/acceleration));
  const afterLinear=vz+direction*acceleration*linearTime;
  const tailTime=dt-linearTime,decay=Math.exp(-response*tailTime);
  const dz=vz*linearTime+direction*acceleration*linearTime*linearTime/2+target*tailTime+(afterLinear-target)*(1-decay)/response;
  return {vz:target+(afterLinear-target)*decay,dz};
}

// Pure update: the caller applies both returned fields once, then runs its
// normal ground/water/solid collision handling. Horizontal flight and aircraft
// identity do not change the pilot's shared climb/descend controls.
export function stepVertical(state,lift,dt){
  if(!Number.isFinite(dt)||dt<0)throw new RangeError('Vertical timestep must be finite and nonnegative');
  if(!Number.isFinite(lift))lift=0;
  lift=clamp(lift,-1,1);
  let vz=state.vz,dz=0;
  if(dt===0)return {vz,dz};
  const surface=supportingSurfaceHeight(state.x,state.y,state.z);
  const released=lift===0;
  const response=released?VERTICAL_FLIGHT.releaseResponse:VERTICAL_FLIGHT.commandResponse;
  const steps=Math.ceil(dt/VERTICAL_FLIGHT.maxSubstep),h=dt/steps;
  for(let i=0;i<steps;i++){
    // Faster vertical speeds brake harder, so a release or reversal from a
    // high-air descent does not overshoot by tens of metres. At or below the
    // low-air limits (8 m/s) the original 20 / 16 m/s² are unchanged.
    const fast=Math.abs(vz),acceleration=Math.min(VERTICAL_FLIGHT.maxAcceleration,released?Math.max(VERTICAL_FLIGHT.releaseAcceleration,VERTICAL_FLIGHT.releaseAcceleration*fast/VERTICAL_FLIGHT.descentSpeed):Math.max(VERTICAL_FLIGHT.commandAcceleration,2*fast));
    const clearance=Math.max(0,state.z+dz-surface-VERTICAL_FLIGHT.contactOffset);
    const next=advance(vz,verticalTarget(lift,clearance),h,response,acceleration);
    vz=next.vz;dz+=next.dz;
  }
  return {vz,dz};
}
