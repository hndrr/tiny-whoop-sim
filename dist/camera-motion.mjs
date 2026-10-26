// Camera life on top of the exact FPV mount and chase framing: motor
// vibration, low-level turbulence, a little bank follow and speed-dependent
// field of view for chase. Rotations only, so the FPV mount and the chase
// distance bounds are unchanged; reduced motion turns all of it off.
// The FPV camera is hard-mounted: turbulence moves the whole aircraft, not the
// lens against its own ducts, so FPV keeps only a sub-pixel pitch vibration.
export const CAMERA_MOTION=Object.freeze({fpvFov:105,chaseFov:72,chaseFovGain:10,fovSpeed:[6,40],fovSeconds:.45,bankFollow:.15,
 vibration:{fpv:.0008,chase:.0009,hz:[41,57,73]},turbulence:{fpv:0,chase:.006,ground:6,speed:30},rateSeconds:.08,rateDeadzone:.03});
const wave=(t,a,b,c)=>Math.sin(t*a)*.5+Math.sin(t*b+1.3)*.3+Math.sin(t*c+2.1)*.2;
export function createCameraMotion(){
 let fov=null,time=0,lastFpv=null;const out={yawRate:0,pitchRate:0,shake:0};let lastYaw=null,lastPitch=null,yawRate=0,pitchRate=0;
 return {output:out,
  apply(camera,dt,state,{fpv,reducedMotion=false,clearance=10}){
   const step=Math.max(0,Math.min(dt,.05));time+=step;
   const base=fpv?CAMERA_MOTION.fpvFov:CAMERA_MOTION.chaseFov,speed=Math.hypot(state.vx??0,state.vy??0,state.vz??0);
   if(lastFpv!==fpv){fov=base;lastFpv=fpv;lastYaw=null}
   let target=base;
   if(!fpv&&!reducedMotion){const [a,b]=CAMERA_MOTION.fovSpeed,t=Math.min(1,Math.max(0,(speed-a)/(b-a)));target+=CAMERA_MOTION.chaseFovGain*t*t*(3-2*t)}
   fov+=(target-fov)*(1-Math.exp(-step/CAMERA_MOTION.fovSeconds));
   if(Math.abs(camera.fov-fov)>1e-6){camera.fov=fov;camera.updateProjectionMatrix()}
   out.shake=0;
   if(!reducedMotion&&!state.paused&&!state.crashed){
    const vib=(fpv?CAMERA_MOTION.vibration.fpv:CAMERA_MOTION.vibration.chase)*(.35+(state.throttle??.5));
    const low=Math.max(0,1-clearance/CAMERA_MOTION.turbulence.ground),fast=Math.min(1,speed/CAMERA_MOTION.turbulence.speed);
    const gust=(fpv?CAMERA_MOTION.turbulence.fpv:CAMERA_MOTION.turbulence.chase)*Math.max(low*.8,fast*.6);
    const [h1,h2,h3]=CAMERA_MOTION.vibration.hz;
    camera.rotateX(vib*wave(time,h1,h2,h3)+gust*wave(time,2.3,3.7,5.9));
    if(!fpv)camera.rotateY(vib*wave(time+3,h2,h3,h1)+gust*wave(time+7,1.9,3.1,4.7));
    out.shake=vib+gust;
   }
   if(!fpv&&!reducedMotion)camera.rotateZ(-(state.roll??0)*CAMERA_MOTION.bankFollow);
   // Angular rates feed the rolling-shutter skew and rotation blur. Raw frame
   // differences flicker with frame-time jitter, so they are low-passed and
   // tiny rates are dropped before they reach the picture.
   const yaw=state.heading??0,pitch=state.pitch??0;
   if(lastYaw!==null&&step>0){const k=1-Math.exp(-step/CAMERA_MOTION.rateSeconds);yawRate+=(Math.atan2(Math.sin(yaw-lastYaw),Math.cos(yaw-lastYaw))/step-yawRate)*k;pitchRate+=((pitch-lastPitch)/step-pitchRate)*k}else yawRate=pitchRate=0;
   lastYaw=yaw;lastPitch=pitch;
   const dead=r=>Math.abs(r)<CAMERA_MOTION.rateDeadzone?0:r;out.yawRate=dead(yawRate);out.pitchRate=dead(pitchRate);
   if(reducedMotion)out.yawRate=out.pitchRate=0;
   return out;
  },
  reset(){lastFpv=null;lastYaw=null}};
}
