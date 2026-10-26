// A loose external camera: turns reveal the airframe's side and bank, while
// translation gets a small, bounded trail instead of an ever-growing gap.
export const CHASE_CAMERA=Object.freeze({back:.8,height:.4,lookAhead:.15,aimHeight:.025,yawRate:2.1,motionRate:5,trailSeconds:.04,maxTrail:.22,teleportDistance:8});
const shortestAngle=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
export function createChaseCamera(){
 let heading=null,lastX=0,lastY=0,lastZ=0,lastSpeed=0,trailX=0,trailY=0,trailZ=0;
 return {
  reset(){heading=null},
  update(camera,state,dt){
   const {back,height,lookAhead,aimHeight,yawRate,motionRate,trailSeconds,maxTrail,teleportDistance}=CHASE_CAMERA;
   const step=Number.isFinite(dt)?Math.max(0,Math.min(dt,.05)):0;
   const dx=state.x-lastX,dy=state.y-lastY,dz=state.z-lastZ;
   // Use actual world speed, not the independently scaled HUD indication.
   // Fast travel can legitimately cross more than 8 m in a rendered frame.
   const speed=Number.isFinite(state.speed)?Math.max(0,state.speed):Math.hypot(state.vx??0,state.vy??0,state.vz??0);
   const ordinaryTravel=Math.max(speed,lastSpeed)*step*1.5;
   if(heading===null||Math.hypot(dx,dy,dz)>teleportDistance+ordinaryTravel){
    heading=state.heading;trailX=trailY=trailZ=0;
   }else{
    // Deliberately leave a readable angular lag; the aircraft visibly rotates
    // in the shot before the camera catches up. Never bank with the aircraft.
    heading+=shortestAngle(state.heading-heading)*(1-Math.exp(-step*yawRate));
    if(step>0){
     const length=Math.hypot(dx,dy,dz),factor=length?Math.min(trailSeconds/step,maxTrail/length):0;
     const mix=1-Math.exp(-step*motionRate);
     trailX+=(-dx*factor-trailX)*mix;trailY+=(-dy*factor-trailY)*mix;trailZ+=(-dz*factor-trailZ)*mix;
    }
   }
   heading=shortestAngle(heading);lastX=state.x;lastY=state.y;lastZ=state.z;lastSpeed=speed;
   camera.position.set(state.x+Math.sin(heading)*back+trailX,state.y-Math.cos(heading)*back+trailY,state.z+height+trailZ);
   camera.up.set(0,0,1);
   // Look slightly ahead along the aircraft's current heading, independently
   // of the slower boom. This allows lateral screen motion during a turn.
   camera.lookAt(state.x-Math.sin(state.heading)*lookAhead,state.y+Math.cos(state.heading)*lookAhead,state.z+aimHeight);
  }
 };
}
