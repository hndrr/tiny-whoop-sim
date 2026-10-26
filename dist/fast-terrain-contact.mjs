import {groundHeight} from './world.mjs';

// Preserve original close-range endpoint handling. Fast movement also checks
// intervening terrain, then bisects the first contact bracket. Solid collision
// remains an exact swept segment in main; this terrain sweep is sampled.
export const TERRAIN_SWEEP_SPACING=.75;
export function fastTerrainContact(before,after){
  const dx=after[0]-before[0],dy=after[1]-before[1],dz=after[2]-before[2];
  const distance=Math.hypot(dx,dy);
  if(distance<=1)return null;
  const at=t=>[before[0]+dx*t,before[1]+dy*t,before[2]+dz*t];
  const below=p=>p[2]<groundHeight(p[0],p[1])+.08;
  const samples=Math.ceil(distance/TERRAIN_SWEEP_SPACING);
  for(let i=1;i<=samples;i++){
    if(!below(at(i/samples)))continue;
    let low=(i-1)/samples,high=i/samples;
    for(let n=0;n<10;n++){const middle=(low+high)/2;if(below(at(middle)))high=middle;else low=middle}
    const contact=at(high);contact[2]=groundHeight(contact[0],contact[1])+.08;
    return contact;
  }
  return null;
}
