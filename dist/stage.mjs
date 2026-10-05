import {WORLD_OBJECTS} from './world.mjs';
// Geometry and collision share one source of truth. Units are metres.
export const SOLIDS=[];
const solid=(position,size,material)=>SOLIDS.push({position,size,material});
function hangar(cx,cy,w,d,h){
 const t=.3,door=12,doorHeight=5.4;
 solid([cx,cy,-.12],[w,d,.2],'floor');
 // Open portals at both ends of the east-west fly-through axis.
 for(const side of [-1,1]){const x=cx+side*w/2;for(const sy of [-1,1])solid([x,cy+sy*(d+door)/4,h/2],[t,(d-door)/2,h],'wall');solid([x,cy,(h+doorHeight)/2],[t,door,h-doorHeight],'wall')}
 // North and south walls have a real open window at drone scale.
 for(const side of [-1,1]){const y=cy+side*d/2;for(const sx of [-1,1])solid([cx+sx*(w+6)/4,y,h/2],[(w-6)/2,t,h],'wall');solid([cx,y,1],[6,t,2],'wall');solid([cx,y,(h+5.5)/2],[6,t,h-5.5],'wall')}
 // Roof has three narrow skylight strips, which remain open.
 for(let x=cx-w/2+3;x<cx+w/2;x+=6)solid([x,cy,h+.1],[4.8,d+.6,.2],'roof');
 for(let y=cy-d/2+2;y<cy+d/2;y+=6){for(const side of [-1,1])solid([cx+side*(w/2-.65),y,h/2],[.18,.22,h],'steel');solid([cx,y,h-.2],[w,.14,.2],'steel')}
 for(const side of [-1,1])for(let j=0;j<3;j++){solid([cx+side*(w/2-4),cy-d/2+4+j*3,1],[3,2.4,2],'crate')}
}
hangar(-40,30,30,44,7);hangar(-42,80,44,24,8);
// A traversable three-sided service tunnel links the north apron to the courtyard.
for(const x of [28,36])solid([x,76,2.5],[.28,24,5],'wall');solid([32,76,5.1],[8.5,24,.22],'roof');solid([32,76,-.12],[8,24,.2],'floor');
// Cargo islands leave wide racing alleys between them.
for(const [x,y] of [[64,25],[64,48],[84,42],[92,10]]){solid([x,y,1.3],[7,3,2.6],'container');solid([x,y,2.63],[7.1,3.1,.08],'roof')}
// Control tower and low pier barriers are physical obstacles too.
solid([-79,106,5],[7,7,10],'wall');solid([-79,106,11],[10,10,2.2],'glass');solid([-79,106,12.3],[10.7,10.7,.25],'roof');
const COLLISION_SOLIDS=[...SOLIDS,...WORLD_OBJECTS];
export function segmentHitsSolid(a,b,padding=.05){
 for(const o of COLLISION_SOLIDS){let enter=0,exit=1;for(let axis=0;axis<3;axis++){const min=o.position[axis]-o.size[axis]/2-padding,max=o.position[axis]+o.size[axis]/2+padding,d=b[axis]-a[axis];if(Math.abs(d)<1e-9){if(a[axis]<min||a[axis]>max){enter=2;break}}else{let u=(min-a[axis])/d,v=(max-a[axis])/d;if(u>v)[u,v]=[v,u];enter=Math.max(enter,u);exit=Math.min(exit,v);if(enter>exit)break}}if(enter<=exit&&enter<=1&&exit>=0)return true}return false;
}
