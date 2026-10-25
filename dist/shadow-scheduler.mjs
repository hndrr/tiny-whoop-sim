// Static world shadows are re-rendered only when the light frame is re-centred
// or a dynamic caster can change them. The frame is snapped to whole shadow
// texels in light space, so re-centring never makes static edges shimmer.
export const SHADOW_SCHEDULE=Object.freeze({offset:[-80,-95,140],recenterRadius:16,dynamicClearance:40});
export function createShadowScheduler(renderer,sun,{offset=SHADOW_SCHEDULE.offset,recenterRadius=SHADOW_SCHEDULE.recenterRadius,dynamicClearance=SHADOW_SCHEDULE.dynamicClearance}={}){
 const shadowMap=renderer.shadowMap;shadowMap.autoUpdate=false;shadowMap.needsUpdate=true;
 // Light basis matches Object3D.lookAt for a camera at target+offset.
 const length=Math.hypot(...offset),z=offset.map(v=>v/length),up=sun.shadow.camera.up.toArray();
 let x=[up[1]*z[2]-up[2]*z[1],up[2]*z[0]-up[0]*z[2],up[0]*z[1]-up[1]*z[0]];
 const xl=Math.hypot(...x);x=x.map(v=>v/xl);
 const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
 const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
 let center=null,pending=true,updates=0,casterVisible=null;const casterPose=[NaN,NaN,NaN,NaN,NaN,NaN];
 // Hiding or moving the caster changes the map; a parked caster does not.
 function casterChanged(o){
  if(!o)return {changed:false,visibility:false};
  const visibility=o.visible!==casterVisible;casterVisible=o.visible;let changed=visibility;
  if(o.visible){const p=o.position,r=o.rotation,now=[p.x,p.y,p.z,r.x,r.y,r.z];for(let i=0;i<6;i++){if(now[i]!==casterPose[i])changed=true;casterPose[i]=now[i]}}
  return {changed,visibility};
 }
 function texel(){const c=sun.shadow.camera;return (c.right-c.left)/sun.shadow.mapSize.x}
 function place(px,py,pz){
  const p=[px,py,pz],t=texel(),du=Math.round(dot(p,x)/t)*t-dot(p,x),dv=Math.round(dot(p,y)/t)*t-dot(p,y);
  center=[px,py,pz];
  const c=[0,1,2].map(i=>p[i]+x[i]*du+y[i]*dv);
  sun.target.position.set(c[0],c[1],c[2]);sun.position.set(c[0]+offset[0],c[1]+offset[1],c[2]+offset[2]);
  sun.target.updateMatrixWorld();sun.updateMatrixWorld();
 }
 return {
  // caster: the airframe. Its shadow reads only near the ground; FPV hides it,
  // and that visibility change alone triggers one update to remove it.
  update(position,{caster=null,clearance=Infinity}={}){
   const moved=!center||Math.hypot(position.x-center[0],position.y-center[1],position.z-center[2])>recenterRadius;
   if(moved)place(position.x,position.y,position.z);
   const {changed,visibility}=casterChanged(caster);
   if(moved||pending||visibility||(changed&&clearance<dynamicClearance)){shadowMap.needsUpdate=true;pending=false;updates++}
  },
  invalidate(){pending=true},
  reset(){center=null;pending=true},
  get updates(){return updates},
  get center(){return center&&[...center]}
 };
}
