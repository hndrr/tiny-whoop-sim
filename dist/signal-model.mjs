// Analog video link from the pilot at the airfield pad to the aircraft. Range
// and line-of-sight obstruction (buildings, hills) degrade the picture; this
// drives visual breakup only. No fabricated RSSI or link numbers are shown.
export const SIGNAL=Object.freeze({pilot:[0,-6,1.6],rangeStart:1500,rangeFull:5000,rangeLoss:.3,solidLoss:.16,terrainLoss:.3,attack:.12,release:.7,samples:10});
export function linkLoss(position,{segmentHitsSolid=()=>false,terrainHeight=()=>-Infinity}={}){
 const [px,py,pz]=SIGNAL.pilot,dx=position.x-px,dy=position.y-py,dz=position.z-pz,range=Math.hypot(dx,dy,dz);
 const t=Math.min(1,Math.max(0,(range-SIGNAL.rangeStart)/(SIGNAL.rangeFull-SIGNAL.rangeStart)));
 let loss=SIGNAL.rangeLoss*t*t*(3-2*t),blockedByTerrain=false;
 // Hills: sample the sight line and compare with the ground beneath it.
 for(let i=1;i<SIGNAL.samples;i++){const f=i/SIGNAL.samples;if(terrainHeight(px+dx*f,py+dy*f)>pz+dz*f+.5){blockedByTerrain=true;break}}
 if(blockedByTerrain)loss+=SIGNAL.terrainLoss;
 else if(range<900&&segmentHitsSolid(SIGNAL.pilot,[position.x,position.y,position.z]))loss+=SIGNAL.solidLoss;
 return Math.min(1,loss);
}
export function createSignalModel(world){
 let level=0;
 return {get level(){return level},
  update(dt,state){
   const target=state.crashed?0:linkLoss(state,world),seconds=target>level?SIGNAL.attack:SIGNAL.release;
   level+=(target-level)*(1-Math.exp(-Math.max(0,dt)/seconds));return level;
  },
  reset(){level=0}};
}
