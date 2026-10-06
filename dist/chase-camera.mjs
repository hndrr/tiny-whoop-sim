// Keep translation locked to the aircraft; ease only the heading of the boom.
// Smoothing world position instead adds a speed-dependent following distance.
export const CHASE_CAMERA=Object.freeze({back:.8,height:.4,lookAhead:.15,aimHeight:.025,yawRate:7,teleportDistance:8});
const shortestAngle=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
export function createChaseCamera(){
 let heading=null,lastX=0,lastY=0,lastZ=0;
 return {
  reset(){heading=null},
  update(camera,state,dt){
   const {back,height,lookAhead,aimHeight,yawRate,teleportDistance}=CHASE_CAMERA;
   const step=Number.isFinite(dt)?Math.max(0,Math.min(dt,.05)):0;
   // Explicit lifecycle resets handle nearby retries; this also catches direct
   // world relocations without ever sweeping the camera between old/new places.
   if(heading===null||Math.hypot(state.x-lastX,state.y-lastY,state.z-lastZ)>teleportDistance)heading=state.heading;
   else heading+=shortestAngle(state.heading-heading)*(1-Math.exp(-step*yawRate));
   heading=shortestAngle(heading);lastX=state.x;lastY=state.y;lastZ=state.z;
   const sin=Math.sin(heading),cos=Math.cos(heading);
   camera.position.set(state.x+sin*back,state.y-cos*back,state.z+height);
   camera.up.set(0,0,1);
   // Match the boom's smoothed heading to retain the same forward composition
   // and projection depth through turns, rather than zooming or scaling meshes.
   camera.lookAt(state.x-sin*lookAhead,state.y+cos*lookAhead,state.z+aimHeight);
  }
 };
}
