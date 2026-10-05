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
});

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function verticalTarget(lift,clearance){
  lift=clamp(lift,-1,1);
  if(lift>=0)return lift*VERTICAL_FLIGHT.climbSpeed;
  const blend=clamp((clearance-VERTICAL_FLIGHT.precisionClearance)/(VERTICAL_FLIGHT.fullDescentClearance-VERTICAL_FLIGHT.precisionClearance),0,1);
  const smooth=blend*blend*(3-2*blend);
  return lift*(VERTICAL_FLIGHT.nearSurfaceDescentSpeed+(VERTICAL_FLIGHT.descentSpeed-VERTICAL_FLIGHT.nearSurfaceDescentSpeed)*smooth);
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
  const acceleration=released?VERTICAL_FLIGHT.releaseAcceleration:VERTICAL_FLIGHT.commandAcceleration;
  const steps=Math.ceil(dt/VERTICAL_FLIGHT.maxSubstep),h=dt/steps;
  for(let i=0;i<steps;i++){
    const clearance=Math.max(0,state.z+dz-surface-VERTICAL_FLIGHT.contactOffset);
    const next=advance(vz,verticalTarget(lift,clearance),h,response,acceleration);
    vz=next.vz;dz+=next.dz;
  }
  return {vz,dz};
}
